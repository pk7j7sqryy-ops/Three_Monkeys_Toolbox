# 接口契约设计 — REST API + WebSocket 协议

> 版本: v1.0
> 更新日期: 2026-07-15
> 依赖: features.md (UI-01 ~ UI-07, APP-01 ~ APP-05)

---

## 一、设计原则

1. **前后端同机运行**：桌面应用场景下，后端监听 `127.0.0.1`，前端通过 Tauri 的 `fetch` 或原生 HTTP 调用
2. **实时推送优先**：告警和 Agent Trace 通过 WebSocket 推送，避免前端轮询
3. **REST 用于查询**：历史数据、配置管理通过 REST API
4. **Pydantic 全链路校验**：请求/响应模型统一用 Pydantic v2 定义

---

## 二、数据模型定义

### 2.1 流量数据模型

```python
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum

class Protocol(str, Enum):
    TCP = "TCP"
    UDP = "UDP"
    HTTP = "HTTP"
    HTTPS = "HTTPS"
    DNS = "DNS"
    TLS = "TLS"
    OTHER = "OTHER"

class Traffic(BaseModel):
    id: str = Field(..., description="流量唯一标识，UUID")
    timestamp: datetime = Field(..., description="捕获时间")
    src_ip: str = Field(..., description="源 IP")
    dst_ip: str = Field(..., description="目的 IP")
    src_port: int = Field(..., description="源端口")
    dst_port: int = Field(..., description="目的端口")
    protocol: Protocol = Field(..., description="协议类型")
    payload_size: int = Field(default=0, description="负载大小（字节）")
    payload_hash: Optional[str] = Field(default=None, description="负载哈希（用于去重/关联）")
    payload_snippet: Optional[str] = Field(default=None, description="负载前 200 字符摘要（HTTP/DNS 等）")
    flags: Optional[str] = Field(default=None, description="TCP flags 或其他标志")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="协议特定字段，如 HTTP method/URI/DNS query")
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "trf_a1b2c3",
                "timestamp": "2026-07-15T10:30:00Z",
                "src_ip": "192.168.1.15",
                "dst_ip": "185.220.101.42",
                "src_port": 54321,
                "dst_port": 443,
                "protocol": "TLS",
                "payload_size": 1024,
                "payload_hash": "sha256:abc...",
                "metadata": {"sni": "c2-update.tk", "tls_version": "1.3"}
            }
        }
```

### 2.2 告警数据模型

```python
class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class ThreatType(str, Enum):
    NONE = "none"
    SQLI = "sqli"
    XSS = "xss"
    CMD_INJECTION = "cmd_injection"
    SCAN = "scan"
    C2 = "c2"
    DATA_EXFIL = "data_exfil"
    MALWARE = "malware"
    DNS_TUNNEL = "dns_tunnel"
    BRUTE_FORCE = "brute_force"
    UNKNOWN = "unknown"

class AlertAction(str, Enum):
    BLOCK_IP = "block_ip"
    BLOCK_DOMAIN = "block_domain"
    NOTIFY = "notify_user"
    REPORT = "create_incident_report"
    ISOLATE = "isolate_host"

class Alert(BaseModel):
    id: str = Field(..., description="告警唯一标识")
    created_at: datetime = Field(..., description="产生时间")
    traffic_id: str = Field(..., description="关联流量 ID")
    traffic_summary: str = Field(..., description="流量摘要描述")
    
    # 检测结果
    threat_type: ThreatType = Field(..., description="威胁类型")
    severity: Severity = Field(..., description="威胁等级")
    confidence: float = Field(..., ge=0.0, le=1.0, description="置信度")
    reason: str = Field(..., description="判断理由")
    
    # 响应动作
    actions_taken: list[AlertAction] = Field(default_factory=list, description="已执行的响应动作")
    blocked: bool = Field(default=False, description="是否已封禁")
    
    # 来源
    source: str = Field(..., description="检测来源: rule_engine / agent")
    rule_id: Optional[str] = Field(default=None, description="如果来自规则引擎，记录规则 ID")
    agent_trace_id: Optional[str] = Field(default=None, description="如果来自 Agent，记录 trace ID")
    
    # 状态
    status: str = Field(default="open", description="open / acknowledged / resolved / false_positive")
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "alt_x9y8z7",
                "created_at": "2026-07-15T10:30:05Z",
                "traffic_id": "trf_a1b2c3",
                "traffic_summary": "192.168.1.15 → 185.220.101.42:443 TLS",
                "threat_type": "c2",
                "severity": "critical",
                "confidence": 0.95,
                "reason": "Tor节点 + 24h内47次规律性连接 + 关联域名注册仅3天",
                "actions_taken": ["block_ip", "notify_user", "create_incident_report"],
                "blocked": True,
                "source": "agent",
                "agent_trace_id": "trc_abc123",
                "status": "open"
            }
        }
```

### 2.3 Agent Trace 模型

```python
class AgentStep(BaseModel):
    step: int = Field(..., description="第几步")
    node: str = Field(..., description="节点类型: think / act / observe / respond")
    timestamp: float = Field(..., description="Unix 时间戳")
    content: Optional[str] = Field(default=None, description="Think/Respond 内容")
    tool_call: Optional[Dict[str, Any]] = Field(default=None, description="Act 节点调用的工具")
    tool_result: Optional[str] = Field(default=None, description="Observe 节点的工具返回")
    
class AgentTrace(BaseModel):
    trace_id: str = Field(..., description="Trace 唯一标识")
    event_id: str = Field(..., description="关联告警事件 ID")
    traffic_summary: str = Field(..., description="流量摘要")
    steps: list[AgentStep] = Field(default_factory=list, description="调查步骤")
    final_decision: Dict[str, Any] = Field(default_factory=dict, description="最终决策")
    duration_ms: int = Field(..., description="总耗时（毫秒）")
    status: str = Field(..., description="success / timeout / error / max_steps_reached")
```

---

## 三、REST API

### 3.1 告警接口

#### GET /api/alerts
查询告警列表

**请求参数（Query）**：
```python
class AlertListParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    severity: Optional[Severity] = None
    threat_type: Optional[ThreatType] = None
    source: Optional[str] = None        # "rule_engine" / "agent"
    status: Optional[str] = None        # "open" / "acknowledged" / ...
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    ip: Optional[str] = None            # 按源或目的 IP 过滤
```

**响应**：
```json
{
  "total": 156,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": "alt_x9y8z7",
      "created_at": "2026-07-15T10:30:05Z",
      "traffic_summary": "192.168.1.15 → 185.220.101.42:443 TLS",
      "threat_type": "c2",
      "severity": "critical",
      "confidence": 0.95,
      "source": "agent",
      "status": "open"
    }
  ]
}
```

#### GET /api/alerts/{alert_id}
获取单个告警详情

**响应**：`Alert` 完整模型

#### POST /api/alerts/{alert_id}/acknowledge
确认告警（标记为已确认）

**请求体**：`{"status": "acknowledged"}` 或 `{"status": "false_positive"}`

#### DELETE /api/alerts/{alert_id}
删除告警（仅前端管理用，不删除底层事件记录）

---

### 3.2 流量统计接口

#### GET /api/traffic/stats
获取流量统计概览

**请求参数**：
```python
class TrafficStatsParams(BaseModel):
    period: str = Field(default="1h", description="时间范围: 1h / 6h / 24h / 7d")
```

**响应**：
```json
{
  "period": "1h",
  "total_packets": 152340,
  "total_bytes": 234567890,
  "protocol_distribution": {
    "TCP": 120000,
    "UDP": 25000,
    "DNS": 5000,
    "OTHER": 2340
  },
  "top_talkers": [
    {"ip": "192.168.1.15", "packets": 45000, "bytes": 12345678}
  ],
  "alert_count": 12
}
```

#### GET /api/traffic/timeline
获取流量时间线（用于前端图表）

**请求参数**：`period: str = "1h"`, `interval: str = "1m"`（数据点间隔）

**响应**：
```json
{
  "timestamps": ["10:00", "10:01", "10:02", ...],
  "packets": [1200, 1350, 1100, ...],
  "alerts": [0, 1, 0, ...]
}
```

---

### 3.3 规则管理接口

#### GET /api/rules
获取规则列表

**响应**：
```json
{
  "items": [
    {
      "id": "rule_sqli_001",
      "name": "SQL 注入检测",
      "enabled": true,
      "severity": "high",
      "pattern": "(?i)(union\\s+select|or\\s+1\\s*=\\s*1)",
      "hit_count": 45,
      "created_at": "2026-07-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/rules
新增规则

**请求体**：
```python
class RuleCreate(BaseModel):
    name: str
    enabled: bool = True
    severity: Severity
    pattern: str           # 正则表达式
    protocol: Optional[Protocol] = None
    port: Optional[int] = None
    description: Optional[str] = None
```

#### PUT /api/rules/{rule_id}
更新规则

#### DELETE /api/rules/{rule_id}
删除规则

#### POST /api/rules/{rule_id}/toggle
启用/禁用规则切换

---

### 3.4 Agent 状态接口

#### GET /api/agent/status
获取 Agent 运行状态

**响应**：
```json
{
  "status": "running",
  "llm_backend": "ollama",
  "llm_model": "qwen2.5:7b-instruct",
  "total_events_processed": 156,
  "avg_processing_time_ms": 1200,
  "active_investigations": 2,
  "tool_call_count": 523
}
```

#### GET /api/agent/traces
查询 Agent 历史调查记录

**请求参数**：`page`, `page_size`, `event_id`, `status`

**响应**：`AgentTrace` 列表

#### GET /api/agent/traces/{trace_id}
获取单个 Agent Trace 详情（用于前端展示完整推理链路）

---

### 3.5 配置接口

#### GET /api/config
获取当前配置

**响应**：
```json
{
  "capture": {
    "interface": "en0",
    "enabled": true,
    "bpf_filter": "not port 22"
  },
  "llm": {
    "backend": "ollama",
    "model": "qwen2.5:7b-instruct",
    "remote_api_key": null,
    "max_steps": 10
  },
  "response_policy": "semi_auto",
  "notification": {
    "enabled": true,
    "sound": true
  }
}
```

#### PUT /api/config
更新配置（部分更新）

---

## 四、WebSocket 协议

WebSocket 路径：`ws://127.0.0.1:8000/ws`

连接建立后，后端向前端推送三类消息。

### 4.1 告警推送

```json
{
  "type": "alert",
  "data": {
    "id": "alt_x9y8z7",
    "created_at": "2026-07-15T10:30:05Z",
    "traffic_summary": "192.168.1.15 → 185.220.101.42:443 TLS",
    "threat_type": "c2",
    "severity": "critical",
    "confidence": 0.95,
    "source": "agent",
    "agent_trace_id": "trc_abc123"
  }
}
```

### 4.2 Agent Trace 步骤推送

```json
{
  "type": "agent_step",
  "trace_id": "trc_abc123",
  "event_id": "alt_x9y8z7",
  "step": 2,
  "node": "think",
  "content": "目标 IP 是 Tor 出口节点，查历史连接模式",
  "tool_call": {
    "name": "query_traffic_history",
    "args": {"ip": "185.220.101.42"}
  },
  "timestamp": 1690123456.789
}
```

```json
{
  "type": "agent_step",
  "trace_id": "trc_abc123",
  "event_id": "alt_x9y8z7",
  "step": 2,
  "node": "observe",
  "tool_result": "24h 内连接 47 次，每 60 秒一次",
  "timestamp": 1690123457.123
}
```

### 4.3 系统状态推送

```json
{
  "type": "system_status",
  "data": {
    "capture_status": "running",
    "packets_per_second": 1200,
    "alerts_today": 12,
    "agent_status": "idle",
    "llm_status": "connected"
  }
}
```

### 4.4 前端 → 后端消息

前端通过 WebSocket 发送的消息：

```json
// 请求手动触发一次 Agent 调查（调试用）
{
  "type": "manual_investigate",
  "traffic_id": "trf_a1b2c3"
}

// 心跳/确认
{
  "type": "ping"
}
```

---

## 五、错误响应规范

所有 REST API 错误统一格式：

```json
{
  "error": {
    "code": "AGENT_LLM_TIMEOUT",
    "message": "LLM 响应超时",
    "detail": {
      "traffic_id": "trf_a1b2c3",
      "timeout_seconds": 10
    }
  }
}
```

常见错误码：

| 错误码 | HTTP 状态 | 说明 |
|--------|----------|------|
| `VALIDATION_ERROR` | 422 | 请求参数校验失败 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `AGENT_LLM_TIMEOUT` | 504 | LLM 调用超时 |
| `AGENT_MAX_STEPS` | 500 | Agent 达到最大步数 |
| `TOOL_EXECUTION_FAILED` | 500 | 工具执行失败 |
| `CAPTURE_PERMISSION_DENIED` | 403 | 抓包权限不足（需要 root） |

---

## 六、实现建议

1. **CORS**：开发阶段允许 `localhost` 和 `tauri://localhost`，生产阶段关闭跨域
2. **鉴权**：桌面同机场景下不做复杂鉴权，仅校验请求来源 IP 为 `127.0.0.1`
3. **限流**：Agent 调查接口（手动触发）限制 1 次/秒，防止滥用
4. **WebSocket 重连**：前端实现指数退避重连（1s → 2s → 4s → ... → 30s）

## 补充接口

### 系统信息

#### GET /api/system/info

响应：
```json
{
  "version": "0.1.0",
  "platform": "darwin",
  "python_version": "3.11.6",
  "cpu_percent": 12.5,
  "memory_mb": 256,
  "db_size_mb": 45,
  "ollama_status": "running",
  "model": "qwen2.5:7b-instruct",
  "uptime_sec": 3600
}
```

#### GET /api/system/health

响应：
```json
{
  "status": "healthy",
  "checks": {
    "python": "ok",
    "ollama": "ok",
    "sqlite": "ok",
    "capture": "ok",
    "chromadb": "ok"
  },
  "degradation_level": 0
}
```

### Agent 手动触发

#### POST /api/agent/investigate

请求：
```json
{
  "traffic_data": {
    "src_ip": "192.168.1.15",
    "dst_ip": "185.220.101.42",
    "dst_port": 443,
    "protocol": "TLS"
  }
}
```

响应：
```json
{
  "investigation_id": "inv_xxx",
  "status": "started"
}
```

### 封禁 IP 管理

#### GET /api/blocked-ips

响应：
```json
[
  {
    "ip": "185.220.101.42",
    "reason": "C2 回连通信",
    "severity": "critical",
    "blocked_by": "agent",
    "blocked_at": "2026-07-15T10:30:00Z",
    "expires_at": "2026-07-15T11:30:00Z",
    "is_active": true
  }
]
```

#### DELETE /api/blocked-ips/{ip}

响应：
```json
{
  "ip": "185.220.101.42",
  "unblocked": true
}
```

### 工具管理

#### GET /api/tools

响应：
```json
[
  {
    "name": "query_threat_intel",
    "category": "intel",
    "description": "查询 IP 威胁情报",
    "params": {"ip": "string"},
    "timeout_sec": 10,
    "is_available": true
  }
]
```

#### POST /api/tools/{name}/test

请求：
```json
{
  "args": {"ip": "8.8.8.8"}
}
```

响应：
```json
{
  "tool": "query_threat_intel",
  "result": {"abuse_score": 0, "is_tor": false},
  "duration_ms": 350
}
```

### IP 画像查询

#### GET /api/memory/ip-profiles/{ip}

响应：
```json
{
  "ip": "185.220.101.42",
  "threat_score": 0.85,
  "tags": ["tor", "c2", "scanner"],
  "first_seen": "2026-07-10T08:00:00Z",
  "last_seen": "2026-07-15T10:30:00Z",
  "event_count": 3,
  "blocked_count": 1
}
```

### 配置管理

#### POST /api/config/threat-intel-keys

请求：
```json
{
  "abuseipdb_key": "xxx",
  "virustotal_key": "yyy"
}
```

响应：
```json
{
  "abuseipdb": "valid",
  "virustotal": "valid"
}
```

### 数据导出

#### GET /api/export/alerts?format=json&start=2026-07-01&end=2026-07-15

响应：文件下载（JSON/CSV）

#### GET /api/export/diagnostic

响应：诊断包 zip 文件下载（日志+配置，IP 脱敏）

### 数据备份恢复

#### POST /api/backup/export

响应：数据包 zip 文件下载

#### POST /api/backup/import

请求：multipart/form-data，上传 zip 文件

响应：
```json
{
  "imported": true,
  "alerts": 42,
  "rules": 15,
  "config": true
}
```

### WebSocket 补充事件

#### agent_complete

Agent 调查完成时推送：

```json
{
  "type": "agent_complete",
  "investigation_id": "inv_xxx",
  "alert_id": "alt_xxx",
  "result": {
    "threat_type": "c2",
    "severity": "critical",
    "confidence": 0.95,
    "actions": ["block_ip", "notify_user", "create_incident_report"]
  },
  "duration_sec": 3.2,
  "total_steps": 4,
  "total_tools_called": 5
}
```
