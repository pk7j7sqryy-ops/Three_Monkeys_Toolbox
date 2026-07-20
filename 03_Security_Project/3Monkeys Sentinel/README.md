# 3Monkeys Sentinel · AI 网络安全 Agent

> Three Monkeys Toolbox 旗下核心产品 — 三只猴子守卫你的网络:看见恶意流量、监听异常通信、阻止数据外泄。

不是被动检测工具,而是能自主调查、关联分析、主动响应的安全 Agent。LLM 不是分类器,而是决策者(思考 → 行动 → 观察 → 再思考)。

## 设计理念

```
🙈 Mizaru(见不恶魔) → 流量检测:识别恶意攻击,不让威胁"看不见"
🙉 Kikazaru(听不恶魔) → 通信分析:监听异常回连,不让危险"听不到"
🙊 Iwazaru(说不恶魔) → 数据保护:阻止数据外泄,不让信息"说出去"
```

## 核心架构

**双层检测 + Agent 编排**:

- 第一层 — 规则引擎(< 1ms,处理 90% 明确流量)
- 第二层 — LangGraph Agent(200-2000ms,处理 10% 可疑流量,自主决定分析路径)
- 记忆系统 — 短期 State + 长期 SQLite IP 画像 + 向量记忆(ChromaDB)
- 响应策略 — critical/high/medium/low 四级,对应自动封禁 / 通知 / 报告等动作

Agent 推理循环:`THINK → ACT → OBSERVE → 判断是否继续 → RESPONSE`。

## 技术栈

| 模块 | 方案 |
|---|---|
| 桌面壳 | Tauri 2.0 |
| 前端 | React + TailwindCSS + Recharts |
| 后端 | FastAPI |
| 流量采集 | Scapy |
| Agent 框架 | LangGraph |
| 本地 LLM | Ollama + Qwen2.5-7B-Instruct(支持 LoRA 微调 + Q4 量化) |
| 长期记忆 | SQLite + ChromaDB |
| 实时通信 | WebSocket |

## 文档

完整设计文档在 [`docs/`](./docs) 下:

```
docs/
├── requirements/
│   └── features.md              # 功能清单、攻击场景矩阵、非功能需求
├── design/
│   ├── architecture.md          # 整体架构、Agent 推理循环、技术选型
│   ├── agent_graph.md           # LangGraph 状态机设计
│   ├── api_schema.md            # REST + WebSocket 接口契约
│   └── memory_system.md         # 三层记忆系统 + T1-T6 数据分级管道
├── testing/
│   └── testing_strategy.md      # 测试金字塔、评估数据集
└── reference/
    ├── github_projects_survey.md    # GitHub 同类项目调研
    └── ai_agent_security_threats.md # Agent 安全威胁分析
```

入口 HTML:
- `project_overview.html` — 项目总览页(Trae 生成)
- `project_overview_claude.html` — Claude 风格总览页

## 内置 Skill

`.trae/skills/doc-keeper/` 是项目自带的文档管理 skill,在对话结束 / 用户要求整理文档 / 设计变更后自动同步 `docs/` 下的设计文档。

## 实施路线

| Phase | 目标 | 周期 |
|---|---|---|
| Phase 1 | 检测管道 MVP:抓包 → 规则 → 告警 | 1-2 周 |
| Phase 2 | Agent 化升级:LangGraph + 工具集 + 记忆 + Trace 展示 | 2-3 周 |
| Phase 3 | 记忆增强 + 模型微调(LoRA + Q4 量化) | 2-4 周 |
| Phase 4 | 桌面应用打包 + 体验完善 | 1-2 周 |

## 当前状态

设计阶段,文档完备,代码尚未落地。
