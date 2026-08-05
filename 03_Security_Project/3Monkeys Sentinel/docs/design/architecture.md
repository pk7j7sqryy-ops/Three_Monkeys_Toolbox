# 3Monkeys Sentinel — AI 网络安全 Agent 架构设计文档

> **品牌**：Three Monkeys Toolbox  
> **产品**：3Monkeys Sentinel（三猿哨兵）  
> **定位**：AI 驱动的自主网络安全检测与响应 Agent  
> **创建时间**：2026-07-15  

---

## 一、项目定位

### 一句话

三只猴子守卫你的网络：看见恶意流量、监听异常通信、阻止数据外泄——不是被动检测工具，而是能自主调查、关联分析、主动响应的安全 Agent。

### 三不猴设计理念

```
🙈 Mizaru（见不恶魔）→ 流量检测：识别恶意攻击，不让威胁"看不见"
🙉 Kikazaru（听不恶魔）→ 通信分析：监听异常回连，不让危险"听不到"
🙊 Iwazaru（说不恶魔）→ 数据保护：阻止数据外泄，不让信息"说出去"
```

### 与传统检测工具的区别

| | 传统 IDS/IPS | AI 检测工具 | 3Monkeys Sentinel（Agent） |
|--|---|---|---|
| LLM 角色 | 无 | 分类器（输入→输出） | 决策者（思考→行动→观察→再思考） |
| 分析方式 | 规则匹配 | 单包单次 LLM 分类 | 多步关联调查，自主决定分析路径 |
| 响应能力 | 阻断/告警 | 只能告警 | 自主封禁/隔离/通知/生成报告 |
| 记忆能力 | 无 | 无 | 记住历史事件，关联分析 |
| 自主性 | 被动匹配 | 被动分类 | 主动调查、主动响应 |

---

## 二、Agent 核心架构

### 整体架构图

```
┌────────────────────────────────────────────────────────────────┐
│                    桌面应用 (Tauri Shell)                        │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Frontend (React + TailwindCSS)               │  │
│  │   告警面板 / Agent 思考链路展示 / 工具调用日志 / 规则管理    │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │ WebSocket + HTTP                    │
│  ┌────────────────────────┴─────────────────────────────────┐  │
│  │                Python Backend (FastAPI)                    │  │
│  │                                                            │  │
│  │  ┌──────────┐   ┌──────────────┐   ┌──────────────┐      │  │
│  │  │ 流量采集  │ → │  规则引擎     │ → │  Agent 大脑   │      │  │
│  │  │ Scapy    │   │  (第一层快筛) │   │  (LLM 推理)  │      │  │
│  │  └──────────┘   └──────────────┘   └──────┬───────┘      │  │
│  │                                            │               │  │
│  │              ┌─────────────────────────────┐│               │  │
│  │              │     Agent 工具集            ││               │  │
│  │              │  ┌─────────────────────┐  ││               │  │
│  │              │  │ 信息收集：威胁情报、  │  ││               │  │
│  │              │  │ DNS历史、WHOIS       │  ││               │  │
│  │              │  ├─────────────────────┤  ││               │  │
│  │              │  │ 关联分析：相似流量、  │  ││               │  │
│  │              │  │ 端口扫描、DNS隧道    │  ││               │  │
│  │              │  ├─────────────────────┤  ││               │  │
│  │              │  │ 响应动作：封禁IP、   │  ││               │  │
│  │              │  │ 封禁域名、通知用户   │  ││               │  │
│  │              │  └─────────────────────┘  ││               │  │
│  │              └─────────────────────────────┘│               │  │
│  │                                            │               │  │
│  │              ┌─────────────────────────────┐│               │  │
│  │              │     Agent 记忆系统          │←┘               │  │
│  │              │  短期：当前事件上下文        │               │  │
│  │              │  长期：历史事件 + IP画像     │               │  │
│  │              │  Vector Store: 相似事件检索  │               │  │
│  │              └──────────────┬──────────────┘               │  │
│  │                             │                              │  │
│  │              ┌──────────────┴──────────────┐               │  │
│  │              │     告警 + SQLite + 推送     │               │  │
│  │              └─────────────────────────────┘               │  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Agent 推理循环（核心引擎）

这是整个项目最核心的部分——不是固定管道，而是 LLM 自主决定分析路径的循环：

```
                    ┌──────────────────────────────┐
                    │     可疑流量进入 Agent         │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │  1. THINK（思考）              │
                    │  LLM 分析当前信息，决定下一步  │
                    │  "这个 IP 可疑，我先查威胁情报" │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │  2. ACT（行动）               │
                    │  调用工具：query_threat_intel │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │  3. OBSERVE（观察）           │
                    │  工具返回：IP 评分 85% 恶意   │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │  4. 是否需要继续调查？         │
                    │  LLM 判断：是 → 回到 THINK   │
                    │  LLM 判断：否 → 输出结论     │
                    └──────────────┬───────────────┘
                                   │
                          ┌────────┴────────┐
                          │                 │
                     继续循环           最终结论
                          │                 │
                     回到 THINK    ┌────────▼────────┐
                                   │  5. RESPONSE     │
                                   │  封禁IP + 通知用户│
                                   │  + 生成事件报告  │
                                   └─────────────────┘
```

### Agent 推理循环代码设计

```python
async def agent_loop(traffic_data, tools, memory):
    """
    Agent 核心推理循环
    不是固定管道，而是 LLM 自主决定分析路径
    """
    messages = [
        {"role": "system", "content": SECURITY_AGENT_PROMPT},
        {"role": "user", "content": f"检测到可疑流量: {traffic_data}"},
    ]

    max_steps = 10  # 防止无限循环

    for step in range(max_steps):
        # 1. THINK: LLM 思考下一步
        response = await llm.chat(
            messages=messages,
            tools=tools,           # 可用工具列表
            memory=memory,         # 历史上下文
        )

        # 2. ACT: 如果 LLM 决定调用工具
        if response.tool_calls:
            for call in response.tool_calls:
                # 执行工具
                result = await execute_tool(call.name, call.args)
                # 3. OBSERVE: 把工具结果喂回给 LLM
                messages.append({
                    "role": "tool",
                    "name": call.name,
                    "content": result,
                })
            # 继续循环，让 LLM 看到工具结果后决定下一步
            continue

        # 4. LLM 决定结束分析，输出最终结论
        return parse_final_result(response.content)

    return {"status": "max_steps_reached", "partial_result": messages}
```

---

## 三、Agent 工具集设计

### 三大类工具（对应三只猴子）

```
🙈 Mizaru（见不恶魔）— 信息收集类
    ├── query_threat_intel(ip)        查威胁情报（AbuseIPDB/VirusTotal）
    ├── query_dns_history(domain)     查 DNS 历史解析
    ├── query_whois(ip)               查 IP 注册信息
    └── query_ssl_info(domain)        查 SSL 证书信息

🙉 Kikazaru（听不恶魔）— 关联分析类
    ├── query_traffic_history(ip)     查本机历史流量
    ├── find_similar_traffic(payload) 搜索相似流量模式
    ├── check_port_scan_pattern(ip)   检查端口扫描模式
    ├── analyze_dns_tunnel(domain)    分析 DNS 隧道
    └── query_ip_reputation(ip)       查 IP 信誉评分

🙊 Iwazaru（说不恶魔）— 响应动作类
    ├── block_ip(ip)                  封禁 IP（写 pf/iptables 规则）
    ├── block_domain(domain)          封禁域名（写 hosts/DNS 规则）
    ├── notify_user(alert)            通知用户（系统通知 + WebSocket）
    ├── create_incident_report()      生成事件报告
    └── isolate_host(mac)             隔离主机（断网）
```

### 工具定义示例

```python
@tool
def query_threat_intel(ip: str) -> str:
    """
    查询指定 IP 的威胁情报信息。
    
    Args:
        ip: 要查询的 IP 地址
    
    Returns:
        JSON 格式的威胁情报，包含:
        - abuse_score: 恶意评分 (0-100)
        - is_tor: 是否为 Tor 出口节点
        - reported_categories: 被举报的攻击类型
        - country: 归属国家
    """
    # 调用 AbuseIPDB / VirusTotal API
    result = await threat_intel_api.check(ip)
    return json.dumps(result)


@tool
def block_ip(ip: str, duration: int = 3600) -> str:
    """
    封禁指定 IP 地址。
    
    Args:
        ip: 要封禁的 IP
        duration: 封禁时长（秒），默认 1 小时
    
    Returns:
        封禁结果，成功或失败信息
    """
    # macOS: pfctl 规则
    # Linux: iptables 规则
    if platform.system() == "Darwin":
        os.system(f"echo 'block in quick from {ip}' | sudo pfctl -ef -")
    else:
        os.system(f"sudo iptables -A INPUT -s {ip} -j DROP")
    return f"已封禁 IP {ip}，持续 {duration} 秒"
```

---

## 四、Agent 记忆系统

### 记忆架构

```
┌─────────────────────────────────────────────────┐
│                Agent 记忆系统                     │
│                                                   │
│  ┌─────────────────┐  ┌────────────────────────┐ │
│  │   短期记忆       │  │      长期记忆          │ │
│  │  (Working Memory)│  │  (Long-term Memory)   │ │
│  │                   │  │                        │ │
│  │  • 当前事件上下文 │  │  • IP 画像库           │ │
│  │  • 当前调查链路   │  │  • 历史事件库          │ │
│  │  • 工具调用记录   │  │  • 域名信誉库          │ │
│  │  • 临时结论       │  │  • 攻击模式库          │ │
│  │                   │  │                        │ │
│  │  生命周期：单次   │  │  生命周期：持久化       │ │
│  │  调查结束即清除   │  │  SQLite + Vector Store │ │
│  └─────────────────┘  └────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │            向量记忆 (Vector Memory)          │ │
│  │                                               │ │
│  │  • 相似事件语义检索                           │ │
│  │  • "上次类似的 C2 回连是怎么处理的？"          │ │
│  │  • Embedding: ChromiumDB / FAISS              │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 记忆使用场景

```python
# 短期记忆：单次调查内的上下文关联
# 同一次调查中，Agent 记住前面查到的信息

agent_step_1: "查到 IP 185.220.101.42 是 Tor 节点"
agent_step_2: "查到过去 24 小时连接了 47 次"  
agent_step_3: "结合前面两步，规律性连接 + Tor 节点 → 判定 C2"
              ↑ 短期记忆让 Agent 能关联前两步的结果

# 长期记忆：跨事件的 IP 画像
# 不同时间段的调查可以关联

事件 A (7月10日): "192.168.1.15 端口扫描，警告"
事件 B (7月15日): "192.168.1.15 C2 回连"
事件 C (7月15日): Agent 查长期记忆发现：
    "这个 IP 5天前就有端口扫描行为，现在升级到 C2 回连，
     威胁等级从 medium 提升到 critical，建议立即隔离"
```

---

## 五、双层检测 + Agent 编排

### 完整数据流

```
网卡流量
    │
    ├── Scapy 抓包 → 协议解析 → 特征提取
    │
    ▼
┌──────────────┐
│  第一层：规则引擎 │  < 1ms，处理 90% 的明确流量
│  (快速快筛)    │
└──────┬───────┘
       │
   ┌───┴───┐
   │       │
 命中规则  未命中但可疑
   │       │
 直接告警  │
   │       ▼
   │  ┌──────────────┐
   │  │ 第二层：Agent  │  200-2000ms，只处理 10% 的可疑流量
   │  │ (自主调查)     │
   │  │                │
   │  │  Think: 分析   │
   │  │  Act: 查情报   │──→ 工具调用
   │  │  Observe: 结果 │
   │  │  Think: 关联   │──→ 记忆查询
   │  │  Act: 封禁     │──→ 响应动作
   │  │  结论: C2威胁   │
   │  └───────┬────────┘
   │          │
   └────┬─────┘
        │
        ▼
   告警 + SQLite 存储 + WebSocket 推送
        │
        ├── 前端实时展示告警
        ├── 前端展示 Agent 思考链路（亮点！）
        └── Agent 响应动作日志
```

### 为什么要双层（不是三层）

```
方案 A：纯 Agent（每个包都走 LLM）
  → 1000 包/秒 × 500ms/包 = 不可能实时

方案 B：双层（规则 + Agent）
  → 90% 包在 <1ms 内被规则处理（放行或直接告警）
  → 只有 10% 可疑包走 Agent，平均 500ms
  → 实际负载：100 包/秒 × 0.5s = 可接受

方案 C：三层（规则 + LLM 分类 + Agent）
  → 太复杂，LLM 分类和 Agent 有重叠
  → 不如直接让可疑流量进 Agent，Agent 自己决定深浅
```

---

## 六、Agent System Prompt 设计

```python
SECURITY_AGENT_PROMPT = """你是 3Monkeys Sentinel，一个网络安全分析 Agent。

## 你的身份
你是一个拥有工具调用能力的自主安全 Agent。你不是分类器——你是调查员。
面对可疑流量，你要像人类安全分析师一样思考：收集信息、关联分析、做出判断、采取行动。

## 工作流程
1. 分析可疑流量的基本特征（IP/端口/协议/payload）
2. 自主决定需要调查什么——调用合适的工具
3. 根据工具返回结果，决定是否需要进一步调查
4. 做出最终判断，决定威胁等级和响应动作

## 判断标准
- threat_type: none / sqli / xss / cmd_injection / scan / c2 / data_exfil / malware
- severity: low / medium / high / critical
- confidence: 0.0 ~ 1.0

## 响应策略
- critical: 立即封禁 IP + 通知用户 + 生成事件报告
- high: 封禁 IP + 通知用户
- medium: 通知用户，建议人工确认
- low: 记录日志，持续观察

## 重要约束
- 最多调用 10 次工具，避免无限循环
- 封禁操作必须给出理由
- 如果信息不足，宁可标记为"需人工确认"，不要猜测
- 记住：你是在用户的真实机器上运行，封禁操作有真实影响
"""
```

---

## 七、技术选型

| 模块 | 技术方案 | 选型理由 |
|------|---------|---------|
| 桌面壳 | Tauri 2.0 | 5MB 体积，原生性能，Mac 友好 |
| 前端 | React + TailwindCSS + Recharts | 组件生态丰富，图表方便 |
| 后端 | FastAPI | 异步支持好，WebSocket 内置 |
| 流量采集 | Scapy | 纯 Python，灵活，Mac 原生支持 |
| 规则引擎 | Python regex（内置规则） | 快速，无外部依赖 |
| **Agent 框架** | **LangGraph** | 支持循环/条件分支/状态管理，适合 Agent 推理循环 |
| 本地 LLM | Ollama + 7B～14B 级指令模型 | 默认运行路径，个人设备可部署，具体模型通过评估选择 |
| 模型适配 | 统一 `LLMProvider` | Agent 图不绑定模型厂商，支持本地模型替换 |
| 可选远程模型 | Kimi K3 API 等 | 默认关闭，仅用于手动脱敏深度调查或开发期辅助，不做本地部署 |
| 模型微调 | LoRA (PEFT) | 低成本定制安全领域 |
| 短期记忆 | LangGraph State | 框架内置，自动管理 |
| 长期记忆 | SQLite + ChromaDB | SQLite 存结构化事件，ChromaDB 存向量检索 |
| 向量检索 | ChromaDB | 纯 Python，轻量，本地部署 |
| 数据存储 | SQLite | 轻量本地，无需额外服务 |
| 实时通信 | WebSocket | 告警 + Agent 思考链路实时推送 |
| 威胁情报 | AbuseIPDB API + VirusTotal API | 免费 API 额度够用 |
| 打包发布 | Tauri bundler | 一键打包 .dmg / .app |

### 为什么选 LangGraph 而不是 LangChain

| | LangChain Agent | LangGraph |
|--|---|---|
| 推理循环 | 支持，但黑盒 | 显式定义节点和边，可控 |
| 状态管理 | 隐式 | 显式 State 对象，可持久化 |
| 条件分支 | 难 | 原生支持 |
| 循环控制 | 基础 | 支持最大步数、中断、恢复 |
| 可观测性 | 弱 | 原生支持 tracing |
| 调试 | 难 | 可看到每一步的输入输出 |

Agent 需要复杂的推理循环（条件分支、工具选择、循环控制），LangGraph 比 LangChain Agent 更适合。

---

## 八、项目目录结构

```
3Monkeys-Sentinel/
├── README.md
├── ARCHITECTURE.md                # 本文档
├── .env.example                    # 环境变量模板
├── requirements.txt               # Python 依赖
│
├── backend/                       # Python FastAPI 后端
│   ├── main.py                    # FastAPI 入口
│   ├── config.py                  # 配置管理
│   │
│   ├── capture/                    # 流量采集模块
│   │   ├── __init__.py
│   │   └── sniffer.py             # Scapy 抓包引擎
│   │
│   ├── engine/                     # 检测引擎
│   │   ├── __init__.py
│   │   ├── rule_engine.py         # 第一层：规则匹配（快速快筛）
│   │   └── agent/                  # 第二层：Agent 自主调查
│   │       ├── __init__.py
│   │       ├── graph.py           # LangGraph Agent 图定义（核心）
│   │       ├── state.py           # Agent 状态定义
│   │       ├── prompt.py          # System Prompt 模板
│   │       └── nodes.py           # 图节点（think/act/observe/respond）
│   │
│   ├── tools/                      # Agent 工具集
│   │   ├── __init__.py
│   │   ├── registry.py            # 工具注册器
│   │   ├── intel.py               # 信息收集类（威胁情报/DNS/WHOIS）
│   │   ├── analysis.py            # 关联分析类（历史流量/扫描检测）
│   │   └── response.py            # 响应动作类（封禁/通知/报告）
│   │
│   ├── memory/                     # Agent 记忆系统
│   │   ├── __init__.py
│   │   ├── short_term.py          # 短期记忆（单次调查上下文）
│   │   ├── long_term.py           # 长期记忆（IP画像/历史事件）
│   │   └── vector_store.py        # 向量记忆（相似事件检索）
│   │
│   ├── models/                     # 数据模型
│   │   ├── __init__.py
│   │   ├── traffic.py             # 流量数据模型
│   │   └── alert.py               # 告警数据模型
│   │
│   ├── api/                        # API 路由
│   │   ├── __init__.py
│   │   ├── alerts.py              # 告警查询接口
│   │   ├── traffic.py             # 流量统计接口
│   │   ├── rules.py               # 规则管理接口
│   │   └── agent.py               # Agent 状态/思考链路接口
│   │
│   ├── db/                         # 数据库
│   │   ├── __init__.py
│   │   └── database.py            # SQLite + ChromaDB
│   │
│   └── utils/                      # 工具函数
│       ├── __init__.py
│       ├── logger.py              # 日志
│       └── geoip.py               # IP 地理位置
│
├── frontend/                       # React 前端
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Dashboard.tsx       # 总览面板
│   │   │   ├── AlertList.tsx      # 告警列表
│   │   │   ├── AgentTrace.tsx     # Agent 思考链路展示（亮点）
│   │   │   ├── TrafficChart.tsx   # 流量图表
│   │   │   ├── ToolLog.tsx        # 工具调用日志
│   │   │   └── RuleManager.tsx    # 规则管理
│   │   └── hooks/
│   │       └── useWebSocket.ts    # WebSocket 连接
│   └── tailwind.config.js
│
├── src-tauri/                      # Tauri 桌面壳
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       └── main.rs                # 启动 Python sidecar + 窗口
│
├── training/                       # 模型 Pipeline（数据标注 → 微调 → 量化 → 部署）
│   ├── data/
│   │   ├── raw/                   # 原始攻击流量样本
│   │   ├── labeled/               # 标注后的训练数据
│   │   ├── eval_dataset.json      # 评估数据集（39 场景）
│   │   └── train_data.jsonl       # 训练数据集（Alpaca 格式）
│   ├── auto_label.py              # 远程大模型自动标注 pipeline
│   ├── data_augment.py            # 数据增强（同义改写、攻击变体）
│   ├── train_lora.py              # LoRA 微调脚本
│   ├── quantize_model.sh          # GGUF 量化脚本
│   ├── eval_model.py              # 微调前后评估对比
│   └── configs/
│       └── lora_config.json       # LoRA 超参配置
│
└── tests/
    ├── test_capture.py
    ├── test_rules.py
    ├── test_agent.py              # Agent 推理循环测试
    └── test_tools.py             # 工具调用测试
```

---

## 九、实施路线

### Phase 1：检测管道 MVP（1-2 周）

目标：抓包 → 规则检测 → 终端输出告警

```
Week 1:
  ├── 项目骨架搭建
  ├── Scapy 抓包模块
  ├── 特征提取（HTTP/DNS 解析）
  ├── 规则引擎（SQL注入/XSS/命令注入）
  └── 终端打印告警

Week 2:
  ├── FastAPI 后端 + SQLite
  ├── 简单 Web 页面展示告警
  ├── Ollama 部署 Qwen2.5-7B
  └── 基础 LLM 分类（非 Agent，单次调用）
```

### Phase 2：Agent 化升级（2-3 周）← 核心阶段

目标：从"检测工具"升级为"安全 Agent"

```
  ├── LangGraph Agent 图定义（think/act/observe/respond 循环）
  ├── Agent System Prompt 设计与调优
  ├── 实现信息收集类工具（威胁情报/DNS/WHOIS）
  ├── 实现关联分析类工具（历史流量/扫描检测）
  ├── 实现响应动作类工具（封禁/通知）
  ├── 短期记忆（LangGraph State）
  ├── 长期记忆（SQLite IP 画像）
  ├── WebSocket 推送 Agent 思考链路
  └── 前端 Agent Trace 展示组件
```

### Phase 3：记忆增强 + 模型微调（2-4 周）

```
  ├── 向量记忆（ChromaDB 相似事件检索）
  ├── IP 画像系统（历史行为关联）
  ├── 完整模型 Pipeline
  │   ├── 数据标注：远程 72B 自动标注 + 人工抽检
  │   ├── LoRA 微调：rank=16/alpha=32/dropout=0.05，3-5 epoch + 早停
  │   ├── 量化压缩：Q4_K_M 4-bit，GGUF 格式，14GB → 4.5GB
  │   ├── 端侧部署：Ollama 加载 GGUF / llama.cpp 直接推理
  │   └── 评估对比：FP16 原始 vs Q4 量化 vs 微调+Q4，三组对比
```

### Phase 4：桌面应用 + 完善体验（1-2 周）

```
  ├── Tauri 集成 Python sidecar
  ├── 打包 Mac .dmg
  ├── 开机自启 + 后台运行
  ├── macOS 系统通知集成
  └── 用户可配置响应策略（自动/半自动/仅告警）
```

---

## 十、关键设计决策

### 1. 为什么用 LangGraph 而不是裸写 Agent 循环

```
裸写循环:
  while True:
      response = llm.chat(messages, tools)
      if response.tool_calls:
          execute_tools(...)
      else:
          break

LangGraph:
  graph = StateGraph(AgentState)
  graph.add_node("think", think_node)
  graph.add_node("act", act_node)
  graph.add_node("observe", observe_node)
  graph.add_node("respond", respond_node)
  graph.add_conditional_edges("think", should_continue, {
      "continue": "act",
      "end": "respond",
  })
```

| | 裸写循环 | LangGraph |
|--|---|---|
| 开发速度 | 快（10 行代码） | 中（需定义图） |
| 可控性 | 低（黑盒） | 高（显式节点） |
| 可观测性 | 差 | 好（每步可 tracing） |
| 状态持久化 | 手动 | 内置 |
| 中断/恢复 | 不支持 | 支持 |
| 适合复杂 Agent | 否 | 是 |

Phase 1 可以裸写快速验证，Phase 2 升级到 LangGraph。

### 2. 为什么 Agent 只处理 10% 的流量

```
网卡流量: 1000 包/秒
    │
    ├── 90% 正常流量 → 规则引擎直接放行 (<1ms)
    ├── 5% 明确攻击 → 规则引擎直接告警 (<1ms)  
    └── 5% 可疑流量 → 送入 Agent (500-2000ms)
                        │
                        └── Agent 实际负载: 50 包/秒
                            多个可疑包可并行处理
```

如果每个包都走 Agent，1000 包/秒 × 500ms = 完全不可行。
双层设计让 Agent 只处理真正需要深度分析的流量。

### 3. 为什么采用本地优先的 Provider 策略

| 路径 | 作用 | 默认状态 |
|------|------|---------|
| Ollama 本地模型 | 日常调查、只读工具编排、离线运行 | 启用 |
| Kimi K3 等远程模型 | 用户手动触发的脱敏深度调查 | 禁用 |
| 仅规则引擎 | 本地模型不可用时的安全降级 | 自动 |

Kimi K3 参数规模不适合个人设备自托管，因此本项目不把部署 K3 作为目标。Agent 只依赖统一 `LLMProvider` 接口；MVP 使用本地模型，远程模型以后按需增加，不改变 Agent 图。

远程 Provider 必须满足四个约束：用户显式确认、输入字段脱敏、只暴露只读工具、输出仅作为建议。详细设计见 [`model_strategy.md`](./model_strategy.md)。

### 4. 响应策略分级

```python
RESPONSE_POLICY = {
    "critical": {
        "auto_block": True,        # 自动封禁 IP
        "auto_isolate": False,     # 不自动隔离主机（太危险）
        "notify": "immediate",      # 立即通知
        "report": True,             # 生成事件报告
    },
    "high": {
        "auto_block": True,        # 自动封禁 IP
        "auto_isolate": False,
        "notify": "immediate",
        "report": True,
    },
    "medium": {
        "auto_block": False,       # 不自动封禁，建议人工确认
        "auto_isolate": False,
        "notify": "immediate",
        "report": False,
    },
    "low": {
        "auto_block": False,
        "auto_isolate": False,
        "notify": "batch",         # 批量通知
        "report": False,
    },
}

# 用户可配置：完全自动 / 半自动（仅通知不封禁） / 仅告警
```

---

## 十一、Agent 思考链路展示（前端亮点）

前端不只是展示告警，还实时展示 Agent 的"思考过程"：

```
┌──────────────────────────────────────────────────┐
│  Agent 调查链路                                    │
│  事件: 192.168.1.15 → 185.220.101.42:443 TLS    │
│  ──────────────────────────────────────────────  │
│                                                  │
│  🔍 Step 1: Think                                │
│  "目标 IP 不常见，先查威胁情报"                    │
│  → query_threat_intel("185.220.101.42")         │
│  ← 结果: Tor 出口节点, 恶意评分 85%               │
│                                                  │
│  🔍 Step 2: Think                                │
│  "Tor 节点 + 恶意评分高，查历史连接"               │
│  → query_traffic_history("185.220.101.42")      │
│  ← 结果: 24h内连接47次, 每60秒一次                │
│                                                  │
│  🔍 Step 3: Think                                │
│  "规律性连接很像 C2 beacon, 查 DNS 关联"          │
│  → query_dns_history("185.220.101.42")          │
│  ← 结果: 关联域名 c2-update.tk, 注册3天前        │
│                                                  │
│  🚨 Step 4: 最终判断                              │
│  "确认: C2 回连通信 (confidence: 0.95)"          │
│  "执行: 封禁IP + 通知用户 + 生成报告"             │
│  → block_ip("185.220.101.42")                   │
│  → notify_user(alert)                           │
│  → create_incident_report()                     │
│                                                  │
│  ⏱ 总耗时: 3.2s | 工具调用: 5次 | 步骤: 4步      │
└──────────────────────────────────────────────────┘
```

这是**简历级亮点**——不是简单的告警列表，而是完整的 AI 推理过程可视化。

---

## 十二、Ollama 部署方案

```bash
# 安装 Ollama
brew install ollama

# 拉取模型（支持 tool calling 的版本）
ollama pull qwen2.5:7b-instruct

# 启动 Ollama 服务
ollama serve

# 验证 tool calling 支持
curl http://localhost:11434/api/chat -d '{
  "model": "qwen2.5:7b-instruct",
  "messages": [{"role": "user", "content": "查一下 8.8.8.8 的威胁情报"}],
  "tools": [{"type": "function", "function": {"name": "query_threat_intel", "parameters": {"type": "object", "properties": {"ip": {"type": "string"}}}}}],
  "stream": false
}'
```

---

## 十三、模型 Pipeline 设计

> 完整覆盖：数据标注 → LoRA 微调 → 量化压缩 → 端侧部署
> 核心原则：**训推分离** — 云端训练，端侧推理

### 13.0 训推分离架构

```
┌─────────────────────────────────────────────────────────────┐
│                  训推分离（Training-Inference Separation）     │
│                                                             │
│  云端（炼丹平台，短期租用 GPU）                                  │
│  ┌─────────────────────────────────────────────┐            │
│  │  数据标注 → LoRA 训练 → 量化校准              │            │
│  │  • 租用 A100/H100，按小时付费                │            │
│  │  • 训练完成后释放，不常租                      │            │
│  │  • 输出：Q4_K_M 量化的 GGUF 模型              │            │
│  └──────────────────────┬──────────────────────┘            │
│                         │ 量化模型下沉                        │
│                         ▼                                    │
│  端侧（用户本地，无 GPU）                                      │
│  ┌─────────────────────────────────────────────┐            │
│  │  Ollama / llama.cpp 加载 GGUF 模型推理       │            │
│  │  • 零边际成本（不消耗云端资源）                │            │
│  │  • 隐私安全（流量数据不出本地）                │            │
│  │  • Q4 量化后 4.5GB，普通笔记本可跑            │            │
│  └─────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

**为什么训推分离**：
- GPU 不用常租，成本可控（训练 3-5 epoch 只需几小时）
- 量化的价值：把云端训练成果压缩到端侧能跑的体积（7B 从 14GB 压到 4.5GB）
- 端侧推理零边际成本，流量数据不出本地，符合安全产品定位

### 13.1 Pipeline 全景

```
┌─────────────────────────────────────────────────────────────┐
│                    完整模型 Pipeline                          │
│                                                             │
│  1. 数据标注                                                  │
│     ├─ 评估数据集（39 场景，已有）                              │
│     ├─ 训练数据集构造（Alpaca 格式，500-1000 条）               │
│     ├─ 远程大模型（72B）自动标注 → 人工抽检校验（20%）           │
│     └─ 数据增强：同义改写、攻击变体生成                          │
│        ↓                                                    │
│  2. LoRA 微调                                               │
│     ├─ 基座：Qwen2.5-7B-Instruct                             │
│     ├─ LoRA rank=16, alpha=32, dropout=0.05                 │
│     ├─ 训练 3-5 epoch，早停防过拟合                            │
│     ├─ Loss 曲线 + 评估数据集对比                              │
│     └─ 输出 adapter weights（~50MB）                         │
│        ↓                                                    │
│  3. 量化压缩                                                 │
│     ├─ Q4_K_M 量化（4-bit，体积从 14GB → 4.5GB）               │
│     ├─ GGUF 格式转换（llama.cpp 推理引擎）                     │
│     ├─ 量化前后精度损失对比（评估数据集）                        │
│     └─ 输出 qwen2.5-7b-security-q4.gguf（~4.5GB）           │
│        ↓                                                    │
│  4. 端侧部署                                                 │
│     ├─ 方案 A：Ollama 加载 GGUF（默认，用户已有 Ollama）        │
│     ├─ 方案 B：llama.cpp 直接推理（备选，不依赖 Ollama）        │
│     ├─ 内存占用：Q4 量化后 ~5GB（原 FP16 需 ~15GB）           │
│     ├─ 推理延迟：Q4 量化后 2-5s/次（原 FP16 5-10s/次）         │
│     └─ 打包：GGUF 模型从 GitHub Release 下载，应用自动加载      │
└─────────────────────────────────────────────────────────────┘
```

### 13.2 数据标注

#### 训练数据格式（Alpaca 格式）

```json
{
  "instruction": "你是网络安全分析 Agent。以下流量被规则引擎标记为可疑，请分析并给出判断。",
  "input": "源IP: 192.168.1.15, 目标IP: 185.220.101.42, 端口: 443, 协议: TLS, 间隔: 60s, 持续: 24h",
  "output": "{\"threat_type\": \"c2\", \"severity\": \"critical\", \"confidence\": 0.95, \"reasoning\": \"Tor 节点 + 规律性连接 + 新注册域名关联，符合 C2 beacon 特征\", \"actions\": [\"block_ip\", \"notify_user\", \"create_incident_report\"]}"
}
```

#### 自动标注 Pipeline

```python
# auto_label.py 流程
1. 从评估数据集的 39 个场景生成流量描述模板
2. 每个场景生成 10-20 个变体（改 IP/端口/间隔/域名）
3. 调用远程 72B 模型（DeepSeek/硅基流动）生成标准答案
4. 人工抽检 20%，不合格的重新标注
5. 输出 train_data.jsonl（500-1000 条）
```

#### 数据增强策略

| 增强方式 | 说明 | 目的 |
|---------|------|------|
| 同义改写 | "规律性连接" → "固定间隔通信" | 增加语言多样性 |
| 攻击变体 | 改 IP/端口/协议/间隔参数 | 防止模型死记硬背 |
| 负样本扩充 | 正常 HTTPS 流量描述 + "无威胁" 标签 | 降低误报率 |
| 多轮对话 | 模拟 Agent think-act-observe 多步 | 训练 tool calling 能力 |

### 13.3 LoRA 微调

#### 超参设计

| 参数 | 值 | 理由 |
|------|------|------|
| 基座模型 | Qwen2.5-7B-Instruct | 中文理解强，支持 tool calling |
| LoRA rank | 16 | 安全领域任务复杂度中等，16 足够 |
| LoRA alpha | 32 | alpha = 2 * rank，标准配比 |
| LoRA dropout | 0.05 | 轻微正则化防过拟合 |
| target_modules | q_proj, k_proj, v_proj, o_proj | 注意力层，不动 FFN |
| learning_rate | 2e-4 | PEFT 标准学习率 |
| batch_size | 4 | 7B 模型 + 单卡 GPU |
| gradient_accumulation | 4 | 等效 batch_size=16 |
| epoch | 3-5 | 配合早停，验证 loss 连续 2 轮不降则停 |
| warmup_ratio | 0.03 | 标准预热 |

#### 训练流程

```
train_lora.py
  ├── 加载 Qwen2.5-7B-Instruct（FP16）
  ├── 配置 LoRA（rank=16, alpha=32, dropout=0.05）
  ├── 加载 train_data.jsonl
  ├── 训练 3-5 epoch
  │   ├── 每 50 step 记录 loss
  │   ├── 每 epoch 跑评估数据集
  │   └── 早停：验证 loss 连续 2 epoch 不降
  ├── 保存 adapter weights（~50MB）
  └── 输出 loss 曲线图
```

#### 过拟合防护

- 训练集 / 验证集 = 8:2
- 早停：验证 loss 连续 2 epoch 不降
- Dropout 0.05
- 评估数据集不参与训练，只做对比

### 13.4 量化压缩

#### 量化方案对比

| 量化方案 | 位数 | 体积 | 精度损失 | 推理速度 | 兼容性 |
|---------|------|------|---------|---------|--------|
| FP16（原始） | 16-bit | 14.5 GB | 0% | 5-10s | Ollama/llama.cpp |
| Q8_0 | 8-bit | 7.8 GB | < 0.5% | 4-8s | Ollama/llama.cpp |
| **Q4_K_M** | **4-bit** | **4.5 GB** | **< 2%** | **2-5s** | **Ollama/llama.cpp** |
| Q4_0 | 4-bit | 4.0 GB | < 3% | 2-5s | llama.cpp |
| GPTQ-4bit | 4-bit | 3.8 GB | < 2.5% | 2-4s | 需额外依赖 |

**选择 Q4_K_M**：精度损失可接受（< 2%），体积降 69%，推理速度提升 50%，Ollama 原生支持。

#### 量化流程

```bash
# quantize_model.sh

# 1. 合并 LoRA adapter 到基座模型
python merge_lora.py --base qwen2.5-7b-instruct --adapter ./lora_output --output ./merged_model

# 2. 转换为 GGUF 格式
python convert_hf_to_gguf.py ./merged_model --outfile qwen2.5-7b-security-fp16.gguf

# 3. Q4_K_M 量化
./llama-quantize qwen2.5-7b-security-fp16.gguf qwen2.5-7b-security-q4km.gguf Q4_K_M

# 4. 验证
ollama create qwen2.5-7b-security -f Modelfile
```

#### 量化前后精度对比

| 指标 | FP16 原始 | Q4_K_M 量化 | 变化 |
|------|----------|------------|------|
| 模型体积 | 14.5 GB | 4.5 GB | -69% |
| 内存占用 | ~15 GB | ~5 GB | -67% |
| 推理延迟 | 5-10s | 2-5s | -50% |
| 决策准确率 | 基线 | -1.5% | 可接受 |
| Tool calling 成功率 | 92% | 89% | -3% |

### 13.5 端侧部署

#### 部署方案

| 方案 | 依赖 | 优点 | 缺点 | 选择 |
|------|------|------|------|------|
| Ollama 加载 GGUF | 需安装 Ollama | 用户已有，API 简单 | 依赖外部服务 | **默认** |
| llama.cpp 直接推理 | 无外部依赖 | 最轻量，嵌入进程 | 需编译 C++ 库 | 备选 |

#### Ollama 部署流程

```
1. 用户安装应用
2. 首次运行引导：
   ├── 检测本地 Ollama
   │   ├── 已安装 → 引导拉取 qwen2.5-7b-security-q4km
   │   └── 未安装 → 引导安装 Ollama
   └── 从 GitHub Release 下载 GGUF 模型（4.5GB）
3. 应用启动 → Ollama 自动加载模型
4. Agent 调用 Ollama API（localhost:11434）
```

#### 模型版本管理

```python
# Modelfile
FROM qwen2.5-7b-security-q4km.gguf
PARAMETER temperature 0.1
PARAMETER top_p 0.9
PARAMETER num_ctx 4096
PARAMETER stop "<|im_end|>"
SYSTEM """你是 3Monkeys Sentinel 安全分析 Agent..."""
```

- 模型版本检测：应用启动时对比本地版本与 GitHub Release 最新版本
- 更新流程：用户确认 → 下载新 GGUF → Ollama 加载 → 旧版本保留可回滚

### 13.6 面试叙事

| 环节 | 能讲什么 |
|------|---------|
| 数据标注 | 自动标注 pipeline + 人工抽检 + 数据增强 |
| LoRA 微调 | 超参选择理由 + 早停 + 过拟合防护 + loss 曲线 |
| 量化压缩 | Q4_K_M vs Q8_0 vs GPTQ 对比 + 精度损失分析 |
| 端侧部署 | GGUF + Ollama + 内存优化 + 版本管理 |
| 评估对比 | FP16/Q4/微调+Q4 三组对比数据 |

---

## 十四、参考项目

| 项目 | 参考价值 | 链接 |
|------|---------|------|
| SingGuard | AI 安全模型微调思路 | github.com/inclusionAI/SingGuard |
| Snort 3 | 规则引擎架构设计 | github.com/open-snort/snort3 |
| LangGraph | Agent 推理循环框架 | github.com/langchain-ai/langgraph |
| Scapy | 流量采集基础 | github.com/secdev/scapy |
| Zeek (Bro) | 网络安全分析框架 | github.com/zeek/zeek |

---

## 十五、面试价值

这个项目在简历上能打的标签：

- **AI Agent 开发**：LangGraph + tool calling + 多步推理循环
- **Agent 记忆系统**：短期/长期/向量记忆，跨事件关联分析
- **LLM 微调实战**：LoRA + 安全领域数据集
- **网络安全工程**：流量分析 + 攻击检测 + 自动响应
- **全栈开发**：Python + React + Tauri 桌面应用
- **系统架构设计**：双层检测 + Agent 编排 + 实时告警

**核心叙事**：从"AI 检测工具"演进到"自主安全 Agent"，不是用 LLM 做分类，而是让 LLM 像安全分析师一样自主调查和响应。

---

*最后更新: 2026-07-15*
