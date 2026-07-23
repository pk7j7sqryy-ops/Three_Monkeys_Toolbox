# Security Project · 网络安全方向项目集合

围绕「AI + 安全」做的两个子项目:一个是 AI 驱动的本地网络安全 Agent(3Monkeys Sentinel),一个是审计 AI Agent 客户端自身隐蔽信道的扫描器(aiagent-covert-channel-scan)。

## 子项目

| 项目 | 定位 | 状态 |
|---|---|---|
| [3Monkeys Sentinel](./3Monkeys%20Sentinel) | AI 驱动的自主网络安全检测与响应 Agent(双层检测 + Agent 推理循环 + 记忆系统) | 设计阶段,文档完备 |
| [aiagent-covert-channel-scan](./aiagent-covert-channel-scan) | AI Agent 客户端隐蔽信道审计 Skill(通用 Agent Skill + Python 扫描器,兼容 TRAE/Claude Code/Codex/Cursor/Cline) | 可用,纯静态扫描 |

## 设计呼应

两者都呼应「Three Monkeys」三不猴理念:

- 🙈 Mizaru(见不恶魔)— Sentinel 流量检测 / 扫描器静态规则识别
- 🙉 Kikazaru(听不恶魔)— Sentinel 通信分析 / 扫描器提示词隐写检测
- 🙊 Iwazaru(说不恶魔)— Sentinel 数据保护 / 扫描器阻止数据外传
