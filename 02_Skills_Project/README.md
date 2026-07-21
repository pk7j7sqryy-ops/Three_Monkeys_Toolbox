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
| [ai-news-digest](./ai-news-digest) | 工作日 12:00 定时 / 主动调用 / 关键词触发 | 用 WebSearch 搜当日 AI 行业动态,按 6 大分区整理成 `Ai_News/AI情报速览_YYYY-MM-DD.md`,每条情报关联到 24 周学习路线 |
| [redact-sensitive-paths](./redact-sensitive-paths) | `git push` 之前 | 扫描仓库里硬编码的本机绝对路径、用户名、邮箱、API key/token、私钥等敏感信息,自动替换为占位符,带规则/白名单/映射表 |
| [daily-study-digest](./daily-study-digest) | 上传学习 zip / "总结 day_XX" / 指定路径 | 自动识别 4 种目录结构(NumPy/Pandas、Python、Linux/FastAPI、MySQL),把每日 .py 和 .md 整理成「⭐ 核心概念 / 🔧 常用 API / 💡 进阶实战」三层 MD,带 Mermaid 知识图谱和 API 速查表 |

## 编写规范

- 一个 skill 一个目录,目录名 = skill 名(kebab-case)
- 目录内必须有 `SKILL.md`,带 YAML frontmatter:`name` 和 `description`
- 工作流用 Step 列表写清楚,文件路径用 `<repo-root>/...` 占位符,**不硬编码本机绝对路径**(如 `~/...` 这种带真实用户名的),运行时由 `git rev-parse --show-toplevel` 或环境变量 `REPO_ROOT` 推断
- 触发时机要明确(在哪些命令前/在什么样的话语下),避免误触发
- 如果有副作用(改文件),必须写明保存位置和回滚方式
- 推送前用 [redact-sensitive-paths](./redact-sensitive-paths) 扫一遍,防止漏写硬编码路径
