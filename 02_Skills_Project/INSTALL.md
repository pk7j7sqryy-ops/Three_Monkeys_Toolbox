# 跨 Agent 兼容性说明

本目录下所有 skill 设计为**通用 Agent Skill**,不绑定任何特定 AI 编程客户端。
基于事实标准格式 `SKILL.md`(YAML frontmatter + Markdown 正文)编写,可装到主流 agent 上。

## 兼容性矩阵

| Agent 客户端 | Skill 路径 | 兼容方式 | 转换 |
|---|---|---|---|
| **TRAE** | `~/.trae-cn/skills/` 或 `~/.trae/skills/` | SKILL.md 原生格式 | ✅ 直接拷贝 |
| **Claude Code** | `~/.claude/skills/` | SKILL.md 原生格式 | ✅ 直接拷贝 |
| **Codex** | `~/.codex/skills/` 或 `~/.Codex/skills/` | SKILL.md 原生格式(可选 `metadata` 字段) | ✅ 直接拷贝 |
| **Cursor** | `~/.cursor/rules/` | `.mdc` 格式(frontmatter 字段不同) | 🔄 自动转换 |
| **Cline** | 工作区 `.clinerules/` | 纯 markdown 规则(去 frontmatter) | 🔄 自动转换 |
| **Roo Code** | `~/.roo/skills/` | 类似 Cline | 🔄 自动转换 |
| **Continue.dev** | `~/.continue/config.json` 的 customCommands | JSON 格式 | ❌ 手动配置 |

## 一键安装

```bash
# 自动检测本机已安装的 agent,安装到所有检测到的路径
./install.sh

# 只安装某一个 skill
./install.sh interview-question-tracker

# 查看本机已装的 agent
./install.sh --detect

# 列出所有可用 skill
./install.sh --list

# 指定目标路径(跳过自动检测)
./install.sh --target ~/.codex/skills
```

## 手动安装

### TRAE / Claude Code / Codex(通用 SKILL.md 格式)

```bash
# 选一个 skill,比如 interview-question-tracker
cp -r interview-question-tracker ~/.trae-cn/skills/      # TRAE
cp -r interview-question-tracker ~/.claude/skills/       # Claude Code
cp -r interview-question-tracker ~/.codex/skills/         # Codex
```

Windows(PowerShell):
```powershell
Copy-Item -Recurse interview-question-tracker $env:USERPROFILE\.trae-cn\skills\
Copy-Item -Recurse interview-question-tracker $env:USERPROFILE\.claude\skills\
Copy-Item -Recurse interview-question-tracker $env:USERPROFILE\.codex\skills\
```

### Cursor(需要 .mdc 格式转换)

`./install.sh` 会自动转换。手动转换方式:

1. 把 `SKILL.md` 复制为 `~/.cursor/rules/<skill-name>.mdc`
2. frontmatter 改成:
   ```yaml
   ---
   description: <原 SKILL.md 的 description>
   globs: "**/*"
   alwaysApply: false
   ---
   ```
3. 正文保留原 SKILL.md 内容(去掉原 frontmatter)

### Cline / Roo Code(纯 markdown 规则)

```bash
# 去掉 YAML frontmatter,保留正文
awk 'BEGIN{infm=0} /^---$/{if(infm==0){infm=1;next}else{infm=0;next}} {if(infm==0)print}' \
  interview-question-tracker/SKILL.md \
  > .clinerules/interview-question-tracker.md
```

## 编写通用 skill 的规则

为了让 skill 真正跨 agent 通用,编写时遵循:

1. **frontmatter 只用 `name` + `description`** — 这是 TRAE/Claude Code/Codex 都支持的最小集。Codex 支持可选 `metadata`,但不要依赖
2. **不要硬编码本机绝对路径** — 用 `<repo-root>` 占位符或 `git rev-parse --show-toplevel` 推断(详见 [redact-sensitive-paths](./redact-sensitive-paths))
3. **工具调用用通用原语** — 文件读写、git 命令、bash 执行,这些都是 agent 通用工具
4. **避免特定 agent 的专有 API** — 比如 TRAE 的 Schedule / PureShowWidget,MCP 工具调用要给 fallback
5. **触发条件写关键词,不写 agent 专有事件** — 用 "用户说 xxx" 而非 "onToolCall"
6. **如果有 Python/Shell 脚本** — 保持零依赖,只用标准库,这样不装 agent 也能命令行用

## 已知差异

| 维度 | TRAE | Claude Code | Codex | Cursor | Cline |
|---|---|---|---|---|---|
| 触发方式 | 自动 + 关键词 | 自动 + 关键词 | 自动 + 关键词 | 文件 glob 触发 | 文件 glob 触发 |
| 工具名 | Read/Write/Edit | Read/Write/Edit | Read/Write/Edit | codebase_read/edit | read_file/write_to_file |
| 定时任务 | Schedule 工具 | 无原生 | 无原生 | 无 | 无 |
| MCP 支持 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 备注 | `priority: high/medium/low` 可选 | `metadata` 可选 | `metadata` 可选 | `alwaysApply` 可选 | 纯规则 |

> 涉及定时任务(ai-news-digest)或 MCP 调用的 skill,在 TRAE 之外需要手动配置等价机制。

## 排错

- **skill 没生效** — 多数 agent 需要重启客户端或新建会话才能加载新 skill
- **Cursor 转换后 description 丢失** — 检查 `.mdc` frontmatter 的缩进,YAML 对缩进敏感
- **Cline 规则不触发** — Cline 的规则是文件 glob 触发,把 `alwaysApply` 改成对应用户操作的 glob
- **跨平台路径问题** — Windows 用 `\\`,macOS/Linux 用 `/`,脚本里用 `os.path.join` 或 `pathlib.Path` 避免
