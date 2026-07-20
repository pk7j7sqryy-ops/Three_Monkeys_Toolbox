# auto-update-readme

> TRAE 自定义 Skill:在 Git 提交前自动更新 README 的「当前进度」段。

完整定义见 [SKILL.md](./SKILL.md)。本目录只放 skill 本身,不包含其他代码。

## 触发时机

执行以下命令之前必须先调用本 skill:

- `git add -A`
- `git commit -m "..."`
- 任何自动化提交脚本(如工作日 21:20 的定时推送)

## 工作流概要

1. `git status --porcelain` 拿到待提交文件列表
2. 按文件路径映射为 README 进度条目(笔记 / 题库 / 安全工具 / skills 等)
3. 读取 README.md,定位「当前进度」段
4. 更新或新增 bullet(单条 ≤ 40 字,日期格式 `YYYY-MM-DD`)
5. 写回 README
6. 继续正常 `git add` / `git commit` 流程

## 配置

skill 不硬编码本机绝对路径,运行时按以下优先级定位 README:

1. 环境变量 `AUTO_UPDATE_README_TARGET`(指定 README 完整路径)
2. 环境变量 `REPO_ROOT` 指定仓库根目录下的 `README.md`
3. `git rev-parse --show-toplevel` 推断的仓库根目录下的 `README.md`
4. 当前工作目录下的 `README.md`

迁移到其他仓库不需要改代码,只需把 skill 拷过去即可。

如果运行前要先做敏感信息扫描(防止把本机路径写进 README),配合 `redact-sensitive-paths` skill 使用。

## 安装

```bash
cp -r auto-update-readme ~/.trae-cn/skills/
```
