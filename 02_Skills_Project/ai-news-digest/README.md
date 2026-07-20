# ai-news-digest

> TRAE 自定义 Skill:每日 AI 行业情报速览生成器。
> 用 WebSearch 搜索当日动态,按 6 大分区整理成结构化 Markdown,每条情报关联到 24 周学习路线。

完整定义见 [SKILL.md](./SKILL.md)。

## 触发时机

- **定时**:工作日 12:00(用 TRAE Schedule 配置)
- **主动**:用户说"今天 AI 有什么新消息"、"跑一下 ai-news-digest"
- **关键词**:用户提到"AI 新闻"、"AI 情报"、"行业动态"、"GitHub trending"

## 输出文件

`<repo-root>/Ai_News/AI情报速览_YYYY-MM-DD.md`

固定 6 大分区:

| 分区 | 关注重点 |
|---|---|
| 微调 / RL | LoRA、PEFT、GRPO、RLVR、对齐 |
| 安全大模型 | 安全测评、AI 工具风险、攻击防御 |
| Agent / Harness | Agent 框架、MCP、Token 优化 |
| 模型发布 | Qwen、Llama、DeepSeek、Claude |
| 算力 / 芯片 | AI 芯片、推理加速、vLLM |
| 开源生态 | GitHub trending、Awesome 项目 |

## 与通用新闻聚合器的区别

1. **关联学习路线**:每条情报必须给出"对应第几周/哪个主题",无关联不收录
2. **来源可追溯**:每条附原文链接,不主观渲染
3. **开篇导读**:开头一句"今日最值得关注",3 秒看完重点
4. **控制长度**:每日 6-12 条,80-120 行

## 与其他 skill 的协作

| Skill | 协作点 |
|---|---|
| `auto-update-readme` | 生成后自动在 README 进度段加一条 |
| `interview-question-tracker` | 技术点值得做面试题时追加到题集 |
| `redact-sensitive-paths` | push 前扫一遍,避免引用本机路径 |

## 示例输出片段

```markdown
# AI 情报速览 | 2026-07-04

> **今日最值得关注:GitHub AI/Skills 生态全面爆发,Superpowers 突破 21 万星...**

---

## 微调 / RL

**1. LightRFT:上海 AI Lab 开源轻量全模态 RL 微调框架**
上海 AI 实验室安全可信中心联合 DeepLink 团队开源 LightRFT,支持 LLM/VLM 的 GRPO/GSPO/RLVR 训练...
> 关联:第 10-12 周 GRPO/RLVR;框架可复用于 SOC Copilot 安全微调实验

来源:https://blog.51cto.com/u_17605021/14433944
```

## 定时任务(可选)

用 TRAE 的 Schedule 工具配置每日 12:00 自动运行:

```
action: create
cron_expression: "0 12 * * 1-6"   # 周一到周六 12:00
timezone: "Asia/Shanghai"
name: "ai-news-digest-daily"
```

## 已知遗留

详见 [SKILL.md](./SKILL.md#已知遗留) 的「已知遗留」段。核心:

1. WebSearch 结果可能滞后(1-2 小时内的新闻未必被索引)
2. 关联学习路线靠 LLM 语义判断,可能漏判/多判
3. 来源质量参差,聚合站二手报道可能失真
4. 不爬全文,可能错过原文细节
5. 单次约 8-15k tokens,定时高频跑要算成本

## 安装

```bash
cp -r ai-news-digest ~/.trae-cn/skills/
```
