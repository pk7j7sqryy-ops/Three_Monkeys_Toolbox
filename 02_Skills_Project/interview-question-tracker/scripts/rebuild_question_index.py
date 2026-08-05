#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path

START = "<!-- QUESTION-INDEX:START -->"
END = "<!-- QUESTION-INDEX:END -->"
CATEGORY_RE = re.compile(r"^## ([一二三四五六七八九]、.+?)\s*$")
BOLD_QUESTION_RE = re.compile(r"^\*\*Q(\d+):\s*(.+?)\*\*\s*(?:`|$)")
HEADING_QUESTION_RE = re.compile(r"^### Q(\d+)\.\s*(.+?)\s*$")
LAST_UPDATED_RE = re.compile(r"^\*最后更新:\s*(\d{4}-\d{2}-\d{2})\*\s*$", re.MULTILINE)
LEGACY_STATS_RE = re.compile(
    r"\n## 累计统计\n.*?\n\*最后更新:\s*\d{4}-\d{2}-\d{2}\*\s*$", re.DOTALL
)
STAT_LABELS = {
    "一、Python": "Python",
    "二、操作系统": "操作系统",
    "三、数据库": "数据库",
    "四、Docker & 容器化": "Docker",
    "五、大模型（LLM）": "大模型",
    "六、Agent & 工具编排": "Agent",
    "七、机器学习 & 强化学习": "机器学习/强化学习",
    "八、深度学习": "深度学习",
    "九、网络安全（本行优势）": "网络安全",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rebuild the categorized question-only List at the top of 面试问题集.md."
    )
    parser.add_argument("file", type=Path)
    parser.add_argument("--check", action="store_true", help="Fail if the generated List is stale")
    parser.add_argument("--updated-date", help="Date shown in the generated statistics, YYYY-MM-DD")
    return parser.parse_args()


def extract_questions(text: str) -> list[tuple[str, list[tuple[int, str]]]]:
    categories: list[tuple[str, list[tuple[int, str]]]] = []
    current: list[tuple[int, str]] | None = None
    in_comment = False

    for line in text.splitlines():
        if "<!--" in line:
            in_comment = True
        if not in_comment:
            category = CATEGORY_RE.match(line)
            if category:
                current = []
                categories.append((category.group(1), current))
                continue

            question = BOLD_QUESTION_RE.match(line) or HEADING_QUESTION_RE.match(line)
            if question and current is not None:
                title = question.group(2).strip().rstrip("？?") + "？"
                current.append((int(question.group(1)), title))

        if "-->" in line:
            in_comment = False

    return categories


def render_index(
    categories: list[tuple[str, list[tuple[int, str]]]], updated_date: str
) -> str:
    total = sum(len(questions) for _, questions in categories)
    lines = [
        START,
        "## 累计统计",
        "",
        "| 分类 | 问题数 |",
        "|------|--------|",
    ]
    for category, questions in categories:
        lines.append(f"| {STAT_LABELS.get(category, category)} | {len(questions)} |")
    lines.extend([
        f"| **总计** | **{total}** |",
        "",
        f"*最后更新: {updated_date}*",
        "",
        "## 问题速查 List",
        "",
        "> 自动生成，仅列问题用于快速自测；详细要点见下方对应分类。",
    ])
    for category, questions in categories:
        if not questions:
            continue
        lines.extend(["", f"### {category}", ""])
        lines.extend(f"- Q{number}：{title}" for number, title in questions)
    lines.extend(["", END])
    return "\n".join(lines)


def replace_index(text: str, block: str) -> str:
    if START in text or END in text:
        if text.count(START) != 1 or text.count(END) != 1:
            raise ValueError("QUESTION-INDEX markers must appear exactly once")
        before, rest = text.split(START, 1)
        _, after = rest.split(END, 1)
        return (before.rstrip() + "\n\n" + block + "\n\n" + after.lstrip()).rstrip() + "\n"

    lines = text.splitlines()
    heading = next((i for i, line in enumerate(lines) if line == "# 面试问题集"), None)
    if heading is None:
        raise ValueError("Missing '# 面试问题集' heading")
    insert_at = heading + 1
    while insert_at < len(lines) and not lines[insert_at].strip():
        insert_at += 1
    new_lines = lines[: heading + 1] + ["", block, ""] + lines[insert_at:]
    return "\n".join(new_lines).rstrip() + "\n"


def main() -> int:
    args = parse_args()
    original = args.file.read_text(encoding="utf-8")
    existing_date = LAST_UPDATED_RE.search(original)
    updated_date = args.updated_date or (existing_date.group(1) if existing_date else date.today().isoformat())
    categories = extract_questions(original)
    without_legacy_stats = LEGACY_STATS_RE.sub("\n", original)
    updated = replace_index(without_legacy_stats, render_index(categories, updated_date))
    if args.check:
        if updated != original:
            print(f"stale question List: {args.file}")
            return 1
        print(f"question List is current: {args.file}")
        return 0
    args.file.write_text(updated, encoding="utf-8")
    print(f"rebuilt statistics and question List: {args.file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
