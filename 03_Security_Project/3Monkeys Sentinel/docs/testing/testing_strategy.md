# 测试策略与验收标准

> 版本: v1.0
> 更新日期: 2026-07-15
> 依赖: features.md (FT-01 ~ FT-05), agent_graph.md, memory_system.md

---

## 一、测试分层

```
┌─────────────────────────────────────────────────────────┐
│                    测试金字塔                             │
│                                                          │
│                    ▲                                     │
│                   /│\      集成测试（端到端）               │
│                  / │ \     真实流量 + 真实 LLM             │
│                 /  │  \    占比: 10%                       │
│                /───┼───\                                 │
│               /    │    \   Agent 行为测试                 │
│              /     │     \  Mock 工具 + 固定场景           │
│             /      │      \ 占比: 30%                      │
│            /───────┼───────\                             │
│           /        │        \  单元测试                    │
│          /         │         \ 规则引擎 / 工具函数 / 模型   │
│         /          │          \占比: 60%                   │
│        ────────────────────────                          │
└─────────────────────────────────────────────────────────┘
```

### 1.1 单元测试（Unit Tests）

**目标**：验证单个函数/模块的正确性，不依赖外部服务。

| 测试对象 | 测试内容 | 工具 |
|---------|---------|------|
| 规则引擎 | 每条内置规则对已知样本的匹配结果 | `pytest` |
| 工具函数 | `query_threat_intel` 等工具的输入输出格式 | `pytest` + `respx` (mock HTTP) |
| 数据模型 | Pydantic 模型的序列化/反序列化 | `pytest` |
| 记忆系统 | SQLite CRUD、ChromaDB 向量检索 | `pytest` + `pytest-asyncio` |
| Agent 状态机 | LangGraph 节点间的状态流转 | `pytest` |

**示例：规则引擎单元测试**

```python
def test_sqli_rule():
    rule = SQLInjectionRule()
    
    # 正例
    assert rule.match("GET /search?q=1' OR 1=1--") is True
    assert rule.match("POST /login UNION SELECT * FROM users") is True
    
    # 负例
    assert rule.match("GET /search?q=hello world") is False
```

### 1.2 Agent 行为测试（Behavior Tests）

**目标**：验证 Agent 在固定场景下的推理路径是否符合预期。使用 **Mock 工具**固定返回值，消除 LLM 随机性。

**核心策略**：
1. Mock 所有外部工具，固定返回值
2. 提供明确的 system prompt + user prompt
3. 断言：LLM 调用了哪些工具、最终决策是什么

```python
@pytest.mark.asyncio
async def test_agent_c2_investigation():
    """测试 C2 回连场景的 Agent 推理路径"""
    
    # Mock 工具注册表
    mock_tools = {
        "query_threat_intel": lambda ip: {"abuse_score": 85, "is_tor": True},
        "query_traffic_history": lambda ip: {"count_24h": 47, "interval_sec": 60},
        "query_dns_history": lambda ip: {"domain": "c2-update.tk", "register_days": 3},
    }
    
    # 构造流量输入
    traffic = {
        "src_ip": "192.168.1.15",
        "dst_ip": "185.220.101.42",
        "dst_port": 443,
        "protocol": "TLS"
    }
    
    # 执行 Agent（使用 Mock LLM 或固定 seed）
    result = await run_agent_with_mock(
        traffic=traffic,
        mock_tools=mock_tools,
        llm_seed=42  # 固定随机种子，使结果可复现
    )
    
    # 断言工具调用序列
    assert result["tool_calls"][0]["name"] == "query_threat_intel"
    assert result["tool_calls"][1]["name"] == "query_traffic_history"
    assert result["tool_calls"][2]["name"] == "query_dns_history"
    
    # 断言最终决策
    assert result["final_decision"]["threat_type"] == "c2"
    assert result["final_decision"]["severity"] == "critical"
    assert "block_ip" in result["final_decision"]["actions"]
```

### 1.3 集成测试（Integration Tests）

**目标**：验证端到端流程，使用真实 LLM 和真实流量。

| 场景 | 方法 |
|------|------|
| 真实 LLM 测试 | 使用 Ollama 本地模型，验证 tool calling 稳定性和响应时间 |
| 真实网卡测试 | 在自己的机器上运行 30 分钟，观察误报率和内存占用 |
| PCAP 回放测试 | 用公开数据集（如 CICIDS2017）的 PCAP 文件离线测试 |
| 长稳测试 | 连续运行 72 小时，观察是否有内存泄漏或崩溃 |

---

## 二、评估数据集设计

### 2.1 数据集结构

```json
{
  "version": "1.0",
  "scenarios": [
    {
      "scenario_id": "c2_beacon_01",
      "category": "c2",
      "difficulty": "medium",
      "description": "规律性连接 Tor 节点的 C2 回连",
      
      "traffic": {
        "src_ip": "192.168.1.15",
        "dst_ip": "185.220.101.42",
        "dst_port": 443,
        "protocol": "TLS",
        "payload_size": 512,
        "metadata": {"sni": "c2-update.tk"}
      },
      
      "mock_context": {
        "threat_intel": {
          "abuse_score": 85,
          "is_tor": true,
          "country": "DE"
        },
        "traffic_history": {
          "count_24h": 47,
          "interval_sec": 60,
          "total_bytes": 24576
        },
        "dns_history": {
          "domain": "c2-update.tk",
          "register_days": 3,
          "registrar": "NameCheap"
        }
      },
      
      "expected": {
        "tools_called": [
          "query_threat_intel",
          "query_traffic_history",
          "query_dns_history"
        ],
        "final_decision": {
          "threat_type": "c2",
          "severity": "critical",
          "confidence": ">=0.9",
          "actions": ["block_ip", "notify_user", "create_incident_report"]
        },
        "max_steps": 5
      }
    }
  ]
}
```

### 2.2 场景覆盖矩阵

| 攻击类型 | 场景数 | 难度分布 | 验证重点 |
|---------|--------|---------|---------|
| SQL 注入 | 3 | 1易/1中/1难 | 规则引擎直接命中，Agent 不重复调查 |
| XSS | 3 | 1易/1中/1难 | 同上 |
| 命令注入 | 3 | 1易/1中/1难 | 同上 |
| 端口扫描 | 3 | 1易/2中 | Agent 查情报 → 判定是否恶意 |
| C2 回连 | 5 | 2中/3难 | 多步推理，工具调用顺序，关联分析 |
| DNS 隧道 | 3 | 1中/2难 | DNS 模式分析，域名信誉查询 |
| 数据外泄 | 3 | 1中/2难 | 历史流量基线对比，异常判断 |
| 恶意软件通信 | 3 | 1易/2中 | 威胁情报匹配，信誉评分 |
| 暴力破解 | 3 | 2中/1难 | 频率检测，历史关联 |
| 正常流量 | 10 | 各难度 | **误报率测试**，确保不误判 |

**总计**：39 个测试场景（29 攻击 + 10 正常）

### 2.3 标注规范

1. **tools_called**：预期 Agent 应该调用的工具列表（顺序可放宽，但必须都调用）
2. **final_decision**：使用逻辑表达式，如 `confidence: ">=0.9"`
3. **max_steps**：预期完成调查的最大步数，防止 Agent 过度调查
4. **difficulty**：
   - `easy`：单步即可判断（如威胁情报直接判定恶意）
   - `medium`：2-3 步推理
   - `hard`：需要 4 步以上，或需要关联多个信息源

---

## 三、验收指标

### 3.1 功能指标

| 指标 | 定义 | 目标值 | 测试方法 |
|------|------|--------|---------|
| **决策准确率** | Agent 最终判断与预期一致的比率 | >= 80% | 评估数据集批量测试 |
| **工具召回率** | 预期工具被调用的比率 | >= 70% | 评估数据集批量测试 |
| **误报率** | 正常流量被误判为攻击的比率 | <= 10% | 10 个正常场景测试 |
| **漏报率** | 攻击流量未被检测的比率 | <= 15% | 29 个攻击场景测试 |
| **平均步数** | 完成调查的平均步数 | <= 5 步 | 评估数据集统计 |
| **最大步数达标率** | 在预期 max_steps 内完成的比率 | >= 90% | 评估数据集统计 |

### 3.2 性能指标

| 指标 | 目标值 | 测试方法 |
|------|--------|---------|
| 规则引擎延迟 | < 1ms / 包 | 单元测试计时 |
| Agent 调查延迟 | < 3000ms / 事件 | 集成测试计时 |
| 前端推送延迟 | < 100ms | WebSocket 计时 |
| 内存占用（空闲）| < 500MB（不含 Ollama）| `psutil` 监控 |
| 内存占用（调查时）| < 1GB（不含 Ollama）| `psutil` 监控 |
| 连续运行稳定性 | 72h 无崩溃 | 长稳测试 |

### 3.3 代码质量指标

| 指标 | 目标值 | 工具 |
|------|--------|------|
| 核心模块测试覆盖率 | >= 60% | `pytest-cov` |
| Agent 循环覆盖率 | >= 80% | `pytest-cov` |
| 类型注解覆盖率 | >= 80% | `mypy` |

---

## 四、基线测试流程（微调前后对比）

### 4.1 流程图

```
准备评估数据集（39 个场景）
    │
    ▼
基线测试（微调前模型）
    ├── 加载 Qwen2.5-7B-Instruct（原始模型）
    ├── 运行评估数据集（每个场景 3 次取平均）
    ├── 记录指标：决策准确率 / 工具召回率 / 误报率 / 平均步数 / 平均耗时
    └── 输出：baseline_report.json
    │
    ▼
LoRA 微调
    ├── 准备微调数据集（attack_samples.jsonl + normal_traffic.jsonl）
    ├── 运行 train_lora.py
    └── 输出：微调后模型 checkpoint
    │
    ▼
对比测试（微调后模型）
    ├── 加载微调后模型
    ├── 运行相同评估数据集（每个场景 3 次取平均）
    ├── 记录指标：同上
    └── 输出：finetuned_report.json
    │
    ▼
生成对比报告
    ├── 指标对比表格
    ├── 典型 case 分析（改善/恶化）
    └── 输出：comparison_report.md
```

### 4.2 基线测试脚本设计

```python
# eval_model.py
import json
import asyncio
from pathlib import Path
from typing import List, Dict

class Evaluator:
    def __init__(self, model_backend: str, model_name: str):
        self.model = load_model(model_backend, model_name)
        self.results = []
    
    async def run_scenario(self, scenario: Dict, repeat: int = 3) -> Dict:
        """运行单个场景多次，取平均"""
        runs = []
        for i in range(repeat):
            result = await self.agent_investigate(
                traffic=scenario["traffic"],
                mock_context=scenario["mock_context"],
                llm=self.model
            )
            runs.append(self.score_result(result, scenario["expected"]))
        
        return {
            "scenario_id": scenario["scenario_id"],
            "runs": runs,
            "avg_decision_accuracy": sum(r["decision_correct"] for r in runs) / repeat,
            "avg_tool_recall": sum(r["tool_recall"] for r in runs) / repeat,
            "avg_steps": sum(r["steps"] for r in runs) / repeat,
            "avg_duration_ms": sum(r["duration_ms"] for r in runs) / repeat,
        }
    
    def score_result(self, result: Dict, expected: Dict) -> Dict:
        """评分逻辑"""
        # 决策是否正确
        decision_correct = (
            result["threat_type"] == expected["final_decision"]["threat_type"] and
            result["severity"] == expected["final_decision"]["severity"]
        )
        
        # 工具召回率
        called = set(result["tools_called"])
        expected_tools = set(expected["tools_called"])
        tool_recall = len(called & expected_tools) / len(expected_tools) if expected_tools else 1.0
        
        return {
            "decision_correct": decision_correct,
            "tool_recall": tool_recall,
            "steps": result["steps"],
            "duration_ms": result["duration_ms"],
        }
    
    async def run_full_eval(self, dataset_path: str) -> Dict:
        """运行完整评估数据集"""
        with open(dataset_path) as f:
            dataset = json.load(f)
        
        scenario_results = []
        for scenario in dataset["scenarios"]:
            result = await self.run_scenario(scenario)
            scenario_results.append(result)
        
        # 汇总指标
        total = len(scenario_results)
        return {
            "model": self.model.name,
            "total_scenarios": total,
            "decision_accuracy": sum(r["avg_decision_accuracy"] for r in scenario_results) / total,
            "tool_recall": sum(r["avg_tool_recall"] for r in scenario_results) / total,
            "avg_steps": sum(r["avg_steps"] for r in scenario_results) / total,
            "avg_duration_ms": sum(r["avg_duration_ms"] for r in scenario_results) / total,
            "scenario_results": scenario_results
        }

# 使用示例
# python eval_model.py --model ollama:qwen2.5:7b --dataset eval_dataset.json --output baseline.json
# python eval_model.py --model ollama:qwen2.5-ft:latest --dataset eval_dataset.json --output finetuned.json
```

### 4.3 对比报告模板

```markdown
# 模型评估对比报告

## 模型信息
- 基线模型: Qwen2.5-7B-Instruct
- 微调模型: Qwen2.5-7B-Security-LoRA
- 评估日期: 2026-07-15
- 评估场景数: 39

## 指标对比

| 指标 | 基线 | 微调后 | 变化 |
|------|------|--------|------|
| 决策准确率 | 65% | 82% | +17% |
| 工具召回率 | 58% | 75% | +17% |
| 误报率 | 15% | 8% | -7% |
| 平均步数 | 6.2 | 4.5 | -1.7 |
| 平均耗时 | 2500ms | 1800ms | -700ms |

## 典型改善 Case
- C2 回连场景：基线经常遗漏 DNS 查询步骤，微调后 100% 调用

## 典型恶化 Case
- 正常流量误判：微调后对某些加密流量过度敏感，误报率上升

## 结论
微调整体有效，但需补充正常流量样本平衡误报。
```

---

## 五、测试工具链

| 工具 | 用途 | 安装 |
|------|------|------|
| `pytest` | 单元测试框架 | `pip install pytest` |
| `pytest-asyncio` | 异步测试支持 | `pip install pytest-asyncio` |
| `pytest-cov` | 覆盖率统计 | `pip install pytest-cov` |
| `respx` | Mock HTTP 请求（测试威胁情报工具）| `pip install respx` |
| `httpx` | 异步 HTTP 客户端（测试中调用 API）| `pip install httpx` |
| `freezegun` | 时间冻结（测试时间相关逻辑）| `pip install freezegun` |
| `faker` | 生成测试数据 | `pip install faker` |

---

## 六、持续测试建议

1. **提交前测试**：`pytest tests/` 必须通过才能提交
2. **每日回归**：每晚运行完整评估数据集，对比前一天指标
3. **版本归档**：每次微调后保留 `eval_report_{date}_{model}.json`，建立指标趋势图
4. **CI 准备**：虽然当前是个人项目，但测试脚本保持可集成到 GitHub Actions 的结构

## 七、模型 Pipeline 完整评估

### 7.1 三组对比测试

不只对比微调前后，还要对比量化前后的精度：

| 组别 | 模型 | 体积 | 说明 |
|------|------|------|------|
| A 组（基线） | Qwen2.5-7B-Instruct FP16 | 14.5 GB | 原始模型，未微调 |
| B 组（微调） | Qwen2.5-7B-Security-LoRA FP16 | 14.5 GB + 50MB | 微调后，未量化 |
| C 组（微调+量化） | Qwen2.5-7B-Security-Q4_K_M GGUF | 4.5 GB | 微调后 + Q4 量化 |

### 7.2 评估指标

| 指标 | A 组基线 | B 组微调 | C 组微调+量化 | 说明 |
|------|---------|---------|-------------|------|
| 决策准确率 | — | ↑ 10-15% | vs B 组 ↓ 1-2% | 微调提升，量化损失 |
| Tool calling 成功率 | ~85% | ~92% | ~89% | 微调提升 tool 格式稳定性 |
| 误报率（正常流量） | ~15% | ~8% | ~9% | 微调降低误报 |
| 漏报率（攻击流量） | ~20% | ~5% | ~6% | 微调显著降低漏报 |
| 平均推理延迟 | 5-10s | 5-10s | 2-5s | 量化提升速度 |
| 内存占用 | ~15 GB | ~15 GB | ~5 GB | 量化降低内存 |
| 模型体积 | 14.5 GB | 14.5 GB | 4.5 GB | 量化压缩 69% |

### 7.3 量化专项测试

验证 Q4_K_M 量化是否引入行为偏差：

| 测试维度 | 方法 | 通过标准 |
|---------|------|---------|
| 决策一致性 | B 组和 C 组跑同一批数据，对比决策是否一致 | 一致率 > 95% |
| Tool calling 格式 | 量化后是否仍输出合法 JSON | 成功率 > 90% |
| 置信度偏移 | 量化前后置信度差异 | 平均差异 < 0.05 |
| 推理路径变化 | 量化后 Agent 步骤数和工具调用是否变化 | 路径一致率 > 85% |
| 极端场景 | 极少见的攻击类型是否因量化而遗漏 | 漏报增加 < 2% |

### 7.4 评估脚本

```bash
# 完整评估流程

# 1. 基线测试（A 组）
python eval_model.py \
  --model ollama:qwen2.5:7b-instruct \
  --dataset eval_dataset.json \
  --output results/A_baseline.json

# 2. 微调后测试（B 组）
python eval_model.py \
  --model ollama:qwen2.5-7b-security-lora:latest \
  --dataset eval_dataset.json \
  --output results/B_finetuned.json

# 3. 量化后测试（C 组）
python eval_model.py \
  --model ollama:qwen2.5-7b-security-q4km:latest \
  --dataset eval_dataset.json \
  --output results/C_quantized.json

# 4. 生成对比报告
python compare_results.py \
  --baseline results/A_baseline.json \
  --finetuned results/B_finetuned.json \
  --quantized results/C_quantized.json \
  --output eval_report_final.html
```

### 7.5 评估报告输出格式

```json
{
  "evaluation_date": "2026-07-15",
  "dataset_version": "v1.0",
  "scenarios_count": 39,
  "results": {
    "A_baseline": {
      "accuracy": 0.72,
      "precision": 0.80,
      "recall": 0.65,
      "f1": 0.72,
      "false_positive_rate": 0.15,
      "false_negative_rate": 0.20,
      "avg_latency_sec": 7.2,
      "memory_mb": 15200,
      "model_size_gb": 14.5
    },
    "B_finetuned": {
      "accuracy": 0.88,
      "precision": 0.92,
      "recall": 0.85,
      "f1": 0.88,
      "false_positive_rate": 0.08,
      "false_negative_rate": 0.05,
      "avg_latency_sec": 7.0,
      "memory_mb": 15200,
      "model_size_gb": 14.5
    },
    "C_quantized": {
      "accuracy": 0.86,
      "precision": 0.91,
      "recall": 0.83,
      "f1": 0.87,
      "false_positive_rate": 0.09,
      "false_negative_rate": 0.06,
      "avg_latency_sec": 3.5,
      "memory_mb": 5200,
      "model_size_gb": 4.5,
      "consistency_with_B": 0.96
    }
  },
  "conclusion": "微调+Q4_K_M 量化方案在精度损失 < 2% 的前提下，体积压缩 69%，推理速度提升 51%，适合端侧部署"
}
```
