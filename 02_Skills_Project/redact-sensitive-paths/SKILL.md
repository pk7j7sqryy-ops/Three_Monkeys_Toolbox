---
name: redact-sensitive-paths
description: 推送前脱敏扫描:扫描仓库里硬编码的本地绝对路径、用户名、邮箱、API key/token、私钥等敏感信息,自动替换为占位符,保证对外公开版本不带个人/内部信息。在 git push / 创建仓库 / 公开代码之前必须调用。支持 --staged 快速扫描、行级忽略标记、熵检测、install-hook 一键安装。
priority: high
tags:
---

# Redact Sensitive Paths · 推送前脱敏

> Three Monkeys Toolbox 旗下安全 Skill —— 三不猴第 4 只猴:「不传不该传的」。
> 把要推送到公开仓库的内容里所有个人/内部信息先脱敏,再做 push。

## 触发时机

**在执行以下命令之前必须先调用本 skill:**

- `git push`
- `git add -A`(在准备推送的提交之前)
- `gh repo create --push`
- `git commit`(若担心本次提交含敏感信息)
- 任何把仓库内容发到外部的操作

**Agent 自动识别关键词**(对话中出现以下任一,自动触发扫描):

- "推送"/"push"/"上传到 GitHub"/"公开代码"/"发布仓库"
- "git init" + "push"/"创建仓库"/"gh repo create"
- "传上去会不会泄漏"/"有没有敏感信息"/"密码"/"密钥"

## 设计原则

1. **源头治理优先**:skill/工具设计时就应该用 `<repo-root>` / `~/` / 环境变量,不要硬编码本地绝对路径。本 skill 是安全网,不是替代。
2. **不破坏功能**:脱敏只替换"对外暴露的标识符",不改动逻辑代码。占位符(`~/`、`$USER`、`<REDACTED-KEY>`)在本地加载时要么由环境变量注入,要么不影响 skill 行为。
3. **可审计**:每次 `apply` 都生成映射表 `.redact/map.json`,记录"哪个文件哪一行被替换了什么"。映射表本身**包含敏感信息,必须 gitignore**。
4. **白名单兜底**:设计文档里的示例路径/示例 IP 默认跳过,避免误报。支持文件级 glob 和行级 `# redact-ignore` 两种方式。

## 工作流

### Step 1: 初始化(每个仓库首次使用)

```bash
python3 <skill-path>/scripts/redact.py init --repo <repo-root>
```

在仓库根创建 `.redact/` 目录,生成:
- `rules.example.json` — 自定义规则模板
- `users.example.json` — 用户名列表模板(用户名是私有,单独存)
- `whitelist.example.json` — 白名单模板(文件级 glob)
- `README.md` — 配置说明

并自动把以下规则追加到仓库根 `.gitignore`:
```
.redact/
!.redact/*.example.json
```

复制模板为正式配置:
```bash
cp .redact/users.example.json .redact/users.json
# 编辑 users.json,把 <your-username> 改成你的真实用户名
cp .redact/whitelist.example.json .redact/whitelist.json  # 按需
```

### Step 2: 扫描

**全量扫描**(推荐首次使用):
```bash
python3 <skill-path>/scripts/redact.py scan --repo <repo-root>
```

**快速扫描**(日常 push 前,只扫即将提交的变更):
```bash
python3 <skill-path>/scripts/redact.py scan --repo <repo-root> --staged
```

`--staged` 等价于 `git diff --cached`,只检查暂存区的变更,速度快,适合日常高频使用。

**结构化输出**(agent 友好):
```bash
python3 <skill-path>/scripts/redact.py scan --repo <repo-root> --json
```

输出 JSON 包含 `exit_code`、`hits`(命中列表)、`next_steps`(建议操作),方便 agent 解析。

**扫描结果**:

| 退出码 | 含义 | 处理 |
|---|---|---|
| `0` | ✅ 干净 | 继续推送 |
| `1` | 🔎 REVIEW 命中(本地路径/用户名/邮箱等) | 向用户展示命中清单,逐条确认 |
| `2` | ⛔ BLOCK 命中(API key/token/私钥) | **禁止推送**,必须处理 |

### Step 3: 处理 REVIEW 命中

对每条 REVIEW 命中,选择一种处理方式:

**方式 A — 确认非隐私,跳过**:

- 文件级:编辑 `.redact/whitelist.json`,加入文件 glob
- 行级(推荐):在对应行末尾加 `# redact-ignore`,例如:
  ```python
  base_path = "/Users/example/project"  # redact-ignore
  ```

**方式 B — 是真实隐私,自动替换为占位符**:
```bash
python3 <skill-path>/scripts/redact.py apply --repo <repo-root> --dry-run  # 预览
python3 <skill-path>/scripts/redact.py apply --repo <repo-root>             # 执行
```
生成的映射表:`.redact/map.json`(包含敏感原始值,**严禁提交**)。

**方式 C — 手动处理**(更推荐长期方案):
- 把硬编码路径改成 `<repo-root>/...` 或环境变量
- 把用户名提取到 `.redact/users.json`
- 处理完重新扫描

### Step 4: 处理 BLOCK 命中

BLOCK 命中(API key/token/私钥)**不能简单替换占位符就完事**,因为:
- 如果密钥已经在历史里,clone 过的人仍可能拿到
- 占位符替换只清当前快照,不清历史

正确处理:
1. 删除/移到 `.env`(已 gitignore)/改成环境变量
2. 如果已经推过历史,必须 `git filter-repo` 重写历史
3. **轮换那把密钥**——这是唯一可靠的补救

### Step 5: 推送

扫描干净(exit 0)或 REVIEW 已确认后,继续:
```bash
git push origin <branch>
```

### Step 6: 一键安装 pre-commit hook

```bash
python3 <skill-path>/scripts/redact.py install-hook --repo <repo-root>
```

安装后每次 `git commit` 自动运行 `redact.py scan --staged`,检出问题则阻止提交。注意:这会增加每次 commit 的延迟,建议只在敏感项目启用。

### Step 7: 本地恢复(可选,不推荐)

如果 `apply` 影响了本地 skill 工作(比如 SKILL.md 里的真值路径被换成了占位符),推荐用 git 恢复:
```bash
git checkout HEAD -- <file>
```

`redact.py restore` 命令只显示映射表和恢复指引,不做反向替换(因为占位符可能多处出现,无法精确还原)。

## 内置规则

### REVIEW 级(通常无害但需确认)

| ID | 模式 | 替换为 | 说明 |
|---|---|---|---|
| PATH-MAC | `/Users/<name>/` | `~/` | macOS 家目录绝对路径 |
| PATH-LINUX | `/home/<name>/` | `~/` | Linux 家目录绝对路径 |
| PATH-WIN | `C:\Users\<name>\` | `%USERPROFILE%\` | Windows 用户目录 |
| EMAIL-QQ | `<digits>@qq.com` | `$EMAIL` | QQ 数字邮箱 |
| USER-NAME-* | 用户自定义 | `$USER` | 用户名(来自 `.redact/users.json`) |

### BLOCK 级(高危,禁止推送)

| ID | 模式 | 替换为 |
|---|---|---|
| API-KEY-OPENAI | `sk-proj-/sk-svcacct-/sk-admin-/sk-<32+ chars>` | `<REDACTED-OPENAI-KEY>` |
| API-KEY-ANTHROPIC | `sk-ant-<32+ chars>` | `<REDACTED-ANTHROPIC-KEY>` |
| API-KEY-GITHUB | `ghp_/gho_/ghu_/ghs_/ghr_<36+ chars>` | `<REDACTED-GITHUB-TOKEN>` |
| API-KEY-AWS | `AKIA<16 chars>` | `<REDACTED-AWS-KEY>` |
| API-KEY-STRIPE | `sk_live_/sk_test_<24+ chars>` | `<REDACTED-STRIPE-KEY>` |
| API-KEY-SLACK | `xoxb-/xoxp-/xoxa-<32+ chars>` | `<REDACTED-SLACK-TOKEN>` |
| API-KEY-HF | `hf_<34 chars>` | `<REDACTED-HF-TOKEN>` |
| API-KEY-GOOGLE | `AIza<35 chars>` | `<REDACTED-GOOGLE-KEY>` |
| API-KEY-NPM | `npm_<36 chars>` | `<REDACTED-NPM-TOKEN>` |
| PRIVATE-KEY-PEM | `-----BEGIN ... PRIVATE KEY-----` | `<REDACTED-PRIVATE-KEY>` |
| JWT-TOKEN | `eyJ<base64>.<base64>.<base64>` | `<REDACTED-JWT>` |
| ENTROPY-HIGH | 高熵字符串(Shannon entropy > 4.5) | `<REDACTED-HIGH-ENTROPY>` |

**熵检测(ENTROPY-HIGH)**:扫描器会计算每个长字符串的 Shannon 熵值。熵 > 4.5 的字符串(如随机生成的 token/secret)会被标记为 BLOCK,即使没有已知前缀。这能兜底抓取未知类型的 API key。但注意:minified JS/CSS 也高熵,需配合白名单避免误报。

查看完整规则:`python3 <skill-path>/scripts/redact.py rules`

## 默认白名单

以下路径默认跳过(设计文档常有示例数据):

- `**/docs/design/**`、`**/docs/reference/**`、`**/docs/testing/**`、`**/docs/requirements/**`
- `**/.git/**`、`**/node_modules/**`
- `**/mermaid.min.js`(minified 大文件)
- `**/*.zip`、`**/*.jpg`、`**/*.png`、`**/*.gif`、`**/*.pdf`、`**/*.min.js`、`**/*.min.css`
- `**/.redact/**`

## 注意事项

1. **映射表是敏感文件**:`.redact/map.json` 包含原始路径/密钥,必须 gitignore
2. **行级忽略优先**:`# redact-ignore` 比文件级白名单更精准,推荐优先使用
3. **二进制文件跳过**:只扫描文本文件(扩展名白名单 + NUL byte 检测)
4. **大文件性能**:minified 文件(>500KB)扫描慢,默认白名单
5. **日常用 `--staged`**:全量扫描慢,日常 push 前用 `--staged` 只扫变更
6. **熵检测有误报**:minified JS/CSS/Base64 编码数据也高熵,需要白名单配合

## 已知遗留(用户需了解)

1. **不处理 git 历史**:如果之前已经把敏感信息推到历史,需要 `git filter-repo` 重写 + 轮换密钥,本 skill 只清当前快照
2. **OCR/图片中的路径**:扫描器只看文本,图片里的路径(如截图里的 IDE 路径栏)需要手动检查
3. **动态生成的路径**:运行时用 `os.path.expanduser("~")` 或 `__file__` 拼出来的路径,源码里看不到,扫描不到,需要源码审查
4. **Unicode 变体**:全角字符、零宽字符里藏的路径,正则可能漏,需要专门的隐写检测(参考 `03_Security_Project/aiagent-covert-channel-scan`)
5. **不验证占位符语义**:替换后不会检查 `~/` 在读者环境里是否有效,需要文档说明
6. **本地恢复不完美**:`restore` 不做反向替换,推荐用 `git checkout` 恢复
7. **只扫 git 跟踪的文件**:`.gitignore` 忽略的文件不在范围(这是想要的),但要注意 `git add -f` 强加的文件仍会被扫到
8. **path glob 匹配不完美**:`**` 跨目录匹配是简化实现,复杂 glob 可能漏匹配,需要测试

## 后续 Roadmap(未实现)

- [ ] **CI 集成**:GitHub Actions workflow,PR 时自动扫描
- [ ] **跨仓库历史扫描**:`redact.py history` 扫描 git log -p 全历史
- [ ] **隐写检测**:对接 `aiagent-covert-channel-scan` 检测零宽字符/全角字符里藏的路径
- [ ] **`--staged` 白名单密度统计**:标记"单个文件超过 N 行 `# redact-ignore`"为可疑

## 安装

**一键安装到所有检测到的 agent**:

```bash
# 在 02_Skills_Project/ 下
./install.sh redact-sensitive-paths
```

**手动安装**(TRAE / Claude Code / Codex 通用 SKILL.md 格式):

```bash
cp -r redact-sensitive-paths ~/.trae-cn/skills/      # TRAE
cp -r redact-sensitive-paths ~/.claude/skills/       # Claude Code
cp -r redact-sensitive-paths ~/.codex/skills/         # Codex
```

Cursor / Cline 需要格式转换,用 `install.sh` 自动处理。

也可直接命令行使用,不需要任何 agent 加载:
```bash
python3 redact-sensitive-paths/scripts/redact.py scan --repo /path/to/any/repo
```
