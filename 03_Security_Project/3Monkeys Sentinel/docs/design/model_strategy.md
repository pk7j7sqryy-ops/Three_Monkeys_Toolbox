# 模型策略设计 — 本地优先与可选 Kimi K3

> - 版本: v1.0
> - 更新日期: 2026-07-28
> - 状态: 已确认
> - 依赖: `architecture.md`、`agent_graph.md`、`features.md`

---

## 一、设计决策

3Monkeys Sentinel 采用“本地优先、Provider 解耦、远程模型显式选择”的模型策略：

1. 运行时默认使用 Ollama 中的本地 7B～14B 级模型。
2. Kimi K3 不做本地部署，不是运行时强依赖，也不进入实时检测热路径。
3. Agent 通过统一 `LLMProvider` 接口使用模型，业务流程不绑定具体厂商或模型名称。
4. 远程模型默认关闭，只允许用户对单个高价值事件手动开启。
5. 发送远程模型前必须生成脱敏事件摘要，不发送原始 payload、凭据或完整内网信息。
6. 模型只输出调查结论和响应建议，不直接执行封禁、隔离等写操作。

这项决策优先保证个人项目可运行、数据隐私和后续可替换性，不以部署超大模型作为项目目标。

---

## 二、模型角色划分

| 层级 | 默认实现 | 职责 | 是否必需 |
|------|---------|------|---------|
| 实时检测 | 规则引擎 + 流量特征 | 快速筛选、聚合事件、计算异常分数 | 是 |
| 本地调查 | Ollama 本地模型 | 调查规划、只读工具调用、生成结构化结论 | 是 |
| 深度调查 | Kimi K3 API 或其他远程模型 | 用户手动触发的复杂攻击链分析 | 否 |
| 开发辅助 | Kimi K3 / 其他强模型 | 训练数据标注、攻击变体生成、红队评测、Judge | 否 |

Kimi K3 在本项目中代表一个可选 Provider，而不是独立服务或必须部署的基础设施。

---

## 三、运行时路由

```text
规则引擎 / Flow 聚合
        │
        ▼
生成 IncidentBundle
        │
        ▼
本地 LLMProvider（默认）
        │
        ├── 已有充分证据 → 输出结构化调查结果
        │
        └── 复杂事件且用户显式同意
                  │
                  ▼
           脱敏与字段裁剪
                  │
                  ▼
       Remote LLMProvider（可选 Kimi K3）
                  │
                  ▼
           输出结构化调查建议
                  │
                  ▼
       独立策略引擎 / 人工确认
```

远程模型失败、超时或未配置时，调查流程回退到本地模型；本地模型不可用时，系统降级为规则引擎模式。

---

## 四、Provider 抽象

```python
from typing import Protocol

class LLMProvider(Protocol):
    name: str
    is_remote: bool

    async def investigate(
        self,
        incident: "IncidentBundle",
        tools: list["ReadOnlyTool"],
    ) -> "InvestigationResult":
        ...
```

所有 Provider 必须返回同一结构：

```python
class InvestigationResult(BaseModel):
    threat_type: str
    severity: str
    confidence: float
    evidence_ids: list[str]
    missing_evidence: list[str]
    proposed_actions: list[str]
    summary: str
```

约束：

- Provider 只能接收当前调查允许使用的只读工具。
- 输出必须通过 JSON Schema / Pydantic 校验。
- `proposed_actions` 只是建议，不能在 Provider 内执行。
- 模型内部推理内容不作为产品接口，不写入普通日志，也不直接展示给前端。

---

## 五、Kimi K3 使用边界

### 允许

- 开发阶段生成攻击场景变体和候选标注。
- 对独立测试集执行辅助评审，但最终标签需要人工确认。
- 用户主动选择后，对脱敏的复杂事件包进行一次性深度调查。
- 分析较长时间范围内的告警、工具结果和事件关联。

### 禁止

- 在个人电脑上自托管完整 Kimi K3。
- 将 Kimi K3 放入逐包检测或实时事件热路径。
- 默认自动上传流量数据。
- 上传原始 payload、API Key、Cookie、认证头或完整内网拓扑。
- 向远程 Provider 暴露 `block_ip`、`block_domain`、`isolate_host` 等写工具。
- 把模型原始思考内容当作审计证据或直接展示给用户。

---

## 六、远程数据最小化

远程 Provider 只接收 `RemoteIncidentBundle`：

| 字段 | 处理方式 |
|------|---------|
| 事件 ID | 使用随机 ID |
| 内网 IP | 使用稳定的会话内别名，如 `host-A` |
| 外部 IP / 域名 | 用户可配置保留或哈希 |
| payload | 不发送，只保留长度、哈希和规则命中特征 |
| Header / Cookie / Token | 删除 |
| 流量时序 | 保留聚合统计，不发送原始包 |
| 工具结果 | 字段白名单 + 长度限制 + 敏感信息扫描 |

启用远程调查前，前端必须展示将要发送的字段摘要，并由用户确认。

---

## 七、配置模式

```toml
[llm]
default_provider = "ollama"

[llm.remote]
enabled = false
provider = "kimi"
model = "kimi-k3"
manual_only = true
send_raw_payload = false
```

支持三种运行模式：

| 模式 | 行为 |
|------|------|
| `local_only` | 只使用本地模型，默认模式 |
| `remote_manual` | 用户对单个事件手动调用远程模型 |
| `rules_only` | 不使用任何 LLM，仅运行规则与统计检测 |

当前阶段不提供自动远程路由模式。

---

## 八、分阶段落地

| 阶段 | 实现内容 |
|------|---------|
| MVP | `OllamaProvider` + `rules_only` 降级，不接 K3 |
| Agent 稳定后 | 固化 `LLMProvider` 和 `InvestigationResult` 接口 |
| 评估阶段 | 使用强模型辅助生成测试候选，人工审核后入库 |
| 可选增强 | 增加 `KimiProvider`，仅支持手动脱敏调查 |

Kimi K3 接入不阻塞 MVP，也不作为项目完成标准。

---

## 九、验收标准

- 未配置远程 Provider 时，应用不会产生任何远程 LLM 请求。
- 切换 Provider 不改变 Agent 图和业务数据模型。
- 远程调用失败不会阻塞规则引擎和本地告警。
- 远程请求中不包含原始 payload、密钥或认证信息。
- 所有模型输出均通过统一 Schema 校验。
- 任意 Provider 都不能绕过策略引擎直接执行响应动作。
