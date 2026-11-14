# main v1.0.6 与 Material 分支逐页功能对照（2026-11-14）

核对依据：main 的 src/www/app-config-service.js 页面路由与 zh-Hans/en 文案键、src/www/app-view.js 编译渲染资源；Material 的 App.vue、AppFilterPanel.vue、router.js、telemetry.js。

重要限制：main 仓库缺少原始 Vue 源工程，app-service.js 是大体量压缩编译产物，暂无法完整复核所有页面状态与 RPC 参数。以下“已实现”均表示代码存在并以模拟数据进行 UI/API 测试，不代表全部固件真机功能已验证。**不会用 LuCI 外部跳转替代缺失功能。**

| main 页面 | Material 分支 | 状态与待核对 |
| --- | --- | --- |
| device_list | 添加、编辑、删除、多台连接、状态检测、Android Keystore | 已实现；不同包名不可直接导入原 APP 数据 |
| 设备列表左侧菜单 | 语言、外观、检查更新、帮助、支持、关于；底栏标准/液态切换 | 布局已实现，完整多语言文案待补 |
| device/home 系统概览 | CPU/内存/缓存/连接数、硬件温度、系统时间、运行时间、联网监测 | 已实现，温度接口与固件 ACL 需真机核实 |
| home 磁盘占用、临时空间 | 通过 file.exec 只读 df -kP 返回 overlay、挂载分区、tmpfs，展示实际已用/总容量及百分比 | 新增；无授权显示“不可用” |
| device/statistics 网络带宽 | 选择物理接口，network.device.status RX/TX 字节计数器差分计算当前 KB/s、平均、峰值，ECharts 折线图 | 新增；最近 75 个实时采样点，历史不跨应用重启持久化 |
| statistics 系统负载 | system.info 中 1/5/15 分钟负载，每 3 秒采样 ECharts 历史图 | 新增；不等同于原版全部长期历史 |
| device/network 网络接口 | WAN/LAN、IPv4、IPv6、IPv6-PD、地址分配、DNS、MTU、路由、运行时间 | 新增字段的显示取决于 ubus 返回 |
| network 设备与无线 | MAC、网桥端口、收发字节和报文、SSID/BSSID、信道、模式、速率、加密等 | 已增强；x86 无无线时正常显示空状态 |
| device/client 无线客户端 | iwinfo.devices 与 iwinfo.assoclist 只读已关联终端 | 新增；部分 QWRT 可能未开放 iwinfo RPC |
| client DHCPv4 | 搜索设备名称/IP/MAC 的紧凑 Material 卡片 | 已实现 |
| client DHCPv6 | 读取 luci-rpc.getDHCPLeases 返回的 dhcp6_leases | 新增；需核对设备返回格式 |
| client appfilter 用户 | appfilter.get_all_users 分页显示用户及已有应用字段 | 新增；未覆盖原版全部用户管理写操作 |
| device/client_detail | IP、MAC、名称、租约详情 | 部分；原版应用访问记录、应用时长、过滤状态、断线操作尚未迁移 |
| device/apps 应用首页 | 7 个图标：家长控制、路由表、进程、启动项、WOL、重启、恢复出厂 | 已改为图标入口，每个功能独立二级页 |
| apps/process/index | luci.getProcessList 只读进程 | 部分：缺部分 PPID/状态/列字段及自动刷新 |
| apps/startup/index | rc.list 查看启动项与服务运行状态 | 部分：排序/管理操作待比对 |
| apps/route/index | UCI 静态路由及固定只读 ip route | 部分：IPv6 多表与类型细分待补 |
| apps/wol/index + wol/add | WOL 目标列表、添加、删除、唤醒操作 | 基础已实现，真机 WOL 未验证 |
| apps/reboot/index | system.reboot、二次确认 | 已实现 |
| apps/factory_reset/index | file.exec 固定 firstboot 参数、必须输入“恢复出厂” | 已实现按钮但不得在生产主路由测试 |
| apps/parental_control/index | OpenAppFilter 运行状态 | 部分 |
| parental_control/basic_settings | 启停/日志/工作模式 | 已实现部分可写 RPC |
| parental_control/app_filter_rules | 分类选择、时间规则、终端规则 | 已实现主要 RPC；插件版本兼容待验 |
| parental_control/advanced_settings | 引擎开机加载、接口、NAT 选项 | 已实现主要 RPC，需真机核对 |
| parental_control/parental_control_about | 基本版本信息 | 部分，完整关于页待补 |
| help/index | 侧栏帮助文字 | 部分，原版 FAQ 正文待迁移 |
| about/index | Material/about 简介 | 部分，原版完整版权说明待迁移 |
| sponsor/index | 支持项目文字 | 待确认原版授权和推广信息后再迁移 |
| language/index | 简体中文侧栏入口 | 不完整，原版英语/中文全量切换待补 |

## 行为与安全

- 磁盘使用固定、只读 df 执行参数，不接受用户任意 shell 命令。
- 带宽图只展示真实计数器差分；遇到计数器重置或 ACL 不可用不会绘制假数据。
- DHCP 租约不等于设备实时在线；对无线关联列表单独查询并明确区分。
- 破坏性恢复出厂仅在用户明确输入确认文案后调用原版固定参数；自动化不向真实设备发送该命令。
- GitHub Actions 的 Playwright 使用**模拟 ubus**测试；仍需要与 QWRT R26.11.13 的真实 RPC、传感器、设备和插件联调。

## 未达到 100% 的部分

原版 client_detail 应用历史和访问记录、断线/管控操作、进程高级字段、IPv6 路由表全量分类、英中文全量翻译、帮助/关于/支持页面，以及不同插件版本的细节，仍需继续逐项迁移。未完成部分不得标为“全量一致”。
