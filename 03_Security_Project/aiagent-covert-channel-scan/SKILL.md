---
name: "aiagent-covert-channel-scan"
description: >-
  Audits AI Agent clients (Claude Code / Cursor / Cline etc.) for covert channels that
  exfiltrate user-sensitive info (timezone / proxy / host fingerprint) via encoded system
  prompts. Runs static scan, prompt steganography detection, binary strings analysis and
  base64+XOR double-decoding. Invoke when user mentions scanning Claude Code for privacy,
  covert channel / steganography in AI agents, "does Claude Code leak timezone", or before
  trusting an AI coding client with sensitive projects.
---

# aiagent-covert-channel-scan · AI Agent 隐蔽信道审计

检测 AI Agent 客户端是否通过**隐蔽信道**(covert channel)把用户敏感信息——
时区、代理、主机指纹等——编码进系统提示词,随每个 API 请求回传服务器。

## 背景:为什么要做这个

2026 年 7 月,Anthropic 被曝在 Claude Code 中植入隐蔽代码:读取本地时区
(`Asia/Shanghai`/`Asia/Urumqi`)、代理环境变量、主机域名,经判定后把"是否中国用户"
的标记**编码进系统提示词的日期片段**(中国时区→日期分隔符从 `-` 改为 `/`),随请求
回传 Anthropic 服务器,用于全链路封号。还用 base64+XOR 双重编码藏了一份 68 个中国
企业域名的黑名单。这是典型的**对用户不可见的隐蔽信道**。

本 skill 把这套审计流程固化:不只是跑正则,还包括 `strings` 提取、双重解码、
**误报甄别**(二进制里命中 `Asia/Shanghai` 也可能是 timezone 数据库,需上下文判断)。

## 何时运行

任一条件触发:
- 用户问"Claude Code 会不会泄漏隐私 / 偷传时区 / 隐蔽信道"
- 用户要审计 / 扫描某个 AI Agent 客户端(Claude Code、Cursor、Cline、Continue 等)
- 用户在敏感项目里要用 AI 编码客户端,想先做安全确认
- 用户提到"系统提示词隐写 / 零宽字符 / base64+XOR 编码"

## 怎么做

### 步骤 1:定位客户端

Claude Code(native 版)通常在:
- macOS: `~/Library/Application Support/Claude/claude-code/<version>/claude.app/Contents/MacOS/claude`
- npm 版: `npm root -g` 下的 `@anthropic-ai/claude-code/`
- 用户数据: `~/.claude/`(telemetry / sessions / backups)

Cursor / Cline 等:在各自应用包或 `~/.config/` / `~/Library/Application Support/` 下。

### 步骤 2:跑扫描脚本(零依赖,仅 Python 标准库)

```bash
python3 <skill-dir>/scripts/scan.py <PATH>

# <skill-dir> 取决于安装位置:
#   TRAE:        ~/.trae-cn/skills/aiagent-covert-channel-scan
#   Claude Code: ~/.claude/skills/aiagent-covert-channel-scan
#   Codex:       ~/.codex/skills/aiagent-covert-channel-scan
#   仓库源:      <repo-root>/03_Security_Project/aiagent-covert-channel-scan
```

支持:
- 文件/目录 → 静态代码扫描 + 提示词隐写检测
- 二进制(native app)→ `strings` 提取 + 关键词命中 + **base64+XOR 双重解码**
- `-f json -o report.json` 输出 JSON;`-f markdown -o report.md` 输出 Markdown
- `--strings-only` 仅做二进制 strings 扫描(更快)

**退出码**:`0` 干净 / `1` 有 high / `2` 有 critical。脚本自动判断二进制 vs 文本。

### 步骤 3:甄别命中(关键,AI 必须做)

脚本的二进制扫描会产生命中,但**不是所有命中都是恶意**。必须逐条甄别,并填写 `verdict` 字段:

| 命中 | malicious(恶意) | benign(误报) |
|------|-----------|---------------------|
| `Asia/Shanghai` | 出现在 `if(t==="Asia/Shanghai")` 判定里 | timezone 数据库枚举 / cron 文档 |
| `timeZone` | 拼进 `systemPrompt` | `/schedule` 命令转 UTC(用途合理) |
| 零宽字符 `\u200b` | 提示词模板里 | 键盘 keycode 表 / Rust 编译器错误 |
| `HTTP_PROXY` | 上报服务器 | 标准代理配置读取 |
| `process.platform` | 拼进回传数据 | telemetry 字段名 |
| `Buffer.from(...base64)` | 编码敏感字段/黑名单 | 标准 HTTP Basic Auth |
| base64+XOR 解出域名列表 | ⚠️ 强信号,几乎必为黑名单 | — |

**甄别方法**:用 `strings -a <binary> | grep -oE ".{60}<keyword>.{60}"` 看上下文。
判定为恶意的 → `verdict=malicious`;可疑 → `suspicious`;误报 → `benign`;无法判断 → `unverified`。

**在报告里如何体现**:AI 生成的最终报告应逐条标注 verdict(脚本默认是 `unverified`,需 AI 覆盖)。

### 步骤 4:对可疑的双重编码串解码确认

脚本会自动暴力尝试 base64+XOR(0x00-0xFF)。若脚本报 `CC-ENCODE-002` 命中,
**必须**展示解码明文前 300 字符给用户,并统计域名特征(`.com`/`.cn` 计数)。
若解出企业域名列表(如 `sankuai.com, baidu.com, alibaba-inc.com...`),这是**铁证**。

### 步骤 5:生成报告

**默认**:结果输出到控制台,不落盘。
**落盘**有两种方式(落盘后**同时**在控制台打印完整报告内容,便于 AI 在聊天框展示):

```bash
# 方式 A:存到 OS 标准目录(推荐,跨平台一致,自动清理 30 天前)
python3 .../scan.py <PATH> --save

# 方式 B:指定任意路径
python3 .../scan.py <PATH> -o /path/to/report.md
```

> 无论用哪种方式落盘,脚本都会在控制台先打印 `报告已写入: <路径>`,再打印完整报告内容。
> AI 调用脚本时可直接捕获 stdout,把报告内容贴到聊天框展示给用户。

**OS 标准报告目录**(`--save` 时的位置):

| OS | 路径 |
|----|------|
| macOS | `~/Library/Application Support/secscan/reports/` |
| Windows | `%LOCALAPPDATA%\secscan\reports\`(即 `C:\Users\<用户>\AppData\Local\secscan\reports\`) |
| Linux | `~/.local/share/secscan/reports/`(遵循 XDG) |

**文件名规范**:`YYYYMMDD_HHMMSS_<客户端类型>.md`(或 `.json`)
例:`20260704_114630_claude_code.md`

**保留策略**:默认目录中的报告保留 30 天,超期自动清理(每次运行时检查)。

**报告结构**(参照 Mandiant / CrowdStrike / Unit 42 等安全厂商风格,8 章节):

1. **执行摘要 (Executive Summary)** — 综合风险等级、一句话结论、命中分布、风险提示
2. **攻击链还原 (Kill Chain)** — 采集→判定→编码→回传 的链路图
3. **MITRE ATT&CK 映射** — 技术 ID → 名称 → 关联规则的表格
4. **详细技术分析 (Technical Analysis)** — 逐条命中:规则/类别/严重级别/可信度/甄别结论/ATT&CK/位置/描述/证据/缓解建议
5. **威胁指标 (IOCs)** — 域名/IP/XOR key/规则 ID 清单
6. **检测建议 (Detection Rules)** — 自动生成的 YARA-lite 规则
7. **缓解措施 (Mitigations)** — 立即/加固/持续 三级建议
8. **附录** — 扫描元信息、严重级别定义、甄别结论定义、参考资源

AI 在步骤 3 完成甄别后,应在步骤 4 的报告里把每条命中的 `verdict` 字段从默认 `unverified` 覆盖为 `malicious`/`suspicious`/`benign`,并在执行摘要里给出综合风险等级。

## 严重级别含义

- `CRITICAL` —— 中国时区判定 / cnTZ 标记变量 / 系统提示词分隔符编码 / 双重编码黑名单
  → 几乎确证隐蔽信道
- `HIGH` —— 代理读取 / 主机指纹采集 / 零宽字符 / 外部回传 → 需结合上下文判断
- `MEDIUM` —— 时区读取 / base64 编码 / 控制字符 → 多数有合法用途,仅提示

## 真实案例(供参照)

Claude Code 2.1.197 二进制实测命中链:
1. `e0t()` = `Intl.DateTimeFormat().resolvedOptions().timeZone`
2. `ddp()` = `t==="Asia/Shanghai"||t==="Asia/Urumqi"` → 返回 `{cnTZ, labKw, known, host}`
3. `eca(e)` = `t?.cnTZ?e.replaceAll("-","/"):e` → 把中国标记编码进系统提示词日期
4. `idp` 变量 = base64+XOR 0x5b → 解出 68 个中国企业域名黑名单

→ 判定:**确认存在隐蔽信道**,三重识别(时区+域名+关键词)+ 提示词编码回传。

## 边界

- 脚本对 native 二进制用 `strings` 提取,无法看到运行时动态行为(动态 hook 需 Phase 2)
- telemetry 文件的 UUID 可能被误判为 Base64(置信度低,甄别时排除)
- 仅审计"客户端是否会回传",不审计"服务器如何使用"
- 扫描是**只读**的,不修改任何文件
