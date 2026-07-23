# daily-study-digest v2.0

> 将每日学习代码和笔记整理为「⭐ 核心概念 + 🔧 常用 API + 💡 进阶实战」三层 Markdown 笔记,带双层 Mermaid 知识图谱、代码四问分析、API 速查表,并同步沉淀到 knowledge/ 长期知识库。

## v2.0 新增

| 功能 | 说明 |
|---|---|
| knowledge/ 知识库 | 跨天累积概念/API/错题/问题,不再每天独立 |
| 双层知识图谱 | 学习路径层(跨天) + 每日细节层 |
| 代码四问分析 | 做什么 / 为什么有效 / 常见错误 / 改进方案 |
| review.md 复习清单 | 近期需回顾的知识点,按优先级排序 |

## 功能

- 支持 3 种触发方式:上传 zip / 指定路径 / 对话关键词
- 自动识别 4 种目录结构 + 通用 fallback
- 输出三层 MD:⭐ 核心概念 / 🔧 常用 API / 💡 进阶实战
- 开头带 Mermaid `graph LR` 知识图谱(双层:学习路径 + 每日细节)
- 结尾带 API 速查表(NumPy vs Pandas 对照)
- 代码超 20 行用 `<details>` 折叠
- 重要代码附四问分析(做什么/为什么/常见错误/改进)
- 学生提问融入对应知识点,不放最后
- 同步更新 knowledge/ 知识库(5 个文件跨天累积)

## 触发示例

| 方式 | 示例 |
|---|---|
| 上传 zip | 拖入 `day_05.zip` |
| 指定路径 | "总结 01-python/day_05" |
| 对话触发 | "整理今天的学习内容" / "总结 day_05" |

## 目录识别

| 模式 | 特征目录 | 适用范围 |
|---|---|---|
| 1. NumPy/Pandas | `02_code/` 或 `codeAll/` | 04-numpy_and_pandas |
| 2. Python 基础 | `day0N_code/` 或 `第N章*.md` | 01-python |
| 3. Linux/FastAPI | `day0N-代码/` | 03-linux |
| 4. MySQL | `01_笔记/` | 02_mysql |
| 5. 通用 fallback | 其他 | 自动识别 |

## 输出文件

| 文件 | 路径 | 说明 |
|---|---|---|
| 每日 MD | `<repo-root>/<科目>/day_XX/day_XX_digest.md` | 当天笔记 |
| 概念库 | `<repo-root>/knowledge/concepts.md` | 跨天累积 |
| API 索引 | `<repo-root>/knowledge/api-index.md` | 跨天累积 |
| 错题库 | `<repo-root>/knowledge/mistakes.md` | 跨天累积 |
| 问题库 | `<repo-root>/knowledge/questions.md` | 跨天累积 |
| 复习清单 | `<repo-root>/knowledge/review.md` | 近期回顾 |

## 安装

**一键安装到所有检测到的 agent**(推荐):

```bash
../install.sh daily-study-digest
```

**手动安装到指定 agent**:

```bash
# TRAE / Claude Code / Codex(SKILL.md 格式通用,直接拷贝)
cp -r daily-study-digest ~/.trae-cn/skills/      # TRAE
cp -r daily-study-digest ~/.claude/skills/       # Claude Code
cp -r daily-study-digest ~/.codex/skills/         # Codex

# Cursor / Cline(需要格式转换,用 install.sh 自动处理)
../install.sh daily-study-digest
```

跨 agent 兼容性说明见 [../INSTALL.md](../INSTALL.md)。

## 配套 Skills

- [interview-question-tracker](../interview-question-tracker) — 把学习中的技术问题归档到面试问题集
- [auto-update-readme](../auto-update-readme) — 提交前自动更新 README
- [redact-sensitive-paths](../redact-sensitive-paths) — push 前扫描敏感路径
