# Skills Project · TRAE 自定义 Skill 集合

面向 TRAE IDE 的自定义 skill 集合,用于把日常高频工作流(README 维护、面试问题归档等)封装成 AI 可调用的能力。

每个 skill 是一个目录,核心文件是 `SKILL.md`(YAML frontmatter + Markdown 工作流说明)。把目录拷贝到 TRAE skill 目录即可启用:

- macOS: `~/.trae-cn/skills/` 或 `~/.trae/skills/`
- Windows: `%USERPROFILE%\.trae-cn\skills\`

## 已收录 Skills

| Skill | 触发时机 | 作用 |
|---|---|---|
| [auto-update-readme](./auto-update-readme) | `git add` / `git commit` 之前 | 读取待提交文件,自动更新 README 的「当前进度」段,保证 README 始终反映仓库最新状态 |
| [interview-question-tracker](./interview-question-tracker) | 用户提出 Python/OS/数据库/Docker/LLM/Agent/ML/DL/安全类技术问题时 | 把问题以 FAQ 形式追加到 `面试问题集.md`,按 9 大领域分类,带日期 + 关键词,只记要点不记全量 Q&A |

## 编写规范

- 一个 skill 一个目录,目录名 = skill 名(kebab-case)
- 目录内必须有 `SKILL.md`,带 YAML frontmatter:`name` 和 `description`
- 工作流用 Step 列表写清楚,务必给出文件绝对路径(或相对仓库根的路径)
- 触发时机要明确(在哪些命令前/在什么样的话语下),避免误触发
- 如果有副作用(改文件),必须写明保存位置和回滚方式
