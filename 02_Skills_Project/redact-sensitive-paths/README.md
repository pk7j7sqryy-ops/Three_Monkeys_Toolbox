# redact-sensitive-paths

> TRAE 自定义 Skill + Python 脚本:推送前脱敏扫描,把仓库里硬编码的本地绝对路径、用户名、邮箱、API key/token、私钥等敏感信息替换为占位符。

完整定义见 [SKILL.md](./SKILL.md)。脚本零依赖,只用 Python 标准库。

## 解决什么问题

类似下面的"内部路径"一旦推到公开仓库,会泄漏:

- 用户名(`./...`、`./...`)
- 内部项目结构(`./...`)
- 个人邮箱(`821815778@qq.com`)
- API key/token(`sk-...`、`ghp_...`、`AKIA...`)
- PEM 私钥(`-----BEGIN RSA PRIVATE KEY-----`)
- JWT token(`eyJxxx.yyy.zzz`)

本 skill 在 `git push` 之前扫描,支持自动替换为占位符 + 映射表审计。

## 快速使用

```bash
# 1. 初始化(每个仓库首次)
python3 scripts/redact.py init --repo .

# 2. 编辑 .redact/users.json,把 <your-username> 改成你的真实用户名
cp .redact/users.example.json .redact/users.json
vim .redact/users.json

# 3. 扫描
python3 scripts/redact.py scan --repo .

# 4. 预览替换
python3 scripts/redact.py apply --repo . --dry-run

# 5. 执行替换(生成 .redact/map.json)
python3 scripts/redact.py apply --repo .

# 6. 查看规则
python3 scripts/redact.py rules
```

## 退出码

| 码 | 含义 | 处理 |
|---|---|---|
| 0 | ✅ 干净 | 继续推送 |
| 1 | 🔎 REVIEW(本地路径/用户名/邮箱等) | 确认或自动替换 |
| 2 | ⛔ BLOCK(API key/token/私钥) | **禁止推送**,必须处理 |

## 目录结构

```
redact-sensitive-paths/
├── SKILL.md                    # skill 定义(TRAE 加载)
├── README.md                   # 本文档
└── scripts/
    └── redact.py                # 零依赖扫描器(scan/apply/restore/rules/init)
```

## 与现有 skill 协作

`02_Skills_Project/` 下其他 skill 的 SKILL.md **不应硬编码本地绝对路径**,
应该用 `<repo-root>/...` 或环境变量,从源头避免泄漏。

如果发现硬编码路径,先改 SKILL.md,再用本 skill 做防御性扫描。

## 配套的 .gitignore

仓库根 `.gitignore` 必须包含:

```
.redact/
!.redact/*.example.json
```

`.redact/` 存放本地配置和映射表(包含敏感信息),`*.example.json` 是模板可提交。

## 已知遗留

详见 [SKILL.md](./SKILL.md#已知遗留用户需了解) 的「已知遗留」段。核心:

1. 不处理 git 历史(需要 `git filter-repo`)
2. 不扫图片里的路径(需要 OCR)
3. 不扫运行时动态拼接的路径
4. 不检测 Unicode 隐写(参考 `aiagent-covert-channel-scan`)
5. `restore` 不做精确反向替换,推荐用 `git checkout` 恢复

## 安装

```bash
cp -r redact-sensitive-paths ~/.trae-cn/skills/
```

也可脱离 TRAE 直接命令行用:
```bash
python3 redact-sensitive-paths/scripts/redact.py scan --repo /any/repo
```
