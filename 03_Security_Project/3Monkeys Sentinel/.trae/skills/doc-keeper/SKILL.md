---
name: "doc-keeper"
description: "整理和更新 3Monkeys Sentinel 项目文档。在每次对话结束时、用户要求整理文档、或文档内容与实际设计不一致时自动调用。"
---

# Doc Keeper — 项目文档管理

## 触发时机

以下场景必须调用本 skill：

1. **对话结束时**：用户说"结束"、"先这样"、"下次继续"等收尾语
2. **用户明确要求**：用户说"整理文档"、"更新文档"、"同步文档"
3. **设计变更后**：对话中产生了新的设计决策、技术方案调整、架构变更
4. **阶段性完成**：完成某个阶段（需求、设计、开发、测试）后

## 文档目录结构

```
docs/
├── requirements/           # 需求文档
│   └── features.md          # 功能清单、攻击场景矩阵、非功能需求
├── design/                  # 设计文档
│   ├── architecture.md      # 整体架构设计（技术选型、模块边界、数据流）
│   ├── agent_graph.md       # LangGraph Agent 状态机设计（节点/边/工具）
│   ├── api_schema.md        # REST API + WebSocket 接口契约
│   └── memory_system.md     # 三层记忆系统 + T1-T6 数据分级管道
├── testing/                 # 测试与验收文档
│   └── testing_strategy.md  # 测试金字塔、Agent 行为 Mock、评估数据集
└── reference/               # 参考文档（不随开发迭代，只增不改）
    ├── github_projects_survey.md        # GitHub 同类项目调研
    └── ai_agent_security_threats.md    # Agent 安全威胁分析
```

## 执行步骤

### Step 1: 扫描当前文档状态

用 LS 工具检查 `docs/` 目录结构，用 Read 工具读取每个文档的标题和最后更新时间。

### Step 2: 对比本次对话产生的设计变更

检查本次对话是否涉及以下变更：
- 新增功能或需求调整
- Agent 架构/节点/工具变化
- API 接口新增或修改
- 记忆系统/数据管道设计调整
- 测试策略或评估方案变化
- 技术栈选型调整

### Step 3: 更新对应文档

根据变更类型更新对应文档：

| 变更类型 | 目标文档 | 更新内容 |
|---------|---------|---------|
| 功能需求变更 | `docs/requirements/features.md` | 更新功能清单、优先级、攻击场景 |
| 架构设计变更 | `docs/design/architecture.md` | 更新模块图、技术选型、数据流 |
| Agent 设计变更 | `docs/design/agent_graph.md` | 更新节点/边/状态定义、System Prompt |
| 接口变更 | `docs/design/api_schema.md` | 更新 REST/WebSocket 接口定义 |
| 记忆/数据管道变更 | `docs/design/memory_system.md` | 更新表结构、T1-T6 分级、保留策略 |
| 测试方案变更 | `docs/testing/testing_strategy.md` | 更新测试用例、评估数据集、基线方案 |

### Step 4: 更新文档头部的最后更新时间

每个文档开头有 `> 最后更新: YYYY-MM-DD`，更新为当天日期。

### Step 5: 输出变更摘要

向用户输出本次文档更新的变更摘要，格式：

```
## 文档更新摘要

| 文档 | 变更内容 |
|------|---------|
| docs/design/agent_graph.md | 新增 summarize 节点连接、修复 should_continue 逻辑 |
| docs/design/memory_system.md | 新增 T1-T6 数据分级管道设计 |
| ... | ... |
```

## 注意事项

1. **只更新有变更的文档**，不要重写未变化的文档
2. **保持文档间一致性**：如果一个设计变更影响多个文档，必须同步更新所有相关文档
3. **不修改 reference/ 目录下的文档**，除非用户明确要求
4. **新增文档**：如果本次对话产生了全新的设计内容（如新的模块设计），在对应目录创建新文档
5. **文件命名**：全小写 + 下划线，如 `data_pipeline.md`
6. **文档格式**：Markdown，使用 GitHub 风格的表格、代码块、流程图
