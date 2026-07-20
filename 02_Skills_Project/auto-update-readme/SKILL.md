---
name: "auto-update-readme"
description: "在 Git 提交前自动更新 README.md 的当前进度，把最新变更写进 README 后再执行 add/commit。"
---

# 提交前自动更新 README

在每次 Git 自动提交或手动提交之前，先检查并更新 `README.md`，将最新项目进展写入「当前进度」部分，确保 README 始终反映仓库最新状态。

## 触发时机

**在执行以下命令之前必须先调用本 skill：**

- `git add -A`
- `git commit -m "..."`
- 任何自动化提交脚本（如工作日 21:20 的定时推送）

## 工作流程

### Step 1: 查看待提交变更

运行 `git status --porcelain` 或 `git diff --cached --name-only`，获取本次即将提交的文件列表。

### Step 2: 分析变更对应的项目进展

根据变更文件路径，映射为README中的进度条目。常见映射规则：

| 文件/目录变更 | README 进度条目更新 |
|---|---|
| `notes/面试问题集.md` | 面试问题集：新增 X 个问题（累计 Y 个） |
| `Ai_News/AI情报速览_YYYY-MM-DD.md` | 每日 AI 情报：YYYY-MM-DD 已更新 |
| `Ai_Learn_Plan/*.md` | 前期加分动作/执行手册：已更新 |
| `leetcode/` | LeetCode Hot 100：已完成 X 题（方向） |
| `other_project/AI learning website 2/` | Ailearn：功能/模块更新 |
| `skills/` | 新增/更新 XX skill |
| `sec-pytools/` | 安全工具：新增/更新 XX 功能 |

### Step 3: 读取当前 README

读取仓库根的 `README.md`,定位到「当前进度」部分。

**仓库根定位方式**(按优先级,从上到下取第一个匹配的):
1. 环境变量 `AUTO_UPDATE_README_TARGET` 指定的 README 路径
2. 环境变量 `REPO_ROOT` 指定的仓库根目录下的 `README.md`
3. `git rev-parse --show-toplevel` 的输出目录下的 `README.md`
4. 当前工作目录下的 `README.md`

> ⚠️ 不要在 SKILL.md 里硬编码本机绝对路径(如 `~/your-username/...` 这种带真实用户名的),否则推送到公开仓库会泄漏用户名和内部项目结构。
> 运行时由 `git rev-parse` 或环境变量推断。

### Step 4: 更新进度条目

在「当前进度」的 bullet list 中：

- **已有条目**：更新其描述，加入最新信息（如日期、数量、状态）。
- **新增条目**：如果有新的项目方向或里程碑，添加新的 bullet。
- **删除过时条目**：如果某方向已废弃或合并，移除对应 bullet。

更新原则：
- 保持简洁，每条 bullet 不超过 40 字
- 只写**进展/状态**，不写详细技术细节
- 日期格式 `YYYY-MM-DD`
- 保留原有的自动化、仓库结构等静态信息不变

### Step 5: 保存 README

将更新后的 README 写回文件。

### Step 6: 继续正常提交流程

README 更新完成后，继续执行：

```bash
git add -A
git commit -m "auto-commit: $(date '+%Y-%m-%d %H:%M')"
```

## 注意事项

- 如果 `git status --porcelain` 无任何变更，跳过 README 更新和提交，直接结束
- 如果 README 本身没有需要更新的内容（如仅修改了无关文件），仍可执行 `git add -A`，README 保持不变
- 保持「当前进度」条目数量在 5-8 条之间，过多时合并次要条目
- 使用中文撰写所有进度描述

## 文件位置

- README:仓库根目录下的 `README.md`(运行时由 `git rev-parse --show-toplevel` 或环境变量 `REPO_ROOT` 推断,不硬编码)
