# daily-study-digest v4

把一天的学习代码、笔记、晨考和练习整理成适合主动复盘的 Markdown，而不是把源文件重新拼接一遍。

固定输出结构：

1. Mermaid 思维导图
2. 理论：是什么、解决什么问题、为什么使用、核心原理与对比
3. 实操：1-3 个代表性可运行案例
4. 来源与覆盖
5. AI 生成的知识总结图
6. 用户自行填写且永不被 Agent 覆盖的个人总结

## v4 重点

- 使用 SHA256 manifest 识别新增、修改、删除、重命名和重复文件
- 每次输出完整的当日复盘，不生成割裂的增量片段
- 主 digest 和 AI 总结图始终生成到目标学习目录，可另外同步到 wiki
- 使用 AI/USER 受管区块，重复运行时保护用户个人总结
- AI 总结使用一张竖版知识图，图后直接进入个人总结
- 限制代码搬运和文档长度，完整代码链接回源文件
- 对错误或过时课堂笔记增加“原笔记表述 / AI 校正”
- 支持合法 Obsidian frontmatter、实际文件名双链和知识库 ingest
- 不硬编码本机绝对路径
- 完整审读 MindManager 主题层级与相关内嵌图片，并识别累计脑图的当天课程边界

## 触发示例

- “总结今天的学习内容”
- “复盘 01-python/day_05”
- “整理这个 day_03.zip”
- “更新昨天的 digest，但保留我的个人总结”

## 目录

```text
daily-study-digest/
├── SKILL.md
├── agents/openai.yaml
├── assets/daily-digest-template.md
├── references/source-routing.md
└── scripts/
    ├── build_manifest.py
    └── validate_digest.py
```

## 安装

在 `02_Skills_Project/` 目录执行：

```bash
./install.sh --target "$HOME/.trae-cn/skills" daily-study-digest
```

当前只同步到 TRAE；安装后重启 TRAE。
