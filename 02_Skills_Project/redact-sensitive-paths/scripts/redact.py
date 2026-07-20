#!/usr/bin/env python3
"""
redact.py — 推送前脱敏扫描器(零依赖,只用 Python 标准库)

模式:
  scan    扫描仓库,报告敏感信息命中(默认)
  apply   自动替换为占位符,生成映射表
  restore 显示映射表,提示用 git 恢复
  rules   列出当前规则与白名单
  init    在仓库根创建 .redact/ 配置骨架(本地配置,自动 gitignore)

用法:
  python3 redact.py scan --repo /path/to/repo
  python3 redact.py apply --repo /path/to/repo [--dry-run]
  python3 redact.py restore --repo /path/to/repo
  python3 redact.py rules
  python3 redact.py init --repo /path/to/repo

退出码(scan):
  0 = 干净
  1 = REVIEW(本地路径/用户名/邮箱等,需人工确认)
  2 = BLOCK(API key/token/私钥等高危,禁止推送)
"""

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# ========== 规则定义 ==========
# 每条规则:命中模式 → 替换为占位符
# severity: REVIEW = 需人工确认(可能是设计文档示例)
#           BLOCK  = 高危命中,必须处理

DEFAULT_RULES = [
    # —— 路径类 ——
    {
        "id": "PATH-MAC",
        "severity": "REVIEW",
        "pattern": r"/Users/[a-zA-Z0-9_.-]+/",
        "replacement": "~/",
        "description": "macOS 用户家目录绝对路径",
    },
    {
        "id": "PATH-LINUX",
        "severity": "REVIEW",
        "pattern": r"/home/[a-zA-Z0-9_.-]+/",
        "replacement": "~/",
        "description": "Linux 用户家目录绝对路径",
    },
    {
        "id": "PATH-WIN",
        "severity": "REVIEW",
        "pattern": r"[A-Z]:\\\\Users\\\\[a-zA-Z0-9_.-]+\\\\",
        "replacement": "%USERPROFILE%\\\\",
        "description": "Windows 用户目录绝对路径",
    },
    # —— 身份信息 ——
    {
        "id": "EMAIL-QQ",
        "severity": "REVIEW",
        "pattern": r"\b[0-9]{5,11}@qq\.com\b",
        "replacement": "$EMAIL",
        "description": "QQ 数字邮箱",
    },
    # —— 密钥/Token(BLOCK)——
    {
        "id": "API-KEY-OPENAI",
        "severity": "BLOCK",
        "pattern": r"\bsk-[A-Za-z0-9]{20,}\b",
        "replacement": "<REDACTED-OPENAI-KEY>",
        "description": "OpenAI API key",
    },
    {
        "id": "API-KEY-GITHUB",
        "severity": "BLOCK",
        "pattern": r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b",
        "replacement": "<REDACTED-GITHUB-TOKEN>",
        "description": "GitHub token",
    },
    {
        "id": "API-KEY-AWS",
        "severity": "BLOCK",
        "pattern": r"\bAKIA[0-9A-Z]{16}\b",
        "replacement": "<REDACTED-AWS-KEY>",
        "description": "AWS access key id",
    },
    {
        "id": "PRIVATE-KEY-PEM",
        "severity": "BLOCK",
        "pattern": r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----",
        "replacement": "<REDACTED-PRIVATE-KEY>",
        "description": "PEM 格式私钥头部",
    },
    {
        "id": "JWT-TOKEN",
        "severity": "BLOCK",
        "pattern": r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b",
        "replacement": "<REDACTED-JWT>",
        "description": "JWT token",
    },
]

# 默认白名单:这些路径下的文件默认跳过
# 设计文档里常有 192.168.x.x 这种示例 IP,白名单避免误报
# 工具自身的说明文档(列举敏感模式作为示例)也加白名单
DEFAULT_WHITELIST = [
    "**/docs/design/**",
    "**/docs/reference/**",
    "**/docs/testing/**",
    "**/docs/requirements/**",
    "**/.git/**",
    "**/node_modules/**",
    "**/mermaid.min.js",
    "**/*.zip",
    "**/*.jpg",
    "**/*.png",
    "**/*.gif",
    "**/*.pdf",
    "**/.redact/**",
    # 脱敏工具自身的文档(必然列举敏感模式作为示例)
    "**/redact-sensitive-paths/README.md",
    "**/redact-sensitive-paths/SKILL.md",
    # aiagent-covert-channel-scan 的文档(同上,列举隐写示例)
    "**/aiagent-covert-channel-scan/README.md",
    "**/aiagent-covert-channel-scan/SKILL.md",
]

# 只扫描这些扩展名(避免二进制)
TEXT_EXTENSIONS = {
    ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg",
    ".py", ".js", ".ts", ".tsx", ".jsx", ".sh", ".bash", ".zsh",
    ".go", ".rs", ".java", ".kt", ".c", ".cpp", ".h", ".hpp",
    ".rb", ".php", ".swift", ".sql", ".html", ".css", ".xml",
    ".gitignore", ".gitattributes", ".env.example", "Dockerfile",
    ".mdx", ".rst", "",
}

BINARY_CHECK_BYTES = 8192


# ========== 工具函数 ==========

def is_binary(path: Path) -> bool:
    """读前 8KB,如果含 NUL byte 视为二进制"""
    try:
        with open(path, "rb") as f:
            chunk = f.read(BINARY_CHECK_BYTES)
        return b"\x00" in chunk
    except (OSError, IOError):
        return True


def git_ls_files(repo_root: Path) -> list:
    """返回 git 跟踪的文件列表(不在 git 仓库则扫描所有文件)"""
    files = []
    try:
        result = subprocess.run(
            ["git", "ls-files"],
            cwd=str(repo_root),
            capture_output=True, text=True, check=True, timeout=10,
        )
        for line in result.stdout.splitlines():
            line = line.strip()
            if line:
                p = repo_root / line
                if p.exists() and p.is_file():
                    files.append(p)
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        # 不在 git 仓库,fallback 扫描所有
        for p in repo_root.rglob("*"):
            if p.is_file():
                files.append(p)
    return files


def match_any_glob(rel_path: str, patterns: list) -> bool:
    """简单的 glob 匹配,支持 ** 跨目录"""
    for pat in patterns:
        # 把 ** 转成 fnmatch 兼容的形式
        # fnmatch 不原生支持 **,这里手动处理
        if "**" in pat:
            # **/x → 任意层级下的 x; x/** → x 下任意层级
            # 转成 .* 形式用 fnmatch.translate 后做正则
            regex_pat = (
                pat.replace("**/", "(.*/)?")
                .replace("/**", "(/.*)?")
                .replace("**", ".*")
            )
            regex_pat = "^" + fnmatch.translate(regex_pat).replace("\\ \\*\\*", ".*") + "$"
            # 上面这种字符串处理不完美,简化策略:
            # 用 pathlib 的 match 也只支持 *,所以直接两层 fnmatch
            pass
        # 简单方案:对 pattern 和 pattern 的 **-剥离版都尝试匹配
        if fnmatch.fnmatch(rel_path, pat):
            return True
        # ** → * 简化匹配
        simple = pat.replace("**/", "").replace("/**", "").replace("**", "*")
        if simple and simple != pat:
            if fnmatch.fnmatch(rel_path, simple):
                return True
        # 把 **/ 转成 */ 的中间形态
        mid = pat.replace("**/", "*/").replace("/**", "/*")
        if mid != pat and fnmatch.fnmatch(rel_path, mid):
            return True
    return False


def compile_rules(rules: list, extra_rules: list = None) -> list:
    """编译规则,返回 [(id, severity, compiled_re, replacement, description)]"""
    out = []
    all_rules = list(rules) + (extra_rules or [])
    for r in all_rules:
        try:
            out.append((
                r["id"],
                r["severity"],
                re.compile(r["pattern"]),
                r["replacement"],
                r.get("description", ""),
            ))
        except re.error as e:
            print(f"⚠️  规则 {r.get('id', '?')} 编译失败:{e}", file=sys.stderr)
    return out


def scan_file(path: Path, rules_compiled, whitelist: list, repo_root: Path) -> list:
    """扫描单个文件,返回命中列表"""
    try:
        rel = str(path.relative_to(repo_root))
    except ValueError:
        rel = str(path)
    if match_any_glob(rel, whitelist):
        return []
    if path.suffix not in TEXT_EXTENSIONS:
        return []
    if is_binary(path):
        return []
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except (OSError, IOError):
        return []
    hits = []
    for line_no, line in enumerate(text.splitlines(), 1):
        for rule_id, sev, regex, repl, desc in rules_compiled:
            for m in regex.finditer(line):
                hits.append({
                    "line": line_no,
                    "rule": rule_id,
                    "severity": sev,
                    "match": m.group(0),
                    "context": line.rstrip()[:200],
                })
    return hits


def load_user_config(repo_root: Path) -> tuple:
    """加载用户自定义规则和白名单(.redact/ 下的配置)"""
    cfg_dir = repo_root / ".redact"
    extra_rules = []
    extra_whitelist = []
    rules_file = cfg_dir / "rules.json"
    if rules_file.exists():
        try:
            data = json.loads(rules_file.read_text(encoding="utf-8"))
            extra_rules = data.get("rules", [])
        except (json.JSONDecodeError, OSError):
            pass
    wl_file = cfg_dir / "whitelist.json"
    if wl_file.exists():
        try:
            data = json.loads(wl_file.read_text(encoding="utf-8"))
            extra_whitelist = data.get("patterns", [])
        except (json.JSONDecodeError, OSError):
            pass
    # 同时支持 .redact/users.json(用户名规则,因为用户名是私有的)
    users_file = cfg_dir / "users.json"
    if users_file.exists():
        try:
            data = json.loads(users_file.read_text(encoding="utf-8"))
            for name in data.get("usernames", []):
                extra_rules.append({
                    "id": f"USER-NAME-{name}",
                    "severity": "REVIEW",
                    "pattern": rf"\b{re.escape(name)}\b",
                    "replacement": "$USER",
                    "description": f"用户名:{name}",
                })
        except (json.JSONDecodeError, OSError):
            pass
    return extra_rules, extra_whitelist


# ========== 命令实现 ==========

def cmd_scan(args) -> int:
    repo = Path(args.repo).resolve()
    if not repo.exists():
        print(f"❌ 仓库路径不存在:{repo}", file=sys.stderr)
        return 2

    extra_rules, extra_wl = load_user_config(repo)
    rules = compile_rules(DEFAULT_RULES, extra_rules)
    whitelist = DEFAULT_WHITELIST + extra_wl

    files = git_ls_files(repo)
    by_severity = {"BLOCK": [], "REVIEW": []}
    scanned = 0
    skipped_binary = 0
    skipped_whitelist = 0

    for path in files:
        try:
            rel = str(path.relative_to(repo))
        except ValueError:
            rel = str(path)
        if match_any_glob(rel, whitelist):
            skipped_whitelist += 1
            continue
        if path.suffix not in TEXT_EXTENSIONS:
            continue
        if is_binary(path):
            skipped_binary += 1
            continue
        scanned += 1
        hits = scan_file(path, rules, whitelist, repo)
        for h in hits:
            entry = {"file": rel, **h}
            by_severity.setdefault(h["severity"], []).append(entry)

    print("═" * 64)
    print(" redact · 推送前脱敏扫描")
    print("═" * 64)
    print(f"扫描范围:{scanned} 个文本文件"
          f"(白名单跳过 {skipped_whitelist},二进制跳过 {skipped_binary})")
    print()

    if by_severity.get("BLOCK"):
        print("⛔ BLOCK —— 高危命中,禁止推送:")
        for e in by_severity["BLOCK"]:
            print(f"  • [{e['rule']}] {e['file']}:{e['line']}")
            print(f"    match: {e['match']}")
            print(f"    line:  {e['context']}")
        print()

    if by_severity.get("REVIEW"):
        print("🔎 REVIEW —— 通常无害,但请确认非真实隐私:")
        for e in by_severity["REVIEW"]:
            print(f"  • [{e['rule']}] {e['file']}:{e['line']}")
            print(f"    match: {e['match']}")
        print()

    if not by_severity.get("BLOCK") and not by_severity.get("REVIEW"):
        print("✅ 干净,可以推送")
        return 0

    print("─" * 64)
    if by_severity.get("BLOCK"):
        print("结论:⛔ 有 BLOCK 命中,必须处理后再推送")
        print("       - 删除/移到 .env(已 gitignore)/改成环境变量")
        print("       - 如果已经推过历史,需 git filter-repo 重写并轮换密钥")
        return 2
    else:
        print("结论:🔎 有 REVIEW 命中,确认无误后可推送")
        print("       若需替换为占位符:python3 redact.py apply --repo <path>")
        return 1


def cmd_apply(args) -> int:
    repo = Path(args.repo).resolve()
    if not repo.exists():
        print(f"❌ 仓库路径不存在:{repo}", file=sys.stderr)
        return 2

    extra_rules, extra_wl = load_user_config(repo)
    rules = compile_rules(DEFAULT_RULES, extra_rules)
    whitelist = DEFAULT_WHITELIST + extra_wl

    files = git_ls_files(repo)
    redact_dir = repo / ".redact"
    redact_dir.mkdir(exist_ok=True)
    map_file = redact_dir / "map.json"

    replacements_log = []
    files_changed = 0
    total_replacements = 0

    for path in files:
        try:
            rel = str(path.relative_to(repo))
        except ValueError:
            rel = str(path)
        if match_any_glob(rel, whitelist):
            continue
        if path.suffix not in TEXT_EXTENSIONS:
            continue
        if is_binary(path):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, IOError):
            continue

        original_text = text
        file_replacements = []
        for rule_id, sev, regex, repl, desc in rules:
            matches = list(regex.finditer(text))
            if not matches:
                continue
            for m in matches:
                file_replacements.append({
                    "rule": rule_id,
                    "severity": sev,
                    "original": m.group(0),
                    "replacement": repl,
                    "line": text[:m.start()].count("\n") + 1,
                })
            text = regex.sub(repl, text)

        if text != original_text:
            if not args.dry_run:
                path.write_text(text, encoding="utf-8")
            replacements_log.append({
                "file": rel,
                "replacements": file_replacements,
            })
            files_changed += 1
            total_replacements += len(file_replacements)

    if not replacements_log:
        print("✅ 无可替换项")
        return 0

    print(f"{'(dry-run) ' if args.dry_run else ''}"
          f"替换了 {files_changed} 个文件中的 {total_replacements} 处:")
    for r in replacements_log:
        print(f"  • {r['file']} ({len(r['replacements'])} 处)")
        for rep in r["replacements"][:5]:
            print(f"      L{rep['line']} [{rep['rule']}] "
                  f"{rep['original'][:60]} → {rep['replacement']}")
        if len(r["replacements"]) > 5:
            print(f"      ... 共 {len(r['replacements'])} 处")

    if not args.dry_run:
        map_data = {
            "version": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "warning": "本文件包含敏感原始值,严禁提交到 git",
            "files_changed": files_changed,
            "total_replacements": total_replacements,
            "replacements": replacements_log,
        }
        map_file.write_text(
            json.dumps(map_data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"\n映射表:{map_file}")
        print("⚠️  此文件包含敏感信息,确认已加入 .gitignore:")
        print(f"     echo '.redact/' >> {repo}/.gitignore")

    return 0


def cmd_restore(args) -> int:
    repo = Path(args.repo).resolve()
    map_file = repo / ".redact" / "map.json"
    if not map_file.exists():
        print(f"❌ 映射表不存在:{map_file}")
        return 1

    map_data = json.loads(map_file.read_text(encoding="utf-8"))
    print("═" * 64)
    print(" restore · 本地恢复提示")
    print("═" * 64)
    print()
    print("⚠️  redact 不支持精确反向替换(占位符可能已多处出现)。")
    print("   推荐用 git 恢复原始版本:")
    print()
    print("   # 恢复单个文件:")
    print(f"     git -C {repo} checkout HEAD -- <相对路径>")
    print()
    print("   # 恢复所有被替换的文件:")
    files = [r["file"] for r in map_data.get("replacements", [])]
    for f in files[:10]:
        print(f"     git -C {repo} checkout HEAD -- {f}")
    if len(files) > 10:
        print(f"     ... 共 {len(files)} 个文件,详见映射表")
    print()
    print(f"映射表:{map_file}")
    print(f"  - 替换时间:{map_data.get('timestamp', '?')}")
    print(f"  - 修改文件:{map_data.get('files_changed', 0)} 个")
    print(f"  - 总替换数:{map_data.get('total_replacements', 0)} 处")
    return 0


def cmd_rules(args) -> int:
    print("═" * 64)
    print(" 当前生效的规则")
    print("═" * 64)
    for r in DEFAULT_RULES:
        print(f"  [{r['severity']:6s}] {r['id']:20s}  {r['description']}")
        print(f"             pattern: {r['pattern']}")
        print(f"             replace: {r['replacement']}")
        print()
    print("─" * 64)
    print(" 白名单(默认跳过):")
    for p in DEFAULT_WHITELIST:
        print(f"  {p}")
    print()
    print(" 自定义规则/白名单:")
    print("  在仓库根创建 .redact/rules.json 或 .redact/whitelist.json")
    print("  详见: redact.py init")
    return 0


def cmd_init(args) -> int:
    repo = Path(args.repo).resolve()
    cfg_dir = repo / ".redact"
    cfg_dir.mkdir(exist_ok=True)

    # 规则模板
    rules_example = {
        "rules": [
            {
                "id": "USER-NAME-CUSTOM",
                "severity": "REVIEW",
                "pattern": r"\b<your-username>\b",
                "replacement": "$USER",
                "description": "自定义用户名(把 <your-username> 换成你的)",
            },
            {
                "id": "INTERNAL-DOMAIN",
                "severity": "REVIEW",
                "pattern": r"\b<your-company>\.internal\b",
                "replacement": "$DOMAIN",
                "description": "内部域名",
            },
        ],
    }
    (cfg_dir / "rules.example.json").write_text(
        json.dumps(rules_example, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 用户名(私有,从 rules 里分离出来单独存)
    users_example = {
        "usernames": ["<your-username>"],
    }
    (cfg_dir / "users.example.json").write_text(
        json.dumps(users_example, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 白名单
    whitelist_example = {
        "patterns": [
            "**/examples/**",
            "**/testdata/**",
        ],
    }
    (cfg_dir / "whitelist.example.json").write_text(
        json.dumps(whitelist_example, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # README
    readme = """# .redact/ — 本地脱敏配置

**此目录必须 gitignore**,因为可能包含用户名等私有信息。

## 文件

| 文件 | 作用 | 是否进 git |
|---|---|---|
| `rules.json` | 自定义脱敏规则(在默认规则基础上叠加) | ❌ gitignore |
| `users.json` | 用户名列表(生成 USER-NAME-* 规则) | ❌ gitignore |
| `whitelist.json` | 自定义白名单 glob(在默认白名单基础上叠加) | ❌ gitignore |
| `map.json` | apply 模式生成的映射表 | ❌ gitignore |
| `*.example.json` | 配置模板(可提交) | ✅ 可提交 |

## 快速开始

```bash
# 1. 复制模板
cp .redact/users.example.json .redact/users.json
cp .redact/whitelist.example.json .redact/whitelist.json

# 2. 编辑 users.json,填入你的用户名
# 3. 扫描
python3 <skill-path>/scripts/redact.py scan --repo .
```

## .gitignore

仓库根的 .gitignore 必须包含:

```
.redact/
!.redact/*.example.json
```
"""
    (cfg_dir / "README.md").write_text(readme, encoding="utf-8")

    # 自动追加 .gitignore
    gitignore = repo / ".gitignore"
    need_lines = [".redact/", "!.redact/*.example.json"]
    if gitignore.exists():
        current = gitignore.read_text(encoding="utf-8")
    else:
        current = ""
    new_lines = [l for l in need_lines if l not in current]
    if new_lines:
        with open(gitignore, "a", encoding="utf-8") as f:
            if current and not current.endswith("\n"):
                f.write("\n")
            for l in new_lines:
                f.write(l + "\n")
        print(f"已追加到 .gitignore: {new_lines}")

    print(f"✅ 配置骨架已创建在 {cfg_dir}")
    print()
    print("下一步:")
    print(f"  1. cp {cfg_dir}/users.example.json {cfg_dir}/users.json")
    print(f"     并把 <your-username> 改成你的真实用户名")
    print(f"  2. python3 scripts/redact.py scan --repo {repo}")
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="推送前脱敏扫描器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s scan --repo .
  %(prog)s apply --repo . --dry-run
  %(prog)s restore --repo .
  %(prog)s rules
  %(prog)s init --repo .
""",
    )
    parser.add_argument("--repo", default=".", help="仓库根目录(默认当前目录)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("scan", help="扫描敏感信息(默认)")
    sub_apply = sub.add_parser("apply", help="自动替换为占位符")
    sub_apply.add_argument("--dry-run", action="store_true", help="只显示,不写入")
    sub.add_parser("restore", help="显示映射表和恢复方法")
    sub.add_parser("rules", help="列出当前规则与白名单")
    sub.add_parser("init", help="在仓库根创建 .redact/ 配置骨架")

    args = parser.parse_args()
    handlers = {
        "scan": cmd_scan,
        "apply": cmd_apply,
        "restore": cmd_restore,
        "rules": cmd_rules,
        "init": cmd_init,
    }
    return handlers[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
