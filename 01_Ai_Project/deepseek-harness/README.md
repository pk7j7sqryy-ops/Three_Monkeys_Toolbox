# DeepSeek Harness 插件集

这个目录收集我为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 写的 Cordis 插件。

> DSH = DeepSeek 开源的 Agent 运行框架，主打「一切皆插件」，由 [Cordis](https://github.com/cordis-lib/cordis) 驱动。

## 插件列表

| 目录 | 说明 | 类型 |
|------|------|------|
| [token-pet](./token-pet) | Token 泡泡：布布玩偶、Token 用量、天气和三日预报 | 可安装 Bundle + 动态插件 |

## 发布/分享渠道

社区目前没有官方统一市场，约定俗成的做法是：

1. **GitHub 仓库 + `dsh-plugin` topic**：给仓库打上 `dsh-plugin` 标签，多个插件市场/面板会自动收录（如 [dsh-plugin-hub](https://github.com/Noob-stupid/dsh-plugin-hub)、[dsh-plugin-marketplace](https://github.com/AwesomeHou/dsh-plugin-marketplace)）。
2. **Awesome 列表**：提交到 [awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness)、[awesome-dsh-plugin](https://github.com/beancookie/awesome-dsh-plugin) 等精选清单。
3. **官方仓库**：给 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 提 PR / 参与讨论。

## 约定

- 每个插件一个子目录，包含可安装 Bundle 或动态 Host/Client 源码及自己的 `README.md`。
- 提交前请先跑敏感信息扫描（`pre-push-scan`），确认无密钥/隐私后再 push。
