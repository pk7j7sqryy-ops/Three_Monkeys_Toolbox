# interview-question-tracker

> TRAE 自定义 Skill:把对话中的技术问题归档成结构化面试题集(FAQ 格式)。

完整定义见 [SKILL.md](./SKILL.md)。

## 触发时机

用户提出涉及以下领域的技术问题时自动触发:

| Category ID | 领域 | 关键词 |
|---|---|---|
| python | Python | 语法、GIL、装饰器、生成器等 |
| os | 操作系统 | 进程/线程、内存、Linux 命令 |
| database | 数据库 | SQL、索引、事务、Redis、MySQL |
| docker | Docker & 容器化 | Docker、K8s、CI/CD |
| llm | 大模型(LLM) | Transformer、LoRA、Prompt 工程 |
| agent | Agent & 工具编排 | ReAct、Function Calling、RAG、LangChain |
| ml | 机器学习 & 强化学习 | RLHF、GRPO、PPO |
| dl | 深度学习 | CNN/RNN、优化器、损失函数 |
| security | 网络安全 | 渗透、漏洞、IOC、ATT&CK |

**不触发**:项目管理 / git 操作 / 文件编辑等非技术话题,或用户明确说「不要记录」。

## FAQ 格式

```markdown
**Q{n}: {问题标题}** `{YYYY-MM-DD}`
> - 要点 1(一句话讲清核心概念)
> - 要点 2
> - 要点 3
> - 关键词:word1、word2(可选)
```

只记问题 + 要点,不记完整 Q&A,便于面试前快速自测。

## 输出文件

`./notes/面试问题集.md`

按 9 大领域分节,文末有累计统计表。迁移到其他仓库时改 `SKILL.md` 中 Step 2 的路径即可。

## 安装

```bash
cp -r interview-question-tracker ~/.trae-cn/skills/
```
