# XX-WRT v2.0.34 P1/P2 能力实现与边界

## 架构

- `src/services/managementCore.js`：按固件实际 `system.board`、`rc.list`、UCI、RPC 响应建立能力矩阵，未知与不可用分别展示；新增 UCI 变更使用预检 → 基线比对 → 暂存 → `uci.apply`（90 秒自动回滚）→ 用户确认/回滚的统一流程。
- `src/services/advancedManagement.js`：DDNS Scripts UCI 非密钥字段、DDNS-Go 状态、OpenClash 订阅/本地配置索引、扩展防火墙 IPv4/IPv6 规则、root Cron 固定路径安全读写。
- `src/services/routerInsights.js`：有效数据本地采样与 30 天滚动保留、主机邻居与 LLDP/Wi-Fi 图谱、系统/内核日志关键词证据分类。
- `src/services/router.js`：请求结束后统一对 **写操作** 记录本地审计元数据，用户凭据、UCI values、文件内容、原始日志和订阅 URL 不进入审计。
- `src/components/AdvancedManagementPanel.vue`：P1/P2 以及能力、审计的 Material 页面；原 OpenClash、防火墙页面复用深度管理子页面。

## UCI 配置变更保护

保护事务包含以下控制：

1. 固定配置与字段格式白名单，拒绝命令注入型字段值作为参数或对象名称。
2. 读取目标配置节，生成 **字段名** 级预览，不在确认 UI 展示密码/密钥。
3. 调用 `uci.changes` 检查当前 session 的未处理变更；目标节更新时再次读取当前值，拒绝旧编辑覆盖新值。
4. `uci.set/add/delete` 后使用 `uci.apply({rollback:true,timeout:90})`，不执行无回滚能力的强制提交；用户明确确认才调用 `uci.confirm`。
5. 失败时尝试 `uci.revert`；RPC 超时被视为结果未知，不自动重新提交。
6. 断线/关闭 APP 时由路由器自身回滚机制兜底；超过时限后清理 APP 内过期事务锁，但**不声称已经核实远端回滚**。

注意：此统一事务层在 v2.0.34 先适用于新增 DDNS、OpenClash 深度设置和防火墙增强。历史主功能的部分配置写入路径尚未完成统一事务重构，只有前置 UCI 冲突检查与跨模块 RPC 写入审计；网络接口页和 UCI 配置恢复此前已有独立回滚逻辑。

## DDNS / OpenClash / 防火墙 / Cron

| 能力 | 读取渠道 | 修改方式 | 不提供的能力 |
| --- | --- | --- | --- |
| DDNS Scripts | `uci.get ddns` / `rc.list` / 固定服务日志 | 标准 UCI 受保护编辑；非密钥字段 | 自动推断、修改隐藏 API Token |
| DDNS-Go | `rc.list` | 经确认的 `rc.init` 启动/停止/重启 | 与 ddns-scripts 混用配置、修改 DDNS-Go 私有配置文件 |
| OpenClash | `uci.get openclash`、`file.list /etc/openclash/config`、`file.read /tmp/openclash.log` | 启用/停用订阅节、选择已存在 YAML；受保护事务 | 未核实的 Controller 动态节点接口、无授权的升级/订阅下载 |
| 防火墙增强 | `uci.get firewall` | 仅创建经 IPv4/IPv6 地址及端口验证的规则，回滚确认 | 原生规则集动态 nft 命令编辑 |
| Cron | `file.read/write /etc/crontabs/root`、`rc.init cron` | 只修改规则结构化行或固定服务维护预设；写入前核对并回读，失败时尝试恢复 | 输入任意 Shell 执行命令 |

## 长期趋势数据来源

- APP 在连接时使用当前可读取的真实 `readDashboard` RPC 数据，按设备本地存储 `CPU%、内存%、连接占用%、1 分钟负载`。
- 每台路由器最多 8640 条样本（5 分钟一次约 30 天），时间范围筛选 24 小时、7 天、30 天。采样频率为**最多每 5 分钟一条**，不是实时不停写存储。
- 实际采样由 APP 活动期间的仪表板刷新或前台五分钟采集定时器触发。APP 后台或关闭后**没有保证连续采集**；不存在的历史段不进行插值。
- 本机历史不包含明文路由器密码、认证令牌和原始网络报文。

## 拓扑数据可信度

- 读取 LuCI 主机提示/地址发现信息，仅标注为历史线索。
- 读取 `iwinfo.assoclist` 无线关联，标注为当前 Wi-Fi 连接的直接证据。
- 如固件安装 `lldpcli` 且允许 `file.exec` 固定二进制 + JSON 查询，则展示 LLDP 已通告邻接设备。
- 缺少交换机 LLDP、SNMP 或 AP 关联采集时，不推断真实端口、层级交换拓扑或终端在线状态。

## 安全事件分析

- 数据来源：当前窗口可访问的系统/内核日志。只有日志中显式出现的认证失败、策略阻断、扫描/洪泛及 DNS Rebind 关键词被归类。
- 聚合展示最近窗口中的匹配计数和有限长度原始证据，**不保存原始日志到本地长期指标历史**。
- 无事件记录不代表无攻击。规则命中也可能是正常防火墙行为，不实现自动封禁、风险评分或 IP 归属地断言。

## 实际路由器验收建议

- QWRT x86 与标准 OpenWrt 分别验证不同 UCI、rpcd ACL、服务不存在、插件安装但禁用和日志目录不存在等场景。
- DDNS 测试 IPv4/IPv6 更新、服务日志与错误提示；OpenClash 测试 UCI 配置开关后是否需要额外重启、无 YAML 权限及不同插件版本的订阅节差异。
- 防火墙 IPv6 规则测试 ACL、带回滚的配置应用、WAN 断连后自动恢复；Cron 测试只读文件系统/权限拒绝、文件被其他客户端并发修改、服务重载失败与回退。
- APP 真机 Android 验证本地保存容量、30 天边界、前后台行为、SVG 拓扑性能、暗色主题文字可读性。
