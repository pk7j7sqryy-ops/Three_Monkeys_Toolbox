---
name: "interview-question-tracker"
description: "Archives technical questions from conversation into a categorized FAQ-style interview prep file. Invoke when the user asks a technical question about Python, OS, databases, Docker, LLM, Agent, ML/RL, deep learning, or security."
---

# Interview Question Tracker

This skill automatically detects technical questions in the conversation and archives them into a structured FAQ-style interview prep file (`notes/面试问题集.md`), categorized by domain.

## When to Invoke

**MUST invoke when** the user asks a technical question involving any of these domains:

| Category ID | Display Name | Keywords |
|-------------|-------------|----------|
| python | Python | Python 语法、数据结构、标准库、GIL、装饰器、生成器等 |
| os | 操作系统 | 进程/线程、内存管理、文件系统、Linux 命令、调度等 |
| database | 数据库 | SQL、索引、事务、Redis、MySQL、MongoDB 等 |
| docker | Docker & 容器化 | Docker、K8s、镜像、容器网络、CI/CD 等 |
| llm | 大模型（LLM） | Transformer、注意力、微调 LoRA、推理优化、Prompt 工程等 |
| agent | Agent & 工具编排 | ReAct、Function Calling、RAG、LangChain、工具链等 |
| ml | 机器学习 & 强化学习 | 监督/无监督学习、RLHF、GRPO、PPO、奖励模型等 |
| dl | 深度学习 | CNN/RNN、反向传播、优化器、损失函数、正则化等 |
| security | 网络安全 | 渗透测试、漏洞、IOC、安全运营、ATT&CK 等 |

**Do NOT invoke when:**
- User asks about project management, git operations, file editing, or non-technical topics
- User explicitly says "不要记录" or "不用归档"
- User is just browsing/reviewing the question set without asking a new question

## Workflow

### Step 1: Answer the Question
First, answer the user's technical question normally in the conversation.

### Step 2: Read the Current File
Read `./notes/面试问题集.md` to get the current state (existing questions, counters).

### Step 3: Determine the Category
Classify the question into one of the 9 categories listed above. If a question spans multiple categories, pick the primary one.

### Step 4: Determine the Question Number
Find the last question number (Q1, Q2, ...) in the target category section. The new question gets the next sequential number.

### Step 5: Append the Question in FAQ Format
Insert the question at the end of the corresponding category section, before the `---` separator. Format:

```markdown
**Q{n}: {问题标题}** `{YYYY-MM-DD}`
> - 要点 1（一句话讲清核心概念）
> - 要点 2
> - 要点 3
> - 要点 4（可选，3-5 条为佳）
> - 关键词：word1、word2（可选，帮助检索）
```

Rules for the FAQ entry:
- Question title should be concise but descriptive (a real interview question style)
- 3-5 bullet points, each one sentence capturing a key concept
- Use backticks for code identifiers, function names, keywords
- Do NOT record the full Q&A — only the question + key points for self-testing
- Today's date in backticks

### Step 6: Update the Statistics Table
Increment the question count for the corresponding category and the total. Update the "最后更新" date at the bottom.

### Step 7: Save
Write the updated file back. The automated git task (weekdays 21:20) will push it to GitHub.

## File Location

- Question file: `./notes/面试问题集.md`

## File Structure (Reference)

```markdown
# 面试问题集

## 一、Python
<!-- Questions appended here -->
---

## 二、操作系统
---

## 三、数据库
---

## 四、Docker & 容器化
---

## 五、大模型（LLM）
---

## 六、Agent & 工具编排
---

## 七、机器学习 & 强化学习
---

## 八、深度学习
---

## 九、网络安全（本行优势）
---

## 累计统计
| 分类 | 问题数 |
|------|--------|
| Python | 0 |
...
| **总计** | **0** |

*最后更新: YYYY-MM-DD*
```

## Important Notes

- This skill should work silently after the main answer — do not make a big announcement, just mention "已归档" briefly
- If the question file doesn't exist yet, create it with the full structure
- Always read the file before editing to avoid overwriting
- The FAQ entry should be concise enough for quick review before interviews
- Use Chinese for all content in the question file (matching the user's language)
