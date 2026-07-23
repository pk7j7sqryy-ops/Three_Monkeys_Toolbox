#!/usr/bin/env bash
# install.sh — 通用 Agent Skill 安装器
#
# 自动检测本机已安装的 AI Agent 客户端,把 skill 安装到对应路径。
# 兼容:TRAE / Claude Code / Codex / Cursor / Cline / Roo Code
#
# 用法:
#   ./install.sh                   # 安装所有 skill
#   ./install.sh <skill-name>      # 只安装指定 skill
#   ./install.sh --list            # 列出可用 skill
#   ./install.sh --detect          # 只检测本机 agent,不安装
#   ./install.sh --target ~/.codex/skills  # 指定目标路径,跳过自动检测
#
# 兼容性说明:
#   - TRAE / Claude Code / Codex:SKILL.md 格式完全通用,直接拷贝即可
#   - Cursor:需要 .cursor/rules/*.mdc 格式转换(本脚本会自动生成)
#   - Cline / Roo Code:生成 .clinerules/<name>.md(用 SKILL.md 正文,去掉 frontmatter)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_ROOT="$SCRIPT_DIR"

# ANSI 颜色
G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; B=$'\033[34m'; D=$'\033[2m'; N=$'\033[0m'

# 各 agent 的 skill 目录(macOS / Linux 通用,Windows 在 PowerShell 里手动 cp)
declare -a AGENT_PATHS=(
  "TRAE|$HOME/.trae-cn/skills"
  "TRAE|$HOME/.trae/skills"
  "Claude Code|$HOME/.claude/skills"
  "Codex|$HOME/.codex/skills"
  "Codex|$HOME/.Codex/skills"
  "Cursor|$HOME/.cursor/rules"
  "Cline|$HOME/.cline/rules"
  "Roo Code|$HOME/.roo/skills"
)

# 不算 skill 的目录(忽略)
SKIP_DIRS=(".git" "node_modules" ".redact" "scripts")

log() { echo "${G}✓${N} $*"; }
warn() { echo "${Y}⚠${N} $*"; }
err() { echo "${R}✗${N} $*" >&2; }
info() { echo "${B}ℹ${N} $*"; }

list_skills() {
  echo "可用 Skills:"
  for d in "$SKILLS_ROOT"/*/; do
    name="$(basename "$d")"
    [[ " ${SKIP_DIRS[*]} " == *" $name "* ]] && continue
    [ -f "$d/SKILL.md" ] || continue
    desc=$(awk '/^description:/{sub(/^description: */,""); gsub(/^"|"$/,""); print; exit}' "$d/SKILL.md" 2>/dev/null || echo "")
    printf "  ${G}%-30s${N} %s\n" "$name" "${desc:0:80}"
  done
}

detect_agents() {
  echo "本机已安装的 Agent 客户端:"
  local found=0
  for entry in "${AGENT_PATHS[@]}"; do
    local agent="${entry%%|*}"
    local path="${entry#*|}"
    if [ -d "$path" ] || [ -d "$(dirname "$path")" ]; then
      log "$agent: $path"
      found=$((found+1))
    fi
  done
  [ $found -eq 0 ] && warn "未检测到任何已知的 agent 客户端"
  return $found
}

# 拷贝到 TRAE/Claude Code/Codex 格式的目录(通用 SKILL.md)
install_to_generic() {
  local skill_name="$1"
  local target_dir="$2"
  local skill_src="$SKILLS_ROOT/$skill_name"

  mkdir -p "$target_dir"
  if [ -d "$target_dir/$skill_name" ]; then
    warn "覆盖已存在的 $target_dir/$skill_name"
    rm -rf "$target_dir/$skill_name"
  fi
  cp -r "$skill_src" "$target_dir/$skill_name"
  # 排除 .git 子目录(如果有)
  rm -rf "$target_dir/$skill_name/.git" 2>/dev/null || true
  log "$skill_name → $target_dir"
}

# 转换 SKILL.md 为 Cursor .mdc 格式
install_to_cursor() {
  local skill_name="$1"
  local target_dir="$2"
  local skill_src="$SKILLS_ROOT/$skill_name"
  local skill_md="$skill_src/SKILL.md"

  [ -f "$skill_md" ] || return 0
  mkdir -p "$target_dir"

  # 生成 .mdc 文件:转换 frontmatter
  local mdc_file="$target_dir/$skill_name.mdc"
  local desc=$(awk '/^description:/{sub(/^description: */,""); gsub(/^"|"$/,""); print; exit}' "$skill_md")

  {
    echo "---"
    echo "description: $desc"
    echo "globs: \"**/*\""
    echo "alwaysApply: false"
    echo "---"
    echo ""
    # 跳过原始 frontmatter,从第一个非 frontmatter 段开始
    awk 'BEGIN{infm=0; printed=0} /^---$/{if(infm==0){infm=1;next}else{infm=0;next}} {if(infm==0)print}' "$skill_md"
  } > "$mdc_file"

  log "$skill_name → $target_dir/$skill_name.mdc ${D}(Cursor 转换)${N}"
}

# 转换 SKILL.md 为 Cline/Roo Code 的纯 markdown 规则
install_to_cline() {
  local skill_name="$1"
  local target_dir="$2"
  local skill_src="$SKILLS_ROOT/$skill_name"
  local skill_md="$skill_src/SKILL.md"

  [ -f "$skill_md" ] || return 0
  mkdir -p "$target_dir"

  local rule_file="$target_dir/$skill_name.md"
  # 去掉 frontmatter,只留正文
  awk 'BEGIN{infm=0} /^---$/{if(infm==0){infm=1;next}else{infm=0;next}} {if(infm==0)print}' "$skill_md" > "$rule_file"
  log "$skill_name → $target_dir/$skill_name.md ${D}(Cline 转换)${N}"
}

install_skill_to_all() {
  local skill_name="$1"
  local skill_src="$SKILLS_ROOT/$skill_name"

  if [ ! -d "$skill_src" ] || [ ! -f "$skill_src/SKILL.md" ]; then
    err "skill 不存在或缺少 SKILL.md: $skill_name"
    return 1
  fi

  echo ""
  echo "${B}安装 $skill_name${N}"

  local installed=0
  for entry in "${AGENT_PATHS[@]}"; do
    local agent="${entry%%|*}"
    local path="${entry#*|}"

    # 检测 agent 是否安装(父目录存在视为已安装)
    if [ ! -d "$(dirname "$path")" ]; then
      continue
    fi

    case "$agent" in
      Cursor)
        install_to_cursor "$skill_name" "$path"
        installed=$((installed+1))
        ;;
      Cline|Roo\ Code)
        install_to_cline "$skill_name" "$path"
        installed=$((installed+1))
        ;;
      *)
        install_to_generic "$skill_name" "$path"
        installed=$((installed+1))
        ;;
    esac
  done

  if [ $installed -eq 0 ]; then
    warn "$skill_name:未检测到任何 agent,用 --target <path> 指定路径"
  fi
}

install_all() {
  local count=0
  for d in "$SKILLS_ROOT"/*/; do
    name="$(basename "$d")"
    [[ " ${SKIP_DIRS[*]} " == *" $name "* ]] && continue
    [ -f "$d/SKILL.md" ] || continue
    install_skill_to_all "$name" && count=$((count+1))
  done
  echo ""
  log "共安装 $count 个 skill"
}

# ========== 入口 ==========
case "${1:-}" in
  --list|-l)
    list_skills
    ;;
  --detect|-d)
    detect_agents
    ;;
  --target|-t)
    [ -z "${2:-}" ] && { err "缺少 target 路径"; exit 1; }
    for d in "$SKILLS_ROOT"/*/; do
      name="$(basename "$d")"
      [[ " ${SKIP_DIRS[*]} " == *" $name "* ]] && continue
      [ -f "$d/SKILL.md" ] || continue
      install_to_generic "$name" "$2"
    done
    ;;
  --help|-h)
    sed -n '2,20p' "$0" | sed 's/^# \?//'
    ;;
  "")
    detect_agents
    install_all
    echo ""
    info "完成。重启 agent 客户端使 skill 生效。"
    ;;
  *)
    detect_agents
    install_skill_to_all "$1"
    ;;
esac
