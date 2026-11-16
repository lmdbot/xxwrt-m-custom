# 01 · main 分支现状审计与功能归属

## 1. 审计基线（已核查）

- 仓库：`lmdbot/xxwrt-m-custom`，主分支：`main`，审计基线：`10a06af2a02c5b867064f7b37464c1b65f8d726f`。
- 主工程：`ui/material-prototype/`；技术栈 Vue 3 / Vuetify 3 / Vite / Capacitor；旧前端 `src/www/` 不是 3.0 的导航源文件。
- 主导航定义：`src/services/featureCatalogV3.js` 的 `V3_TABS`，为 **概览 home / 设备 clients / 网络 network / 工具 apps / 我的 more**。
- 页面/路由/状态核心：`src/App.vue`，使用 `viewMode=list|detail`、`activeTab`、`networkSection`、`toolPanel`、`settingsOpen` 等组合管理。
- 管理能力组件：`AppFilterPanel`、`RouterAppsPanel`、`LuckyPanel`、`VlmcsdPanel`、`SoftwarePackagesPanel`、`RouterOperationsPanel`、`AdvancedManagementPanel`、`NetworkInterfacesPanel`、`AboutPage`。
- 现有导航回归测试：`tests/v3-navigation.spec.cjs`；在没有已登录路由器时底栏的设备/网络/工具禁用。其余 UI/服务测试分布在 `tests/`。
- 既有发布说明：`docs/releases/v3.0.0.md`；已有早期对照 `docs/material-main-feature-parity.md`，后者是历史基线，不能用来否定当前新增能力。

## 2. 当前交互结构的根源问题（设计分析，而非已验证缺陷）

| 问题 | main 的表现/根因 | 目标方案 |
| --- | --- | --- |
| “设备”语义冲突 | 保存的路由器列表 + 终端设备都与“设备”相关 | 底栏「设备」恒指终端；路由器管理在全局切换器/「我的」 |
| 主/子页面相互穿插 | `launchV3Tool` 临时切到 `apps`，依赖 `toolOriginTab` 恢复 | 单一功能归属 + 可记录来源的页面栈，返回最近来源 |
| 网络页二次切换过多 | 网络 hub 进入接口后又出现「接口/设备/无线」类别 | 入口只选一次；详情页按功能提供内部分段 |
| 工具列表长、目的性弱 | 常用、插件、系统、诊断、维护混合搜索 | 顶部收藏快捷 + 4 分类 + 全局筛选 |
| 首屏过度汇总 | 指标、流量、系统/硬件详情均在概览 | 核心健康/简曲线在首屏，详细诊断下钻 |
| 子页样式不一致 | 大量组件各自管理提示和保存入口 | 统一 Tool Page Shell：标题/状态/操作/反馈/安全确认 |
| 未登录/权限差异易误解 | 路由器会话、插件探测、RPC ACL 不同 | 五态能力反馈，不用“未知”替代“未安装” |
| 二次确认链不直观 | 多个对话框、二级表单、回滚倒计时 | 风险预告 → 差异预览 → 确认 → 持续反馈 → 回滚/验证 |

## 3. 28 个既有功能的唯一主归属

每个 ID 均来自 `App.vue` 的 `legacyTools` 和 `featureCatalogV3.js`；快捷入口与搜索可以交叉引用，但**仅有一处正式目录归属**。

| 源 ID | 功能 | 新主归属 | 现有主要实现 | 能力边界 |
| --- | --- | --- | --- | --- |
| `trends` | 长期趋势 | 概览 → 详细监控 → 长期趋势 | `AdvancedManagementPanel` | 本机有效样本最多30天；不补造离线历史 |
| `parental` | 家长控制 | 设备 → 家长控制 | `AppFilterPanel` | OpenAppFilter能力/ACL决定可操作内容 |
| `wol` | 网络唤醒 | 设备 → 网络唤醒 | `App.vue` | 目标/邻居双列表，邻居不保证在线 |
| `routes` | 路由表 | 网络 → 路由表 | `CompactManagementLists` | 静态路由与实时路由，部分只读 |
| `dnsdhcp` | DNS / DHCP | 网络 → DNS / DHCP | `RouterOperationsPanel` | 本地域名及静态租约；reload结果需核对 |
| `firewall` | 防火墙 | 网络 → 防火墙 | `RouterAppsPanel / AdvancedManagementPanel` | 区域/转发/规则编辑；高风险操作确认 |
| `ddns` | DDNS 管理 | 网络 → DDNS | `AdvancedManagementPanel` | DDNS Scripts/Go能力分级 |
| `zerotier` | ZeroTier | 网络 → ZeroTier | `RouterAppsPanel` | 组网成员授权、CLI/RPC能力提示 |
| `ssr` | ShadowSocksR Plus+ | 工具 → 插件中心 | `RouterAppsPanel` | 节点/代理控制，与路由配置区分 |
| `openclash` | OpenClash | 工具 → 插件中心 | `RouterAppsPanel / AdvancedManagementPanel` | 控制与部分配置/日志；不虚构控制器功能 |
| `lucky` | Lucky | 工具 → 插件中心 | `LuckyPanel` | 运行、访问规则、备份等依能力展示 |
| `wechatpush` | 微信推送 | 工具 → 插件中心 | `RouterAppsPanel` | 通知渠道、配置、测试推送 |
| `vlmcsd` | Vlmcsd KMS | 工具 → 插件中心 | `VlmcsdPanel` | 服务与配置管理 |
| `detector` | Internet Detector | 工具 → 插件中心 | `RouterAppsPanel` | 探测状态与受支持的服务操作 |
| `carbon` | Carbon 主题设置 | 工具 → 插件中心 | `RouterAppsPanel` | LuCI主题/升级 |
| `packages` | 软件包 | 工具 → 系统管理 | `SoftwarePackagesPanel` | 包管理；不要等同应用商店 |
| `services` | 服务管理 | 工具 → 系统管理 | `RouterOperationsPanel` | 运行与自启操作；关键服务保护 |
| `process` | 进程 | 工具 → 系统管理 | `CompactManagementLists` | 系统进程查询 |
| `startup` | 启动项 | 工具 → 系统管理 | `CompactManagementLists` | 启动服务列表 |
| `cron` | 系统定时任务 | 工具 → 系统管理 | `AdvancedManagementPanel` | Cron配置变更前校验 |
| `diagnostics` | 网络诊断 | 工具 → 诊断与安全 | `RouterOperationsPanel` | Ping/Traceroute/DNS查询 |
| `logs` | 日志中心 | 工具 → 诊断与安全 | `RouterOperationsPanel` | 系统/内核/本地审计 |
| `security` | 安全分析 | 工具 → 诊断与安全 | `AdvancedManagementPanel` | 认证失败、阻断/扫描证据 |
| `audit` | 操作记录 | 工具 → 诊断与安全 | `AdvancedManagementPanel` | 脱敏变更审计、未知结果 |
| `capabilities` | 系统能力识别 | 工具 → 诊断与安全 | `AdvancedManagementPanel` | 区分缺失插件、权限不足、未知 |
| `backup` | 配置备份恢复 | 工具 → 维护与备份 | `RouterOperationsPanel` | UCI快照、系统备份、差异预览/回滚 |
| `reboot` | 重启设备 | 工具 → 维护与备份 | `App.vue` | 二次确认 |
| `reset` | 恢复出厂 | 工具 → 维护与备份 | `App.vue` | 输入确认文字并防误触 |

**数量核验：** 1（概览）+2（设备）+5（网络）+7（插件中心）+5（系统管理）+5（诊断与安全）+3（维护与备份）= **28**。

## 4. 一级页面内容清单

- **概览**：路由器连接/型号/运行时长、CPU/内存/存储与在线终端摘要、真实 RX/TX 简化曲线、接口/防火墙/DDNS/诊断快捷、系统与硬件详情、独立详细监控入口。
- **设备**：DHCPv4 / DHCPv6 / 无线关联 / OpenAppFilter 应用用户，搜索、统一终端详情、来源/在线证据、静态 IP、限速/HQoS 等按权限能力显露；家长控制/WOL 二级入口。
- **网络**：WAN/LAN/WAN6、网络接口、以太网/网桥/无线硬件，路由表、DNS/DHCP、防火墙、DDNS、ZeroTier。
- **工具**：按路由器保存的最多五项收藏、分类检索、插件/软件包/系统服务/日志/备份等 20 项功能。
- **我的**：已保存路由器管理与当前会话、显示/隐私/刷新/实验室/语言、关于/开发者/版本检查/更新/许可证/反馈。

## 5. 不应被新设计抹掉的实现事实

- 设备详情数据来自多源合并，DHCP 租约≠实时在线。无线关联可证明关联，但其他来源可能仅是历史证据。
- 真实 RX/TX 需要至少两次接口计数采样；实时 75 个采样点，长期趋势是 APP 运行期间的本地有效采样（最多 30 天）。
- UCI 和网络修改可能导致管理断连；写入前校验、确认、超时回滚及“结果未知”的语义需要保留。
- 账号密码的 Android 安全存储、TLS 警告、路由器绑定的收藏偏好、客户端隐私显示不能回退。
- 防火墙、系统服务、网络切换、恢复出厂等风险操作禁止因为“看起来更简洁”而省略确认。
- 模拟 RPC 测试不代表完成真实 QWRT 的所有固件/插件兼容性测试。
