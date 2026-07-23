# aiagent-covert-channel-scan

AI Agent 客户端隐蔽信道审计 Skill —— 通用 Agent Skill(兼容 TRAE / Claude Code / Codex / Cursor / Cline)。

## 这是什么

检测 AI Agent 客户端(Claude Code / Cursor / Cline 等)是否通过**隐蔽信道**把用户敏感信息——时区、代理、主机指纹等——编码进系统提示词,随每个 API 请求回传服务器。

**背景**:2026 年 7 月,Anthropic 被曝在 Claude Code 中植入隐蔽代码:读取本地时区(`Asia/Shanghai`)、代理环境变量、主机域名,经判定后把"是否中国用户"的标记**编码进系统提示词的日期片段**(中国时区→日期分隔符从 `-` 改为 `/`),随请求回传 Anthropic 服务器,用于全链路封号。还用 base64+XOR 双重编码藏了一份 68 个中国企业域名的黑名单。

## 安装

### 方式 1:一键脚本(macOS / Linux,推荐)

```bash
bash install.sh
```

脚本会自动检测本机所有 agent 客户端(TRAE / Claude Code / Codex / Cursor / Cline)并安装到对应路径。
也可用上层 [02_Skills_Project/install.sh](../../02_Skills_Project/install.sh) 统一安装所有 skill。

### 方式 2:手动安装

```bash
# macOS / Linux(TRAE / Claude Code / Codex 通用 SKILL.md 格式)
cp -r aiagent-covert-channel-scan ~/.trae-cn/skills/      # TRAE
cp -r aiagent-covert-channel-scan ~/.claude/skills/        # Claude Code
cp -r aiagent-covert-channel-scan ~/.codex/skills/         # Codex

# Windows (PowerShell)
Copy-Item -Recurse aiagent-covert-channel-scan $env:USERPROFILE\.trae-cn\skills\
Copy-Item -Recurse aiagent-covert-channel-scan $env:USERPROFILE\.claude\skills\
Copy-Item -Recurse aiagent-covert-channel-scan $env:USERPROFILE\.codex\skills\
```

跨 agent 兼容性说明见 [../../02_Skills_Project/INSTALL.md](../../02_Skills_Project/INSTALL.md)。

## 使用

安装后,在任意 AI 编程客户端(TRAE / Claude Code / Codex / Cursor / Cline)里对 AI 说:

- "扫描下 Claude Code 会不会泄漏隐私"
- "审计一下我本地的 AI Agent 客户端"
- "Claude Code 有没有隐蔽信道"

AI 会自动触发 skill,执行扫描并生成报告。

### 直接命令行使用

```bash
# 扫描 Claude Code 二进制(macOS)
python3 scripts/scan.py "~/Library/Application Support/Claude/claude-code/*/claude.app/Contents/MacOS/claude" --strings-only

# 扫描并落盘报告(存到 OS 标准目录)
python3 scripts/scan.py <路径> --save

# 输出 JSON 格式
python3 scripts/scan.py <路径> -f json -o report.json
```

## 特性

- **零依赖**:仅 Python 3 标准库,无需 pip install
- **跨平台**:macOS / Windows / Linux
- **四合一检测**:
  - 静态代码扫描(13 条特征规则)
  - 提示词隐写检测(零宽字符 / 控制字符 / Unicode 标签 / Base64)
  - 二进制 strings 分析(自动判断二进制 vs 文本)
  - base64+XOR 双重解码(暴力 0x00-0xFF)
- **误报甄别**:SKILL.md 强制 AI 逐条甄别,标注 malicious/suspicious/benign
- **厂商风格报告**(8 章节):执行摘要 / 攻击链 / MITRE ATT&CK 映射 / 技术分析 / IOC / YARA / 缓解措施 / 附录

## 报告默认位置

| OS | 路径 |
|----|------|
| macOS | `~/Library/Application Support/secscan/reports/` |
| Windows | `%LOCALAPPDATA%\secscan\reports\` |
| Linux | `~/.local/share/secscan/reports/` |

保留 30 天,超期自动清理。

## 检测能力

| 规则 ID | 严重级别 | 检测内容 |
|---------|---------|---------|
| CC-REGION-001 | CRITICAL | 中国时区判定(Asia/Shanghai 等) |
| CC-REGION-002 | CRITICAL | 中国用户标记变量(cnTZ/labKw) |
| CC-STEGO-002 | CRITICAL | 系统提示词分隔符编码 |
| CC-ENCODE-002 | CRITICAL | base64+XOR 双重编码黑名单 |
| CC-PROXY-001 | HIGH | 读取代理环境变量 |
| CC-HOST-001 | HIGH | 读取主机/平台指纹 |
| CC-ENCODE-003 | HIGH | 零宽字符注入 |
| CC-NET-001 | HIGH | 向外部服务回传数据 |
| CC-TZ-001/002 | MEDIUM | 读取本地时区 |
| CC-ENCODE-001 | MEDIUM | 可疑 base64 编码 |

## 退出码

- `0` = 干净
- `1` = 有 HIGH 级命中
- `2` = 有 CRITICAL 级命中

## 局限

- 静态分析,无法看到运行时动态行为(动态 hook 需 Phase 2)
- telemetry 文件的 UUID 可能被误判为 Base64(置信度低,甄别时排除)
- 仅审计"客户端是否会回传",不审计"服务器如何使用"
- 扫描是**只读**的,不修改任何文件

## 许可证

MIT
