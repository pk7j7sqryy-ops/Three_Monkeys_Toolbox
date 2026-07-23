---
name: "ai-news-digest"
description: "每日 AI 行业情报速览生成器:用 WebSearch 搜索当日 AI/大模型/Agent/安全大模型领域的最新动态,按 6 大分区(微调·RL / 安全大模型 / Agent·Harness / 模型发布 / 算力芯片 / 开源生态)整理成结构化 Markdown 速览,每条情报带标题、一段描述、来源链接、关联到学习路线的具体周次。每日定时触发(工作日 12:00 或用户主动调用),产出文件 Ai_News/AI情报速览_YYYY-MM-DD.md。"
---

# AI News Digest · 每日 AI 情报速览

> Three Monkeys Toolbox 旗下信息整合 Skill —— 持续追踪 AI 行业动态,关联到 24 周学习路线。
> 不是简单堆链接,而是每条情报都标出"对我哪一周的学习有帮助"。

## 触发时机

- **定时触发**:工作日 12:00(可由 cron / 定时任务调用,详见 Schedule 工具配置)
- **主动调用**:用户说"今天 AI 有什么新消息"、"整理今日情报"、"跑一下 ai-news-digest"
- **关键词触发**:用户提到"AI 新闻"、"AI 情报"、"行业动态"、"今天有什么新模型"、"GitHub trending"

## 设计原则

1. **关联学习路线**:每条情报必须给出"关联到第几周/哪个主题",无关联的情报不收录。这是和通用新闻聚合器的核心区别。
2. **结构化分区**:固定 6 大分区,便于横向对比(今天微调有啥、安全大模型有啥)
3. **来源可追溯**:每条情报附原文链接,不带主观渲染
4. **开篇导读**:开头一句"今日最值得关注",3 秒看完重点
5. **控制长度**:每日 6-12 条情报,单文件 80-120 行,过载反而降低吸收效率

## 工作流

### Step 1: 确定日期与今日重点

- 取当天日期 `YYYY-MM-DD`(以 `Asia/Shanghai` 时区为准)
- 检查 `<repo-root>/Ai_News/AI情报速览_YYYY-MM-DD.md` 是否已存在
  - 已存在 → 询问用户:覆盖重写 / 追加 / 取消。默认追加分隔线后在末尾追加
  - 不存在 → 新建

### Step 2: 多线程 WebSearch 搜索

并行发起 6 组 WebSearch,每组 3-5 个查询关键词:

| 分区 | 搜索关键词示例 |
|---|---|
| 微调 / RL | `LoRA fine-tuning news 2026`、`GRPO RLVR 强化学习 最新`、`PEFT 参数高效微调 进展` |
| 安全大模型 | `大模型安全 测评报告 2026`、`LLM safety benchmark`、`AI 编程工具 安全风险` |
| Agent / Harness | `AI Agent framework news`、`Claude Code Cursor 安全`、`MCP server 新项目` |
| 模型发布 | `新模型发布 2026年7月`、`open source LLM release`、`Qwen Llama DeepSeek 新版本` |
| 算力 / 芯片 | `AI 芯片 自研 2026`、`推理加速 投机解码`、`vLLM SGLang 部署` |
| 开源生态 | `GitHub trending AI 2026`、`开源 Agent skills 项目`、`Awesome LLM` |

搜索时**必须用当年年份**(系统时间 2026-07-20,关键词带 `2026`),避免搜出旧文。

### Step 3: 筛选与去重

对每组搜索结果:
1. 看发布日期,**过滤 48 小时之外的**(老新闻不收录,除非是"近一周持续发酵"话题)
2. 去重(同一事件被多家媒体报的,只保留信息量最大的一条)
3. **关联性筛选**:能否对应到 24 周学习路线的某一周/某个主题?无关联的不收录

### Step 4: 写入结构化 Markdown

文件路径:`<repo-root>/Ai_News/AI情报速览_YYYY-MM-DD.md`

模板:

```markdown
# AI 情报速览 | YYYY-MM-DD

> **今日最值得关注:**<突出一条最有价值的>。<一句话总结趋势>

---

## 微调 / RL

**1. <标题,15-25 字,带关键名词>**
<一段描述,30-80 字,讲清楚是什么 + 关键数字/指标 + 与现有方案对比>
> 关联:第 N 周 <主题>,<这条情报如何帮助第 N 周的学习或项目>

来源:https://<原文链接>

**2. ...**

---

## 安全大模型
...

## Agent / Harness
...

## 模型发布
...

## 算力 / 芯片
...

## 开源生态
...

---

## 今日小结

- **趋势**:一句话
- **对我学习路线的影响**:是否需要调整周计划?(通常不需要)
- **未收录但值得关注**:<1-2 条未关联学习路线但值得记录的>
```

### Step 5: 可选 —— 同步到学习笔记

如果用户启用了 Ailearn(见 `01_Ai_Project/AI learning website 2`),可询问是否把"今日最值得关注"同步到 Ailearn 笔记库的「行业情报」分区。

### Step 6: 提交(可选)

询问用户是否 commit:
```bash
git add Ai_News/AI情报速览_YYYY-MM-DD.md
git commit -m "daily: AI 情报速览 YYYY-MM-DD"
git push
```

如果用户配置了 `auto-update-readme` skill,会先自动更新 README 的"当前进度"段(添加"AI 情报速览 YYYY-MM-DD 已生成"条目)。

## 输出文件命名规则

- 文件名:`AI情报速览_YYYY-MM-DD.md`(中文 + 下划线)
- 时区:`Asia/Shanghai`
- 同一天多次运行:默认追加,在文件末尾加 `---\n\n## 补充 · HH:MM\n\n...`
- 跨日不合并:严格按日期分文件

## 关联学习路线(24 周)

为方便 Step 3 的关联筛选,列出路线锚点:

| 阶段 | 周次 | 主题 | 关联情报类型 |
|---|---|---|---|
| 零 | 第 0 周 | 环境搭建 | GPU/驱动/CUDA 新闻 |
| 一 | 第 1-6 周 | Python/PyTorch/算法/Git | Python 新版本、PyTorch 新特性、刷题技巧 |
| 二 | 第 7-10 周 | Transformer/LoRA/GRPO | **微调/RL 是核心情报源** |
| 三 | 第 11-19 周 | SOC Copilot 项目(SFT+RL+评测+Agent) | **安全大模型、Agent/Harness 是核心情报源** |
| 四 | 第 20-24 周 | 工程化/技术博客/简历/投递 | 求职市场动态、面试题风向 |

## 注意事项

1. **来源链接必须可点击**:用 markdown 标准链接格式 `[标题](url)`,避免裸 URL
2. **避免主观渲染**:描述事实 + 数字,不要写"震惊!"、"革命性!"这种标题党
3. **数字必须准确**:模型参数、性能提升比例、星数等,引用原文,不要估算
4. **不收录**:
   - 营销稿、软文(无具体技术信息)
   - 纯政治/财经新闻(除非直接影响 AI 行业,如出口管制)
   - 48 小时前的旧闻(除非持续发酵)
5. **每周 1-2 条 GitHub trending**:开源生态分区聚焦本周新晋项目,避免每天都重复同样的热门项目
6. **图片不下载**:情报速览是纯文本 + 链接,不抓图片(避免版权 + 加快生成)
7. **本机绝对路径**:本 SKILL.md 不含本机绝对路径,产出文件路径用 `<repo-root>` 占位符。运行时根据 `git rev-parse --show-toplevel` 或当前工作目录推断

## 与其他 skill 的协作

| Skill | 协作点 |
|---|---|
| `auto-update-readme` | 情报生成后,触发 auto-update-readme 在 README"当前进度"段加一条"AI 情报速览 YYYY-MM-DD 已生成" |
| `interview-question-tracker` | 如果某条情报里提到的技术点值得做面试题,触发该 skill 追加到面试问题集 |
| `redact-sensitive-paths` | 情报速览里可能引用本机路径(如"参考 ~/AiLLM/.../notes/面试问题集.md"),push 前需脱敏 |

## 已知遗留

1. **WebSearch 结果可能滞后**:某些刚发布的新闻 1-2 小时内未必被搜索引擎索引,可让用户主动告知
2. **关联学习路线靠人工判断**:Step 3 的"能否对应到第 N 周"是 LLM 语义判断,可能漏判或多判
3. **来源质量参差**:toutiao、sina.cn、eastmoney 等聚合站的二手报道,可能失真,优先用官方博客 / arxiv / GitHub
4. **不爬全文**:只看搜索结果摘要,可能错过原文里的关键技术细节
5. **多语言处理**:英文新闻标题保留原文,中文新闻用中文标题,不强制翻译
6. **token 消耗**:6 组并发 WebSearch + 整理 100 行 Markdown,单次约 8-15k tokens,定时任务高频跑要注意成本

## 定时任务配置(可选)

如需每日 12:00 自动运行:

**TRAE**(用 Schedule 工具):

```
action: create
cron_expression: "0 12 * * 1-6"   # 周一到周六 12:00(用户工作日是周一到周六)
timezone: "Asia/Shanghai"
message: |
  运行 ai-news-digest skill:
  1. 在 <repo-root>/Ai_News/ 下生成 AI情报速览_YYYY-MM-DD.md(今日日期,Asia/Shanghai 时区)
  2. 6 大分区(微调·RL / 安全大模型 / Agent·Harness / 模型发布 / 算力芯片 / 开源生态),每区 1-3 条
  3. 每条情报必须关联到 24 周学习路线的某一周
  4. 如果今日文件已存在,询问是覆盖重写还是追加
  5. 完成后 commit + push(若用户在 message 里没说"不要推送")
  6. 不打扰,完成后只在终端显示一句"AI 情报速览 YYYY-MM-DD 已生成,共 N 条"
name: "ai-news-digest-daily"
```

## 安装

**一键安装到所有检测到的 agent**:

```bash
# 在 02_Skills_Project/ 下
./install.sh ai-news-digest
```

**手动安装**(TRAE / Claude Code / Codex 通用 SKILL.md 格式):

```bash
cp -r ai-news-digest ~/.trae-cn/skills/      # TRAE
cp -r ai-news-digest ~/.claude/skills/       # Claude Code
cp -r ai-news-digest ~/.codex/skills/         # Codex
```

Cursor / Cline 需要格式转换,用 `install.sh` 自动处理。
