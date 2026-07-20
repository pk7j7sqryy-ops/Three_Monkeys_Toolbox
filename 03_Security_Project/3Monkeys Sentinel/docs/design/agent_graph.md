# Agent 核心架构设计 — LangGraph 推理循环

> 版本: v1.0
> 更新日期: 2026-07-15
> 依赖: features.md (AGT-01 ~ AGT-07)

---

## 一、设计目标

Agent 不是固定管道，而是**LLM 自主决定分析路径**的推理系统。面对可疑流量，Agent 像人类安全分析师一样：收集信息 → 关联分析 → 做出判断 → 采取行动。

核心要求：
1. **可控**：每一步输入输出可观测、可追踪
2. **可中断**：单步失败不导致整个 Agent 崩溃
3. **可恢复**：支持从 checkpoint 恢复调查状态
4. **有上限**：防止无限循环，最多 10 步

---

## 二、LangGraph 状态定义

```python
from typing import TypedDict, Annotated, List, Dict, Any, Optional
from langgraph.graph.message import add_messages

class ToolCall(TypedDict):
    name: str
    args: Dict[str, Any]
    result: Optional[str]
    timestamp: float

class AgentState(TypedDict):
    # 输入：可疑流量数据
    traffic: Dict[str, Any]
    
    # 消息历史（LangChain 格式，自动合并）
    messages: Annotated[list, add_messages]
    
    # 当前调查步数
    step_count: int
    
    # 已调用的工具记录
    tool_calls: List[ToolCall]
    
    # 当前中间结论
    interim_conclusion: Optional[str]
    
    # 最终结论
    final_decision: Optional[Dict[str, Any]]
    
    # 错误信息（如果某步失败）
    error: Optional[str]
    
    # 记忆检索结果
    memory_context: Optional[str]
```

### 状态流转说明

- `traffic`：由规则引擎触发传入，包含原始流量特征
- `messages`：核心对话历史，包含 system prompt + user prompt + tool results
- `step_count`：每次进入 `think_node` 时 +1，达到 `MAX_STEPS` 强制结束
- `tool_calls`：每次调用工具追加记录，用于展示 Agent Trace
- `final_decision`：包含 `threat_type`、`severity`、`confidence`、`actions`

---

## 三、图结构定义

```
                    ┌─────────────┐
         ┌─────────►│  __start__  │◄────────┐
         │          └──────┬──────┘         │
         │                 │                │
         │                 ▼                │
         │          ┌─────────────┐         │
         │    ┌────►│  load_memory │         │
         │    │     └──────┬──────┘         │
         │    │            │                │
         │    │            ▼                │
         │    │     ┌─────────────┐         │
         │    └─────┤  think_node │◄────────┘
         │          └──────┬──────┘         │
         │                 │                │
         │        ┌────────┴────────┐       │
         │        │                 │       │
         │   [tool_calls]      [no tool]    │
         │        │                 │       │
         │        ▼                 ▼       │
         │   ┌─────────┐      ┌──────────┐  │
         │   │act_node │      │ summarize│  │
         │   └────┬────┘      └────┬─────┘  │
         │        │                │        │
         │        ▼                ▼        │
         │   ┌──────────┐      ┌─────────┐  │
         └───┤observe_node│     │respond_node│
             └────┬─────┘      └────┬────┘
                  │                 │
                  └────────┬────────┘
                           ▼
                    ┌─────────────┐
                    │  __end__    │
                    └─────────────┘
```

### 节点说明

#### 1. `load_memory` — 记忆加载

```python
def load_memory(state: AgentState) -> AgentState:
    """调查开始前，加载相关历史记忆作为上下文"""
    traffic = state["traffic"]
    dst_ip = traffic.get("dst_ip")
    
    # 从长期记忆检索 IP 画像
    ip_profile = long_term_memory.get_ip_profile(dst_ip)
    
    # 从向量记忆检索相似事件
    similar_events = vector_store.query(
        text=f"{dst_ip} {traffic.get('protocol')} suspicious traffic",
        top_k=3
    )
    
    memory_context = format_memory_context(ip_profile, similar_events)
    
    # 将记忆上下文加入 messages
    messages = state["messages"]
    messages.append({
        "role": "system",
        "content": f"相关历史记忆:\n{memory_context}"
    })
    
    return {**state, "messages": messages, "memory_context": memory_context}
```

#### 2. `think_node` — 思考决策

```python
async def think_node(state: AgentState) -> AgentState:
    """LLM 分析当前信息，决定下一步行动"""
    step_count = state["step_count"] + 1
    
    if step_count > MAX_STEPS:
        return {
            **state,
            "step_count": step_count,
            "error": f"达到最大步数限制 ({MAX_STEPS})",
            "final_decision": {"status": "max_steps_reached", "severity": "unknown"}
        }
    
    # 调用 LLM，传入 tools 定义
    response = await llm.achat(
        messages=state["messages"],
        tools=available_tools,  # 工具 schema 列表
    )
    
    return {
        **state,
        "step_count": step_count,
        "messages": state["messages"] + [response],
    }
```

#### 3. `act_node` — 执行工具

```python
async def act_node(state: AgentState) -> AgentState:
    """执行 LLM 请求调用的工具"""
    last_message = state["messages"][-1]
    tool_calls = last_message.tool_calls
    
    new_tool_records = []
    tool_results = []
    
    for call in tool_calls:
        tool_name = call["name"]
        tool_args = call["args"]
        
        try:
            # 通过注册器查找并执行工具
            result = await tool_registry.execute(tool_name, tool_args)
            status = "success"
        except Exception as e:
            result = f"工具执行失败: {str(e)}"
            status = "error"
        
        new_tool_records.append({
            "name": tool_name,
            "args": tool_args,
            "result": result,
            "status": status,
            "timestamp": time.time()
        })
        
        # LangChain tool message 格式
        tool_results.append({
            "role": "tool",
            "name": tool_name,
            "content": result,
            "tool_call_id": call["id"]
        })
    
    return {
        **state,
        "tool_calls": state["tool_calls"] + new_tool_records,
        "messages": state["messages"] + tool_results,
    }
```

#### 4. `observe_node` — 观察结果

```python
def observe_node(state: AgentState) -> AgentState:
    """工具执行结果已写入 messages，此节点可做后处理"""
    # 检查是否有工具执行失败
    last_calls = state["tool_calls"][-MAX_TOOLS_PER_STEP:]
    errors = [c for c in last_calls if c["status"] == "error"]
    
    if errors:
        # 如果有错误，追加错误提示给 LLM
        error_msg = f"注意: {len(errors)} 个工具调用失败: {[e['name'] for e in errors]}"
        messages = state["messages"] + [{"role": "system", "content": error_msg}]
        return {**state, "messages": messages, "error": error_msg}
    
    return state
```

#### 5. `summarize` — 强制总结（超过步数时）

```python
def summarize(state: AgentState) -> AgentState:
    """当 LLM 未调用工具但也未给出最终结论时（如超过步数），强制总结"""
    # 追加总结指令
    messages = state["messages"] + [{
        "role": "system",
        "content": "调查步数即将耗尽，请基于已有信息给出最终判断和响应建议。"
    }]
    return {**state, "messages": messages}
```

#### 6. `respond_node` — 输出结论

```python
def respond_node(state: AgentState) -> AgentState:
    """解析 LLM 最终输出为结构化决策"""
    last_message = state["messages"][-1]
    content = last_message.content
    
    # 使用 Pydantic 模型解析结构化输出
    try:
        decision = parse_decision(content)
    except Exception:
        decision = {
            "threat_type": "unknown",
            "severity": "medium",
            "confidence": 0.5,
            "actions": ["notify_user"],
            "reason": "解析失败，降级为人工确认"
        }
    
    return {**state, "final_decision": decision}
```

### 条件边

```python
def should_continue(state: AgentState) -> str:
    """决定从 think_node 走向哪个节点

    返回值: act / summarize / respond
    - act: LLM 返回 tool_calls，继续调查
    - summarize: step >= MAX_STEPS - 1 且未给出最终结论，强制总结
    - respond: LLM 无 tool_calls 且已给出最终结论
    """
    last_message = state["messages"][-1]
    step_count = state["step_count"]
    has_tool_calls = hasattr(last_message, "tool_calls") and last_message.tool_calls

    # 步数即将耗尽且仍未给出最终结论（仍在调用工具），强制总结而非继续
    if step_count >= MAX_STEPS - 1 and has_tool_calls:
        return "summarize"

    # LLM 返回 tool_calls，继续执行工具
    if has_tool_calls:
        return "act"

    # LLM 无 tool_calls 且已给出最终结论
    return "respond"

# 图构建
graph = StateGraph(AgentState)
graph.add_node("load_memory", load_memory)
graph.add_node("think", think_node)
graph.add_node("act", act_node)
graph.add_node("observe", observe_node)
graph.add_node("summarize", summarize)
graph.add_node("respond", respond_node)

graph.set_entry_point("load_memory")
graph.add_edge("load_memory", "think")
graph.add_conditional_edges(
    "think",
    should_continue,
    {"act": "act", "summarize": "summarize", "respond": "respond"}
)
graph.add_edge("act", "observe")
graph.add_edge("observe", "think")
graph.add_edge("summarize", "respond")
graph.add_edge("respond", END)

agent = graph.compile()
```

---

## 四、错误处理与降级策略

### 4.1 LLM 调用失败

| 场景 | 处理策略 |
|------|---------|
| Ollama 未启动 | 告警提示用户启动 Ollama，本次事件标记为「需人工确认」 |
| LLM 响应超时（> 10s） | 终止本次调查，记录超时日志，标记为「分析超时」 |
| LLM 返回格式异常 | 尝试正则提取关键信息，失败则降级为「未知威胁，建议人工确认」 |
| 远程 API 不可用 | 自动 fallback 到本地 Ollama |

### 4.2 工具执行失败

| 场景 | 处理策略 |
|------|---------|
| 威胁情报 API 限流 | 返回缓存数据（如有），否则告知 LLM「情报服务暂不可用」 |
| 防火墙规则写入失败（权限不足） | 记录错误，通知用户「需要管理员权限执行封禁」 |
| 工具参数非法 | 捕获异常，返回错误信息给 LLM，让 LLM 重新决策 |

### 4.3 循环保护

```python
MAX_STEPS = 10          # 单事件最大调查步数
MAX_TOOLS_PER_STEP = 3  # 单步最多并行调用工具数
MAX_TOTAL_TOOLS = 10    # 单事件最多调用工具总数
```

---

## 五、可观测性设计

### 5.1 实时推送（WebSocket）

每完成一个节点，向前端推送事件：

```json
{
  "type": "agent_step",
  "event_id": "evt_20250715_001",
  "step": 2,
  "node": "think",
  "content": "目标 IP 是 Tor 节点，查历史连接",
  "tool_calls": [{"name": "query_traffic_history", "args": {"ip": "185.220.101.42"}}],
  "timestamp": 1690123456.789
}
```

### 5.2 持久化日志

每个 Agent 调查生成一条 trace 记录：

```python
class AgentTraceRecord:
    trace_id: str          # 唯一标识
    event_id: str          # 关联的告警事件
    traffic_summary: str   # 流量摘要
    steps: List[Step]      # 每步详情
    final_decision: dict   # 最终决策
    duration_ms: int       # 总耗时
    status: str            # success / timeout / error
```

---

## 六、面试讲解要点

1. **为什么用 LangGraph 而不是裸写循环？**
   - 显式状态管理：每个节点的输入输出清晰可追溯
   - 条件分支原生支持：`should_continue` 让 LLM 自主决定路径
   - 可观测性：每步可推送、可持久化、可回放
   - 中断恢复：编译后的 graph 支持 checkpoint（`agent.checkpointer = ...`）

2. **Agent 怎么保证不无限循环？**
   - 三级保护：`MAX_STEPS`（步数）、`MAX_TOOLS_PER_STEP`（单步工具数）、`MAX_TOTAL_TOOLS`（总工具数）
   - 超时保护：LLM 调用超时 10s

3. **如果 LLM 判断错了怎么办？**
   - 响应策略分级：critical 才自动封禁，medium 仅通知建议人工确认
   - 用户可配置为「半自动」或「仅告警」模式
   - 所有操作有日志，支持人工复核

## 并发调查与事件队列

### 事件优先级队列

Agent 慢没关系，关键是不能成为阻塞点。可疑事件进入优先级队列，Agent 按优先级消费：

| 优先级 | 触发条件 | 处理时效 |
|--------|---------|---------|
| CRITICAL | 规则命中 critical | 立即 |
| HIGH | 规则命中 high | 30 秒内 |
| MEDIUM | 行为可疑但规则未命中 | 合并后处理 |
| LOW | 轻微异常 | 丢弃或仅记录 |

### 事件去重

同一 IP 短时间内触发多次规则，60 秒内不重复调查：
- key = (dst_ip, threat_type)
- 去重窗口 60 秒

### 并发控制

- Agent 同时只处理 1 个事件（本地 7B 模型不支持高并发）
- 队列上限 100，满时丢弃 LOW 优先级
- 队列满 200 时进入紧急模式，暂停 Agent

## Agent 上下文压缩（参考 Claude Code L1-L3）

Agent 调查步数多了，messages 会越来越长。设计三级压缩：

| 级别 | 触发条件 | 压缩方式 | 成本 |
|------|---------|---------|------|
| L1 | 单条工具结果 > 2000 字符 | 截断为前 500 字符 + [truncated] | 零 |
| L2 | 总 token > 70% 上限 | 保留 system + 最近 10 条消息，旧消息移除 | 零 |
| L3 | 总 token > 85% 上限 | 旧工具结果替换为 [旧工具结果已清除] | 零 |
| L4 | 总 token > 95% 上限 | 前几步折叠为摘要消息 | 低 |
| L5 | L4 后仍超限 | 追加"上下文不足，请立即给出判断" | 零 |

阈值：MAX_CONTEXT_TOKENS = 4000（7B 模型保守估计）

## TLS 加密流量检测策略

TLS 流量无法解密 payload，只能基于元数据分析：

| 检测维度 | 可用信息 |
|---------|---------|
| SNI（Server Name Indication） | 域名是否可疑、新注册、与恶意域名匹配 |
| 证书信息 | 颁发者、有效期、自签名、SAN 列表 |
| IP 信誉 | Tor 节点、恶意 IP 库 |
| 端口 | 非标准端口、已知 C2 端口 |
| 包大小与时序 | C2 beacon 的规律性小包 |
| 连接频率 | 规律性连接间隔、短连接爆发 |

不做 TLS MITM 解密（桌面应用不应做中间人代理）。

## 离线模式降级

| 在线能力 | 离线替代 |
|---------|---------|
| AbuseIPDB/VirusTotal API | 本地缓存（最后查询结果，TTL 放宽到 24h） |
| 远程 LLM API | 切换到本地 Ollama |
| 本地 Ollama（需下载模型） | 降级为仅规则引擎 |
| 规则库更新 | 使用当前版本继续运行 |
