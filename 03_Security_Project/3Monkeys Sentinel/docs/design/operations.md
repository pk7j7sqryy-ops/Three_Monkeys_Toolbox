# 运维与更新维护设计

> 最后更新: 2026-07-15

## 一、四类更新策略

### 1. 规则库更新（每日，静默热加载）
- GitHub Release 托管 rules-latest.json
- 应用每小时检查一次，有更新则静默下载
- 语法校验通过后热加载（不重启）
- 旧规则保留用于回滚
- 规则格式兼容 Suricata 语法，可复用社区规则

### 2. 威胁情报缓存刷新（每小时，被动刷新）
- Agent 调用 AbuseIPDB/VirusTotal 时自动缓存
- 缓存 TTL 1 小时，过期后下次查询自动刷新
- 离线时使用最后一次缓存
- 本地缓存 Tor 节点列表、恶意 IP 库作为兜底

### 3. 软件版本更新（每月，用户确认）
- Tauri 2.0 内置更新器，检查 GitHub Release
- 弹窗提示用户，显示更新日志
- 下载后 ed25519 签名验证，防止篡改
- 用户确认后安装重启

### 4. LLM 模型更新（每季度，可选）
- 检查 Ollama 模型版本
- 用户选择是否更新（几 GB 下载）
- 微调 LoRA adapter 从 GitHub Release 下载（几十 MB）
- 保留旧模型用于回滚

## 二、本地健康管理

### 健康监控模块（每 30 秒检查）

| 监控项 | 异常处理 |
|--------|---------|
| Python 进程存活 | Tauri 自动重启（最多 3 次） |
| Ollama 服务可达 | 降级为仅规则引擎模式 |
| SQLite 文件大小 | 触发 T1-T6 压缩清理 |
| 内存占用 > 500MB | 清理 Ring Buffer |
| Agent 队列积压 > 100 | 丢弃低优先级事件 |
| 网卡抓包正常 | 检查权限/重试 |
| Scapy 权限丢失 | 提示用户重新授权 |

### 四级降级策略

```
正常运行：规则引擎 + Agent + 记忆系统 + 威胁情报
    ↓ Ollama 不可用
降级 1：规则引擎 + 记忆系统（Agent 用规则兜底，不调 LLM）
    ↓ 网络 API 不可用
降级 2：规则引擎 + 本地缓存情报（用最后一次缓存）
    ↓ SQLite 损坏
降级 3：规则引擎 + 内存 Ring Buffer（不持久化，重启丢失）
    ↓ Scapy 权限丢失
降级 4：仅提示用户重新授权，不抓包
```

核心原则：最差情况也能保住规则引擎这一层基础防护。

## 三、Tauri 与 Python 进程管理

- Tauri 启动时拉起 Python sidecar 进程
- Tauri 监控 Python 进程状态
  - Python 崩溃 → 自动重启（最多 3 次，超过则提示用户）
  - Python 无响应 → 杀掉重启
  - 用户关闭窗口 → 优雅停止 Python（等待 Agent 完成当前调查，最多等 10 秒）
- 优雅关闭流程：
  1. 停止接收新事件
  2. 等待 Agent 完成当前调查（最多 10 秒）
  3. 保存 Agent 中间状态到 SQLite（下次启动可恢复）
  4. 刷新 WAL 日志
  5. 进程退出

## 四、数据库迁移策略

### Schema 版本管理

```python
# 每次启动时检查
class DBMigrator:
    def check_and_migrate(self):
        current_version = self._get_user_version()
        target_version = CURRENT_SCHEMA_VERSION  # 代码中硬编码
        
        if current_version < target_version:
            # 按顺序执行迁移脚本
            for v in range(current_version + 1, target_version + 1):
                self._run_migration(v)
            self._set_user_version(target_version)
```

- 每个版本对应一个迁移函数，只做增量 ALTER TABLE
- 迁移前自动备份数据库文件（sentinel.db.bak）
- 迁移失败则回滚到备份

## 五、日志与诊断

### 日志目录结构

```
~/.3monkeys-sentinel/
├── logs/
│   ├── app.log              # 应用日志（INFO 以上）
│   ├── agent_trace.log      # Agent 每次调查的完整 Trace
│   ├── error.log            # 错误日志（ERROR 以上）
│   └── audit.log            # 审计日志（封禁/解封操作，永久保留）
├── data/
│   ├── sentinel.db          # SQLite 数据库
│   └── chroma/              # ChromaDB 向量库
└── config/
    └── config.toml           # 用户配置
```

- 日志轮转：单文件超 10MB 自动轮转，保留最近 5 个文件
- 诊断模式：一键导出诊断包（最近 7 天日志 + 配置 + 系统信息，IP 脱敏）

## 六、资源占用限制

| 资源 | 上限 | 超限处理 |
|------|------|---------|
| 内存 | 500MB | 清理 Ring Buffer + 删除旧 Flow 记录 |
| CPU | 30%（单核） | 降低 Agent 并发数 + 扩大聚合窗口 |
| 磁盘 | 1GB | 触发紧急 T1-T6 压缩 |
| SQLite | 500MB | 触发压缩；1GB 紧急只保留 24h |

## 七、首次运行引导

用户第一次打开应用时的引导流程：

1. **欢迎页** — 项目介绍 + 三猴理念
2. **网卡选择** — 自动检测活跃网卡，用户确认
3. **权限授权** — 引导用户授予抓包权限（macOS 需要 sudo）
4. **LLM 配置** — 检测本地 Ollama，未安装则引导安装 + 拉取模型
5. **威胁情报配置** — 可选，引导填写 AbuseIPDB/VirusTotal API Key
6. **响应策略选择** — 默认半自动，解释三种策略区别
7. **完成** — 开始监控

## 八、配置校验

用户修改设置时，先校验再保存：

| 配置项 | 校验规则 |
|--------|---------|
| API Key 格式 | AbuseIPDB: 80 位 hex；VirusTotal: 64 位 hex |
| 端口范围 | 1-65535 |
| 网卡名称 | 系统存在该网卡 |
| 数据保留天数 | 7-365 |
| BPF 过滤语法 | 语法校验，不合法则提示 |
| LLM 地址 | URL 可达性检查 |

## 九、API Key 安全存储

- macOS: 使用 Keychain 存储 API Key
- 非 macOS: 使用 AES-256 加密存储，密钥派生自机器码
- 配置文件中不出现明文 Key

```python
class SecureStorage:
    def store(self, key: str, value: str):
        if platform.system() == "Darwin":
            # macOS Keychain
            subprocess.run(["security", "add-generic-password",
                          "-a", "3monkeys", "-s", key, "-w", value])
        else:
            # AES-256 加密
            encrypted = self._encrypt(value, self._machine_key())
            self._write_encrypted(key, encrypted)
```

## 十、数据备份与恢复

### 备份
- 设置页面提供「导出数据」按钮
- 导出内容：SQLite 数据库 + 配置 + 规则（不含 API Key）
- 格式：zip 压缩包

### 恢复
- 设置页面提供「导入数据」按钮
- 导入时校验格式和版本兼容性
- 导入后重启应用

## 十一、性能基准目标

| 指标 | 目标 | 测试方法 |
|------|------|---------|
| 规则引擎延迟 | < 1ms/包 | 1000 包压测 |
| Agent 单次调查 | < 3s（本地 7B） | 评估数据集 39 场景 |
| Agent 单次调查 | < 1.5s（远程 API） | 同上 |
| 端到端告警延迟 | < 5s（规则命中） | 集成测试 |
| 端到端告警延迟 | < 10s（Agent 调查） | 集成测试 |
| 内存占用 | < 500MB | 连续运行 24h |
| SQLite 查询 | < 10ms（单次） | 10 万条记录 |
| 向量检索 | < 50ms（top-5） | 1 万条向量 |
| 启动时间 | < 3s | 冷启动 |
| 打包体积 | < 30MB（不含模型） | Tauri 打包后 |
