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

skill 内的 README 路径是硬编码的(`./README.md`),迁移到其他仓库时需要改 `SKILL.md` 中 Step 3 的路径。

## 安装

```bash
cp -r auto-update-readme ~/.trae-cn/skills/
```
