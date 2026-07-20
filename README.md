# Three Monkeys Toolbox

> 三只猴子工具箱 — 个人 AI / 安全 / Skill 工程化项目集合。
>
> 灵感来自「三不猴」:看见不该看的(Mizaru)、听见不该听的(Kikazaru)、说出不该说的(Iwazaru),反过来守卫网络。

## 仓库结构

```
Three_Monkeys_Toolbox/
├── 01_Ai_Project/             # AI 应用项目
│   ├── AI learning website 2/  # Ailearn · 离线学习管理网站(笔记/刷题/任务/错题/复盘)
│   └── three-monkeys-toolbox/ # 品牌设计文档 HTML 站
│
├── 02_Skills_Project/         # TRAE 自定义 Skill 集合
│   ├── auto-update-readme/    # Git 提交前自动更新 README 进度
│   └── interview-question-tracker/ # 对话中技术问题自动归档成 FAQ 面试题集
│
├── 03_Security_Project/       # 安全方向项目
│   ├── 3Monkeys Sentinel/    # AI 网络安全 Agent(双层检测 + Agent 推理循环)
│   └── aiagent-covert-channel-scan/ # AI Agent 客户端隐蔽信道审计 Skill
│
└── 04_Other_Project/         # 其他零散工具(预留)
```

## 项目矩阵

| 项目 | 类型 | 简介 | 状态 |
|---|---|---|---|
| [Ailearn](./01_Ai_Project/AI%20learning%20website%202) | AI 应用 | 纯前端离线学习闭环系统(SM-2 间隔重复 + 本地 Ollama AI 辅助) | 可用 |
| [Three Monkeys Toolbox HTML](./01_Ai_Project/three-monkeys-toolbox) | 设计文档 | 品牌门户单文件 HTML(深色主题 + Mermaid) | 可用 |
| [auto-update-readme](./02_Skills_Project/auto-update-readme) | TRAE Skill | Git 提交前自动更新 README「当前进度」 | 可用 |
| [interview-question-tracker](./02_Skills_Project/interview-question-tracker) | TRAE Skill | 技术问题自动归档为 9 大领域 FAQ 面试题集 | 可用 |
| [3Monkeys Sentinel](./03_Security_Project/3Monkeys%20Sentinel) | 安全 Agent | AI 自主网络安全检测与响应 Agent(LangGraph + 记忆 + 微调) | 设计阶段 |
| [aiagent-covert-channel-scan](./03_Security_Project/aiagent-covert-channel-scan) | 安全 Skill | 扫描 AI Agent 客户端(Claude Code / Cursor / Cline)隐蔽信道 | 可用 |

## 三不猴设计理念

整个工具箱围绕「三不猴」三只猴子展开,在不同项目里有不同的对应:

| 猴子 | 含义 | Sentinel 对应 | covert-channel-scan 对应 |
|---|---|---|---|
| 🙈 Mizaru | 见不恶魔 | 流量检测:识别恶意攻击 | 静态规则识别 |
| 🙉 Kikazaru | 听不恶魔 | 通信分析:监听异常回连 | 提示词隐写检测 |
| 🙊 Iwazaru | 说不恶魔 | 数据保护:阻止数据外泄 | 阻止数据外传 |

## 技术栈一览

- **AI 应用**:纯 Vanilla JS / localStorage / 本地 Ollama
- **Skill**:Markdown(SKILL.md YAML frontmatter)+ Python 脚本
- **安全 Agent**:Python + FastAPI + LangGraph + Scapy + Tauri + React
- **模型 Pipeline**:Qwen2.5-7B + LoRA + Q4_K_M 量化 + Ollama 部署

## 关于

作者:[sunqiyu](https://github.com/pk7j7sqryy-ops)
背景:5 年安全工程师,在做 AI + 安全方向的工具化沉淀。
