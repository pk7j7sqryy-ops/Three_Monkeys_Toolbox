# Ailearn · AI 学习闭环系统

完全离线的个人学习管理网站:笔记库、刷题中心、任务计划、错题本(SM-2 间隔重复)、复盘总结。
纯前端实现 —— 零依赖、零构建、零 CDN,数据全部存在浏览器 localStorage。

项目整体逻辑:
```
定目标 → 半年大纲(月主题) → 周/日任务 → 执行+记笔记
   ↑                                        ↓
   └── 复盘(调整计划) ← 错题SRS复习 ← 刷题检验 ←┘
```

## 启动

```bash
# 任意静态服务器均可,仓库自带一个禁缓存的开发服务器:
python3 .claude/serve.py 4180
# 浏览器打开 http://127.0.0.1:4180/  (入口 Ailearn.html)
```

## AI 辅助(可选,本地 Ollama)

笔记整理 / 自动出题 / 错题分析调用本机 Ollama,数据不出本地:

```bash
OLLAMA_ORIGINS=* ollama serve   # 必须设置跨域环境变量
ollama pull llama3.2            # 任意模型,在顶栏「AI 设置」里填模型名
```

## 数据与备份

- 所有数据存 localStorage(键 `ailearn_data_v1`),**清浏览器数据会清空一切**。
- 顶栏「数据中心」支持导出 JSON 全量备份 / 导出 Markdown 笔记 / 合并或替换导入。
- 建议定期导出 JSON 备份。

## 目录结构

```
Ailearn.html        入口(含防主题闪烁的内联脚本)
css/                theme.css 全局主题 · pages.css 页面样式
js/
  data.js           内置示例数据(首次运行的种子)
  store.js          localStorage 持久化层(导入导出 / 合并去重)
  srs.js            SM-2 间隔重复引擎
  stats.js          派生统计层(KPI / 趋势 / 热力全部实时计算)
  ai.js             本地 Ollama 客户端
  markdown.js       轻量 Markdown 渲染(安全链接白名单)
  importers.js      .md / .docx 题库与笔记导入解析(内置极简 ZIP 解包)
  tools.js          模态框 / Toast / 表单 / 数据中心 / AI 设置
  tweaks.js         外观偏好面板(主题 / 字体 / 密度 / 昵称)
  app.js            壳:hash 路由 / 侧边栏 / 主题 / 通知铃铛
  pages/            六个页面渲染器
test.html           零依赖单元测试页(解析器 / Markdown / SRS)
```

## 测试

浏览器打开 `http://127.0.0.1:4180/test.html`,全绿即通过。
改动 importers.js / markdown.js / srs.js 后请跑一遍。
