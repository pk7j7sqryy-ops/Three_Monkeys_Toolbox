#!/usr/bin/env bash
# aiagent-covert-channel-scan skill 一键安装脚本
# 用法: bash install.sh
set -e

SKILL_NAME="aiagent-covert-channel-scan"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

# 检测 TRAE skill 目录
if [ -d "$HOME/.trae-cn/skills" ]; then
    DST="$HOME/.trae-cn/skills/$SKILL_NAME"
elif [ -d "$HOME/.trae/skills" ]; then
    DST="$HOME/.trae/skills/$SKILL_NAME"
else
    echo "⚠ 未找到 TRAE skill 目录(~/.trae-cn/skills 或 ~/.trae/skills)"
    echo "  请确认已安装 TRAE IDE,然后重试。"
    exit 1
fi

echo "=== 安装 $SKILL_NAME ==="
echo "源:   $SRC_DIR"
echo "目标: $DST"
echo

mkdir -p "$DST/scripts"
cp "$SRC_DIR/SKILL.md" "$DST/SKILL.md"
cp "$SRC_DIR/scripts/scan.py" "$DST/scripts/scan.py"
chmod +x "$DST/scripts/scan.py"

echo "✓ 安装完成"
echo
echo "验证:"
ls -lh "$DST/SKILL.md" "$DST/scripts/scan.py"
echo
echo "测试扫描(对 Claude Code 二进制,如已安装):"
BIN_MAC="$HOME/Library/Application Support/Claude/claude-code/*/claude.app/Contents/MacOS/claude"
if ls $BIN_MAC 2>/dev/null | head -1 > /dev/null; then
    echo "  python3 \"$DST/scripts/scan.py\" \"$BIN_MAC\" --strings-only"
else
    echo "  python3 \"$DST/scripts/scan.py\" <AI客户端路径>"
fi
echo
echo "Skill 会在你提到'扫描 Claude Code 隐蔽信道/Claude Code 泄漏隐私'时自动触发。"
