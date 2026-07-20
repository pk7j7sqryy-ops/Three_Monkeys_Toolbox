---
name: "redact-sensitive-paths"
description: "推送前脱敏扫描:扫描仓库里硬编码的本地绝对路径、用户名、邮箱、API key/token、私钥等敏感信息,自动替换为占位符,保证对外公开版本不带个人/内部信息。在 git push 之前必须调用。支持白名单和映射表审计。"
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

## 设计原则

1. **源头治理优先**:skill/工具设计时就应该用 `<repo-root>` / `~/` / 环境变量,不要硬编码本地绝对路径。本 skill 是安全网,不是替代。
2. **不破坏功能**:脱敏只替换"对外暴露的标识符",不改动逻辑代码。占位符(`~/`、`$USER`、`<REDACTED-KEY>`)在本地加载时要么由环境变量注入,要么不影响 skill 行为。
3. **可审计**:每次 `apply` 都生成映射表 `.redact/map.json`,记录"哪个文件哪一行被替换了什么"。映射表本身**包含敏感信息,必须 gitignore**。
4. **白名单兜底**:设计文档里的示例 IP / 示例路径(如 `192.168.1.15`、`/home/user/soc`)默认白名单跳过,避免误报。

## 工作流

### Step 1: 初始化(每个仓库首次使用)

```bash
python3 <skill-path>/scripts/redact.py init --repo <repo-root>
```

在仓库根创建 `.redact/` 目录,生成:
- `rules.example.json` — 自定义规则模板
- `users.example.json` — 用户名列表模板(用户名是私有,单独存)
- `whitelist.example.json` — 白名单模板
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

```bash
python3 <skill-path>/scripts/redact.py scan --repo <repo-root>
```

扫描所有 git 跟踪的文本文件,输出:

| 退出码 | 含义 | 处理 |
|---|---|---|
| `0` | ✅ 干净 | 继续推送 |
| `1` | 🔎 REVIEW 命中(本地路径/用户名/邮箱等) | 向用户展示命中清单,逐条确认 |
| `2` | ⛔ BLOCK 命中(API key/token/私钥) | **禁止推送**,必须处理 |

### Step 3: 处理 REVIEW 命中

对每条 REVIEW 命中,选择一种处理方式:

**方式 A — 确认非隐私,加入白名单**:
编辑 `.redact/whitelist.json`,加入文件 glob 或具体路径:
```json
{ "patterns": ["**/docs/design/**"] }
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

### Step 6: 本地恢复(可选,不推荐)

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
| API-KEY-OPENAI | `sk-<32+ chars>` | `<REDACTED-OPENAI-KEY>` |
| API-KEY-GITHUB | `ghp_/gho_/ghu_/ghs_/ghr_<36+ chars>` | `<REDACTED-GITHUB-TOKEN>` |
| API-KEY-AWS | `AKIA<16 chars>` | `<REDACTED-AWS-KEY>` |
| PRIVATE-KEY-PEM | `-----BEGIN ... PRIVATE KEY-----` | `<REDACTED-PRIVATE-KEY>` |
| JWT-TOKEN | `eyJxxx.yyy.zzz` | `<REDACTED-JWT>` |

查看完整规则:`python3 scripts/redact.py rules`

## 默认白名单

以下路径默认跳过(设计文档常有示例数据):

- `**/docs/design/**`、`**/docs/reference/**`、`**/docs/testing/**`、`**/docs/requirements/**`
- `**/.git/**`、`**/node_modules/**`
- `**/mermaid.min.js`(minified 大文件)
- `**/*.zip`、`**/*.jpg`、`**/*.png`、`**/*.gif`、`**/*.pdf`
- `**/.redact/**`

## 注意事项

1. **映射表是敏感文件**:`.redact/map.json` 包含原始路径/密钥,必须 gitignore
2. **白名单要精准**:不要把整个文件加白名单,只加具体 glob
3. **二进制文件跳过**:只扫描文本文件(扩展名白名单 + NUL byte 检测)
4. **大文件性能**:`mermaid.min.js` 2.5MB 这种 minified 文件,扫描慢,默认白名单
5. **commit hook 集成(可选)**:可以把 `redact.py scan` 加到 `.git/hooks/pre-commit`,但要注意性能(每次提交扫描全仓库)

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

- [ ] **行号级白名单**:目前白名单只能按文件 glob,无法指定"第 N 行跳过"
- [ ] **正则白名单**:用上下文模式而非整文件跳过(如"行首是 `# 示例:` 的行")
- [ ] **git pre-commit hook 集成**:`redact.py install-hook` 自动安装
- [ ] **CI 集成**:GitHub Actions workflow,PR 时自动扫描
- [ ] **跨仓库历史扫描**:`redact.py history` 扫描 git log -p 全历史
- [ ] **隐写检测**:对接 `aiagent-covert-channel-scan` 检测零宽字符/全角字符里藏的路径

## 安装

```bash
cp -r redact-sensitive-paths ~/.trae-cn/skills/
```

也可直接命令行使用,不需要 TRAE 加载:
```bash
python3 redact-sensitive-paths/scripts/redact.py scan --repo /path/to/any/repo
```
