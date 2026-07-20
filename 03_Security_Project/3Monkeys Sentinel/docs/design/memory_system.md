# 记忆系统设计 — 短期 / 长期 / 向量记忆

> 版本: v1.0
> 更新日期: 2026-07-15
> 依赖: features.md (MEM-01 ~ MEM-05)

---

## 一、设计目标

Agent 的记忆系统解决两个问题：
1. **单次调查内**：Agent 记住前面查到的信息，用于后续关联分析（短期记忆）
2. **跨事件关联**：今天看到的事件，能关联到上周的同类事件（长期记忆）

参考 Slips 的 Profile/TimeWindow 模型和 Kitsune 的历史关联思路，设计三层记忆架构。

---

## 二、三层记忆架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent 记忆系统                          │
│                                                              │
│  ┌─────────────────┐                                        │
│  │   短期记忆        │  ← 单次调查，调查结束即清除              │
│  │  LangGraph State │                                        │
│  │  • messages      │                                        │
│  │  • step_count    │                                        │
│  │  • tool_calls    │                                        │
│  └────────┬────────┘                                        │
│           │                                                  │
│           │ 调查结束: 提取关键信息                             │
│           ▼                                                  │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │   长期记忆        │  │         向量记忆                 │   │
│  │  SQLite          │  │      ChromaDB                   │   │
│  │                  │  │                                 │   │
│  │  • ip_profiles   │  │  • event_embeddings             │   │
│  │  • events        │  │  • similarity search            │   │
│  │  • ip_history    │  │                                 │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、短期记忆（Short-term Memory）

### 3.1 存储位置

LangGraph `AgentState`，内存中，**不持久化**。

### 3.2 数据结构

已在 `agent_graph.md` 中定义，核心字段：

```python
class AgentState(TypedDict):
    traffic: Dict[str, Any]          # 原始流量
    messages: list                    # 完整对话历史（System + User + Tool results）
    step_count: int                   # 当前步数
    tool_calls: List[ToolCall]       # 工具调用记录
    interim_conclusion: Optional[str] # 中间结论
    final_decision: Optional[dict]   # 最终决策
    memory_context: Optional[str]    # 从长期记忆加载的上下文
```

### 3.3 生命周期

```
可疑流量进入
    │
    ▼
创建 AgentState（初始 messages 包含 system prompt + traffic 描述）
    │
    ▼
LangGraph 循环执行（think → act → observe → ...）
    │
    ▼
到达 respond_node，输出 final_decision
    │
    ├── 成功 → 提取关键信息写入长期记忆 → 销毁 AgentState
    │
    └── 失败/超时 → 记录失败原因 → 销毁 AgentState
```

### 3.4 上下文窗口管理

由于 LLM 上下文有限（7B 模型通常 8K 或 32K），需要控制 `messages` 长度：

```python
MAX_CONTEXT_MESSAGES = 20  # 保留最近 20 条消息

def trim_messages(messages: list) -> list:
    """保留 system prompt + 最近 N 条消息"""
    if len(messages) <= MAX_CONTEXT_MESSAGES:
        return messages
    
    # 保留第一条 system prompt
    system_msgs = [m for m in messages if m.role == "system"]
    other_msgs = [m for m in messages if m.role != "system"]
    
    return system_msgs + other_msgs[-MAX_CONTEXT_MESSAGES:]
```

---

## 四、长期记忆（Long-term Memory）

存储介质：**SQLite**，文件路径 `data/sentinel.db`。

### 4.1 IP 画像表（ip_profiles）

记录每个 IP 的历史行为画像，用于 Agent 调查时快速了解「这个 IP 以前干过什么」。

```sql
CREATE TABLE ip_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT UNIQUE NOT NULL,           -- IP 地址
    first_seen TIMESTAMP NOT NULL,     -- 首次出现时间
    last_seen TIMESTAMP NOT NULL,      -- 最近出现时间
    total_connections INTEGER DEFAULT 0, -- 总连接次数
    total_packets INTEGER DEFAULT 0,   -- 总包数
    total_bytes INTEGER DEFAULT 0,     -- 总字节数
    
    -- 威胁评估
    threat_score REAL DEFAULT 0.0,     -- 综合威胁评分 (0-100)
    highest_severity TEXT,             -- 历史最高威胁等级
    alert_count INTEGER DEFAULT 0,     -- 触发告警次数
    blocked_count INTEGER DEFAULT 0,   -- 被封禁次数
    last_block_time TIMESTAMP,         -- 上次封禁时间
    
    -- 行为标签（JSON 数组）
    tags TEXT DEFAULT '[]',            -- ["tor", "scanner", "c2"]
    
    -- 元数据
    country TEXT,                      -- 归属国家
    asn TEXT,                          -- ASN
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ip_profiles_ip ON ip_profiles(ip);
CREATE INDEX idx_ip_profiles_score ON ip_profiles(threat_score DESC);
```

### 4.2 历史事件表（events）

记录所有检测到的安全事件，支持按时间/IP/类型查询。

```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,     -- 事件 UUID
    created_at TIMESTAMP NOT NULL,
    
    -- 流量信息
    src_ip TEXT NOT NULL,
    dst_ip TEXT NOT NULL,
    dst_port INTEGER,
    protocol TEXT,
    
    -- 检测结果
    threat_type TEXT,
    severity TEXT,
    confidence REAL,
    reason TEXT,
    
    -- 来源
    source TEXT,                       -- "rule_engine" / "agent"
    rule_id TEXT,
    agent_trace_id TEXT,
    
    -- 响应
    actions_taken TEXT DEFAULT '[]',   -- JSON 数组
    blocked BOOLEAN DEFAULT FALSE,
    
    -- 用户反馈
    user_feedback TEXT,                -- "confirmed" / "false_positive" / null
    
    -- 原始流量摘要（JSON）
    traffic_summary TEXT
);

CREATE INDEX idx_events_time ON events(created_at DESC);
CREATE INDEX idx_events_src_ip ON events(src_ip);
CREATE INDEX idx_events_dst_ip ON events(dst_ip);
CREATE INDEX idx_events_threat ON events(threat_type);
CREATE INDEX idx_events_severity ON events(severity);
```

### 4.3 IP 历史连接表（ip_history）

记录每个 IP 的近期连接模式，用于检测 C2 beacon、扫描等行为。

```sql
CREATE TABLE ip_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    dst_port INTEGER,
    protocol TEXT,
    packet_size INTEGER,
    interval_sec INTEGER,              -- 与上次连接的间隔（秒）
    
    -- 特征
    flags TEXT,                        -- TCP flags
    payload_hash TEXT                  -- 负载哈希（检测规律负载）
);

CREATE INDEX idx_ip_history_ip_time ON ip_history(ip, timestamp DESC);

-- 自动清理：只保留最近 7 天的记录（通过应用层定时任务）
```

### 4.4 读写时序

```
Agent 调查开始时
    │
    ├── 读 ip_profiles（ dst_ip ）→ 获取 IP 画像
    │
    ├── 读 events（ src_ip OR dst_ip, 最近 7 天）→ 获取近期关联事件
    │
    └── 读 ip_history（ dst_ip, 最近 24h ）→ 获取连接模式
    │
    ▼
合成 memory_context 注入 AgentState
    │
    ▼
Agent 循环执行
    │
    ▼
Agent 调查结束
    │
    ├── 写 events → 记录本次事件
    │
    ├── 写/更新 ip_profiles → 更新威胁评分、出现次数
    │
    ├── 写 ip_history → 记录连接（如果尚未记录）
    │
    └── 写 vector_store → 生成事件 embedding 存入 ChromaDB
```

### 4.5 IP 画像更新逻辑

```python
def update_ip_profile(ip: str, event: Event):
    """根据新事件更新 IP 画像"""
    profile = db.get_ip_profile(ip)
    
    if not profile:
        # 新建画像
        profile = IPProfile(
            ip=ip,
            first_seen=event.created_at,
            last_seen=event.created_at,
            total_connections=1,
            alert_count=1 if event.severity in ["high", "critical"] else 0,
            threat_score=severity_to_score(event.severity) * event.confidence,
            highest_severity=event.severity,
            tags=[event.threat_type]
        )
    else:
        # 更新画像
        profile.last_seen = event.created_at
        profile.total_connections += 1
        profile.alert_count += 1 if event.severity in ["high", "critical"] else 0
        
        # 威胁评分：指数加权移动平均
        new_score = severity_to_score(event.severity) * event.confidence
        profile.threat_score = profile.threat_score * 0.7 + new_score * 0.3
        
        # 更新最高等级
        if severity_rank(event.severity) > severity_rank(profile.highest_severity):
            profile.highest_severity = event.severity
        
        # 更新标签
        if event.threat_type not in profile.tags:
            profile.tags.append(event.threat_type)
    
    if event.blocked:
        profile.blocked_count += 1
        profile.last_block_time = event.created_at
    
    db.save_ip_profile(profile)
```

---

## 五、向量记忆（Vector Memory）

存储介质：**ChromaDB**，存储路径 `data/chroma_db/`。

### 5.1 存储内容

将历史事件转化为文本描述，生成 embedding 存入向量库。Agent 调查时通过语义相似度检索「类似事件」。

```python
# 事件文本化模板
EVENT_TEXT_TEMPLATE = """
事件类型: {threat_type}
威胁等级: {severity}
流量方向: {src_ip} -> {dst_ip}:{dst_port} ({protocol})
判断理由: {reason}
响应动作: {actions}
时间: {created_at}
"""

def event_to_text(event: Event) -> str:
    return EVENT_TEXT_TEMPLATE.format(
        threat_type=event.threat_type,
        severity=event.severity,
        src_ip=event.src_ip,
        dst_ip=event.dst_ip,
        dst_port=event.dst_port,
        protocol=event.protocol,
        reason=event.reason,
        actions=event.actions_taken,
        created_at=event.created_at
    )
```

### 5.2 ChromaDB Collection 设计

```python
import chromadb
from chromadb.config import Settings

client = chromadb.PersistentClient(
    path="data/chroma_db",
    settings=Settings(anonymized_telemetry=False)
)

# 事件向量集合
events_collection = client.get_or_create_collection(
    name="events",
    metadata={"hnsw:space": "cosine"}
)

# 写入示例
events_collection.add(
    ids=[event.event_id],
    documents=[event_to_text(event)],
    metadatas=[{
        "threat_type": event.threat_type,
        "severity": event.severity,
        "dst_ip": event.dst_ip,
        "created_at": event.created_at.isoformat()
    }]
)

# 检索示例
def find_similar_events(query_text: str, top_k: int = 3) -> list:
    results = events_collection.query(
        query_texts=[query_text],
        n_results=top_k,
        where={"severity": {"$in": ["high", "critical"]}}  # 只检索高危事件
    )
    return format_results(results)
```

### 5.3 使用场景

```python
# Agent 调查时，自动检索相似事件
query = f"{traffic.dst_ip} {traffic.protocol} suspicious connection"
similar = find_similar_events(query, top_k=3)

memory_context = ""
if similar:
    memory_context = "发现相似历史事件:\n"
    for evt in similar:
        memory_context += f"- {evt['created_at']}: {evt['threat_type']}, {evt['reason']}\n"
```

### 5.4 数据清理

```python
# 向量库也只做近期事件的语义检索，定期清理旧数据
CLEANUP_DAYS = 90  # 保留 90 天

def cleanup_old_vectors():
    """清理 90 天前的向量数据"""
    cutoff = datetime.now() - timedelta(days=CLEANUP_DAYS)
    # ChromaDB 0.4.x 支持 where 删除
    events_collection.delete(
        where={"created_at": {"$lt": cutoff.isoformat()}}
    )
```

---

## 六、记忆使用场景示例

### 场景 1：短期记忆关联（同一次调查内）

```
Step 1: query_threat_intel("185.220.101.42")
         → 返回: Tor 节点, 恶意评分 85%

Step 2: query_traffic_history("185.220.101.42")
         → 返回: 24h 内连接 47 次
         → Agent 通过 messages 看到 Step 1 的结果，关联:
           "Tor 节点 + 高频连接 = 很可能是 C2"

Step 3: query_dns_history("185.220.101.42")
         → 返回: 关联域名 c2-update.tk, 注册 3 天前
         → Agent 关联前三步:
           "Tor + 高频 + 新注册域名 = 确认 C2"
```

### 场景 2：长期记忆关联（跨事件）

```
事件 A (7月10日): 192.168.1.15 → 8.8.8.8:53 DNS，标记为 "dns_tunnel"
事件 B (7月12日): 192.168.1.15 → 1.1.1.1:53 DNS，标记为 "dns_tunnel"
事件 C (7月15日): 192.168.1.15 → 9.9.9.9:53 DNS

Agent 调查事件 C 时:
  - 查 ip_profiles("192.168.1.15") → tags: ["dns_tunnel"], alert_count: 2
  - 查 events("192.168.1.15", 最近 7 天) → 发现两次 DNS 隧道历史
  - 结论: "该主机多次 DNS 隧道行为，本次极有可能是同一攻击的延续"
  - 响应: 提升威胁等级，直接封禁域名并隔离主机建议
```

### 场景 3：向量记忆相似检索

```
当前事件: 192.168.1.20 → 185.220.101.43:443 TLS
Agent 检索相似事件:
  - 返回 7月15日事件: 192.168.1.15 → 185.220.101.42:443 (C2)

Agent 推理:
  "IP 段相似（185.220.101.x），端口相同（443），协议相同（TLS）
   上次同类事件确认为 C2，本次应优先排查 C2 可能性"
```

---

## 七、性能考量

| 记忆类型 | 查询延迟 | 数据量 | 优化策略 |
|---------|---------|--------|---------|
| 短期记忆 | < 1ms | 单次调查 < 100KB | 内存中，无需优化 |
| 长期记忆 SQLite | < 10ms | 预计 < 100万条 | 索引 + 分区（按月分表） |
| 向量记忆 ChromaDB | < 50ms | 预计 < 10万条 | HNSW 索引，90 天清理 |

---

## 八、实现建议

1. **SQLite 连接池**：使用 `aiosqlite` 做异步 SQLite 操作，避免阻塞事件循环
2. **批量写入**：Agent 调查结束后的写入操作（events + ip_profiles + vector）合并为一次事务
3. **Embedding 模型**：使用轻量模型如 `sentence-transformers/all-MiniLM-L6-v2`（80MB），本地生成 embedding，不调用外部 API
4. **备份策略**：SQLite 文件每日自动备份到 `data/backups/`，保留最近 7 天

---

## T1-T6 数据分级管道

参考 Claude Code L1-L5 分级压缩设计，将数据按价值分级存储：

| 层级 | 数据类型 | 存储位置 | 保留时间 | 触发方式 | 成本 |
|------|---------|---------|---------|---------|------|
| T1 | 原始包 | 内存 Ring Buffer | 60 秒 | 包进入即写入 | 零 |
| T2 | Flow 摘要 | 内存 + SQLite | 1h（正常）/ 30d（可疑） | 每 5s 批量聚合 | 低 |
| T3 | 事件记录 | SQLite | 7d 清空 payload / 30d 删除 | 规则命中或 Agent 结束 | 中 |
| T4 | IP 画像 | SQLite | 90d 精简，评分永久 | Agent 写入 / 每日聚合 | 中 |
| T5 | 向量记忆 | ChromaDB | 90d | 事件写入时生成 embedding | 高 |
| T6 | 决策摘要 | SQLite | 永久 | Agent respond 输出 | 最高 |

### 存储阈值触发

| 阈值 | 触发动作 |
|------|---------|
| SQLite > 200MB | 警告，清理 T2 正常 Flow |
| SQLite > 500MB | 压缩，T3 清空 payload + T2 删除正常 Flow |
| SQLite > 1GB | 紧急，只保留最近 24h 所有数据 |
| Agent 队列 > 50 | 警告用户 |
| Agent 队列 > 100 | 合并相似事件 |
| Agent 队列 > 200 | 丢弃低优先级事件 |

### 补充表结构

#### rules 表

```sql
CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    pattern TEXT NOT NULL,          -- 正则或 Suricata 语法
    threat_type TEXT NOT NULL,      -- sqli/xss/cmd_injection/scan/c2/...
    severity TEXT NOT NULL,         -- low/medium/high/critical
    is_enabled INTEGER DEFAULT 1,
    hit_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

#### blocked_ips 表

```sql
CREATE TABLE IF NOT EXISTS blocked_ips (
    ip TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    severity TEXT NOT NULL,
    blocked_by TEXT NOT NULL,       -- 'agent' 或 'rule_engine'
    alert_id TEXT,
    blocked_at TEXT NOT NULL,
    expires_at TEXT,                -- NULL = 永久
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (alert_id) REFERENCES alerts(id)
);
```

#### agent_traces 表

```sql
CREATE TABLE IF NOT EXISTS agent_traces (
    id TEXT PRIMARY KEY,
    alert_id TEXT NOT NULL,
    step INTEGER NOT NULL,
    node TEXT NOT NULL,              -- think/act/observe/respond
    content TEXT,
    tool_name TEXT,
    tool_args TEXT,                  -- JSON
    tool_result TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (alert_id) REFERENCES alerts(id)
);
```

#### schema_version 表

```sql
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);
```

### 数据保留策略（完整版）

| 数据表 | 保留时间 | 清理方式 |
|--------|---------|---------|
| packets (Ring Buffer) | 60 秒 | 内存自动覆盖 |
| flows（正常） | 1 小时 | 定时删除 |
| flows（可疑） | 30 天 | 定时删除 |
| events | 7 天清空 payload_snippet，30 天删除完整记录 | 两阶段清理 |
| ip_history | 7 天 | 定时删除 |
| ip_profiles | 永久（评分），90 天精简标签 | 标签精简 |
| agent_traces | 30 天 | 定时删除 |
| alerts | 30 天 | 定时删除 |
| blocked_ips | 过期自动删除，活跃的永久 | TTL 过期 |
| vector_memory (ChromaDB) | 90 天 | 定时删除旧向量 |
| audit_log（文件） | 永久 | 不清理 |

### 24h 数据量预估

| 数据类型 | 预估大小 |
|---------|---------|
| 原始包（Ring Buffer） | ~50MB |
| 全量 Flow 摘要 | ~20MB + 5MB（可疑） |
| 告警事件 | ~10MB |
| IP 画像 | ~5MB |
| IP 连接历史 | ~30MB |
| 向量记忆 | ~50MB |
| 审计日志 | ~1MB |
| **总计** | **~120MB** |
