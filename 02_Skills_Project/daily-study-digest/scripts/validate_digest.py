#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REQUIRED_FIELDS = {
    "title", "type", "tags", "related", "study_date", "source_dir",
    "source_count", "manifest", "created", "updated",
}
REQUIRED_SECTIONS = [
    "## 🧠 今日思维导图",
    "## 📚 理论：理解技术",
    "## 💻 实操：会使用技术",
    "## 📎 来源与覆盖",
    "## 🤖 AI 总结",
    "## ✍️ 个人总结",
]
LEGACY_USER_PROMPTS = [
    "这个技术是什么？",
    "为什么使用这个技术？",
    "这个技术怎么使用？",
    "它和相似技术有什么区别？",
    "今天最容易出错的地方是什么？",
    "如果面试官继续追问，我哪里还回答不清楚？",
]
V2_USER_PROMPTS = [
    "用一句话串起今天的学习主线",
    "今天最重要的 1～3 个技术分别是什么？",
    "什么场景下不该使用？",
    "实际使用时最容易犯什么错误？如何排查？",
    "不看代码，写出核心步骤或伪代码",
    "今天还有什么没有真正理解？下一步如何验证？",
    "掌握度自评",
]
USER_V2 = "<!-- DAILY-DIGEST:USER:VERSION:2 -->"
AI_START = "<!-- DAILY-DIGEST:AI:START -->"
AI_END = "<!-- DAILY-DIGEST:AI:END -->"
USER_START = "<!-- DAILY-DIGEST:USER:START -->"
USER_END = "<!-- DAILY-DIGEST:USER:END -->"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a daily study digest.")
    parser.add_argument("digest", type=Path)
    parser.add_argument("--previous-digest", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--strict", action="store_true", help="Treat warnings as errors")
    parser.add_argument("--max-lines", type=int, default=250)
    parser.add_argument("--max-code-lines", type=int, default=40)
    parser.add_argument(
        "--allow-empty-user-migration",
        action="store_true",
        help="Allow replacing a completely blank legacy USER region with the v2 template",
    )
    return parser.parse_args()


def region(text: str, start: str, end: str) -> str | None:
    if text.count(start) != 1 or text.count(end) != 1:
        return None
    begin = text.index(start)
    finish = text.index(end) + len(end)
    return text[begin:finish]


def frontmatter(text: str) -> tuple[str | None, dict[str, str]]:
    match = re.match(r"\A---\r?\n(.*?)\r?\n---\r?\n", text, re.S)
    if not match:
        return None, {}
    raw = match.group(1)
    fields = {
        key: value.strip().strip("\"'")
        for key, value in re.findall(r"(?m)^([A-Za-z_][\w-]*):\s*(.*?)\s*$", raw)
    }
    return raw, fields


def mermaid_block(text: str) -> str | None:
    match = re.search(r"```mermaid\s*\n(.*?)```", text, re.S)
    return match.group(1) if match else None


def user_region_has_answers(user: str) -> bool:
    structural_prefixes = (
        "<!--", "##", "###", "####", "> 请", "- [ ]",
        "- 是什么：", "- 解决什么问题：", "- 为什么选择它：",
        "- 怎么使用（输入 → 处理 → 输出）：",
    )
    for line in user.splitlines():
        value = line.strip()
        if not value or value == ">" or value.startswith(structural_prefixes):
            continue
        return True
    return False


def validate(
    path: Path,
    previous: Path | None,
    manifest_path: Path | None,
    max_lines: int,
    max_code_lines: int,
    allow_empty_user_migration: bool,
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return [f"cannot read UTF-8 digest: {exc}"], []

    raw_fm, fields = frontmatter(text)
    if raw_fm is None:
        errors.append("missing or malformed YAML frontmatter")
    else:
        missing = sorted(REQUIRED_FIELDS - fields.keys())
        if missing:
            errors.append("missing frontmatter fields: " + ", ".join(missing))
        if fields.get("type") != "daily-digest":
            errors.append("frontmatter type must be daily-digest")
        if re.search(r"(?m)^related:\s*\[\[[^\n]+", raw_fm):
            errors.append("related must be valid YAML, not inline unquoted wikilinks")

    positions: list[int] = []
    for section in REQUIRED_SECTIONS:
        if text.count(section) != 1:
            errors.append(f"section must appear exactly once: {section}")
        else:
            positions.append(text.index(section))
    if len(positions) == len(REQUIRED_SECTIONS) and positions != sorted(positions):
        errors.append("required sections are out of order")

    markers = [AI_START, AI_END, USER_START, USER_END]
    if any(text.count(marker) != 1 for marker in markers):
        errors.append("AI/USER managed markers must each appear exactly once")
    elif not (text.index(AI_START) < text.index(AI_END) < text.index(USER_START) < text.index(USER_END)):
        errors.append("AI/USER managed markers are out of order")
    else:
        between_managed_regions = text[text.index(AI_END) + len(AI_END):text.index(USER_START)]
        if between_managed_regions.strip():
            errors.append("personal summary must immediately follow AI summary")

    summary_heading = "## 🤖 AI 总结"
    if text.count(summary_heading) == 1 and text.count(AI_END) == 1:
        summary_body = text[text.index(summary_heading) + len(summary_heading):text.index(AI_END)]
        images = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", summary_body)
        if len(images) != 1:
            errors.append("AI summary must contain exactly one image")
        else:
            image_target = images[0].strip().strip("<>")
            if "://" in image_target:
                errors.append("AI summary image must be a local file")
            elif "{{" not in image_target:
                image_path = (path.parent / image_target.split("#", 1)[0]).resolve()
                if not image_path.is_file():
                    errors.append(f"AI summary image does not exist: {image_target}")
        remainder = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", summary_body, count=1).strip()
        if remainder:
            errors.append("AI summary must contain only the summary image")
        if "60 秒面试表达" in summary_body:
            errors.append("AI summary must not contain a 60-second interview script")

    user = region(text, USER_START, USER_END)
    if user is None:
        errors.append("cannot identify protected USER region")
    else:
        prompts = V2_USER_PROMPTS if USER_V2 in user else LEGACY_USER_PROMPTS
        for prompt in prompts:
            if prompt not in user:
                errors.append(f"missing personal-summary prompt: {prompt}")

    if previous:
        try:
            old_text = previous.read_text(encoding="utf-8")
            old_user = region(old_text, USER_START, USER_END)
            if old_user is None:
                errors.append("previous digest has no valid USER region")
            elif user != old_user and not (
                allow_empty_user_migration
                and USER_V2 in (user or "")
                and USER_V2 not in old_user
                and not user_region_has_answers(old_user)
            ):
                errors.append("protected USER region changed from previous digest")
        except (OSError, UnicodeDecodeError) as exc:
            errors.append(f"cannot read previous digest: {exc}")

    mermaid = mermaid_block(text)
    if mermaid is None:
        errors.append("missing Mermaid code block")
    else:
        if not re.search(r"(?m)^\s*flowchart\s+LR\s*$", mermaid):
            errors.append("Mermaid diagram must use flowchart LR")
        node_ids = set(re.findall(r"\b([A-Za-z][\w-]*)\s*\[", mermaid))
        if len(node_ids) < 5:
            warnings.append(f"Mermaid has only {len(node_ids)} explicit nodes")
        if len(node_ids) > 20:
            warnings.append(f"Mermaid has {len(node_ids)} nodes; expected at most 20")

    if text.count("```") % 2:
        errors.append("unbalanced fenced code blocks")
    if len(text.splitlines()) > max_lines:
        warnings.append(f"digest has {len(text.splitlines())} lines; target is at most {max_lines}")

    for match in re.finditer(r"```([^\n]*)\n(.*?)```", text, re.S):
        language = match.group(1).strip()
        lines = match.group(2).splitlines()
        if language != "mermaid" and not language:
            warnings.append("code block without language label")
        if language != "mermaid" and len(lines) > max_code_lines:
            warnings.append(f"{language or 'unlabeled'} code block has {len(lines)} lines")

    for line_number, line in enumerate(text.splitlines(), 1):
        if not line.lstrip().startswith("|"):
            continue
        for code in re.findall(r"`([^`]*)`", line):
            if re.search(r"(?<!\\)\|", code):
                errors.append(f"unescaped | inside table code span at line {line_number}")

    if re.search(r"(?:/Users/|/home/[^/]+/|[A-Za-z]:\\Users\\)", text):
        errors.append("digest contains a local absolute user path")

    if manifest_path:
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            expected = int(manifest["source_count"])
            actual = int(fields.get("source_count", "-1"))
            if expected != actual:
                errors.append(f"source_count mismatch: frontmatter={actual}, manifest={expected}")
            if ".mmap" in manifest.get("extensions", []):
                if "脑图审读：" not in text:
                    errors.append("mmap source requires a 脑图审读 coverage entry")
                if not re.search(r"相关图片(?:已)?审读\s*[:：]?\s*\d+\s*/\s*\d+", text):
                    errors.append("mmap coverage must report 相关图片已审读 N/N")
        except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
            errors.append(f"invalid manifest: {exc}")

    return errors, warnings


def main() -> int:
    args = parse_args()
    if not args.digest.is_file():
        print(f"ERROR: digest does not exist: {args.digest}")
        return 2
    errors, warnings = validate(
        args.digest,
        args.previous_digest,
        args.manifest,
        args.max_lines,
        args.max_code_lines,
        args.allow_empty_user_migration,
    )
    for message in errors:
        print(f"ERROR: {message}")
    for message in warnings:
        print(f"WARNING: {message}")
    print(f"validation: {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors or (args.strict and warnings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
