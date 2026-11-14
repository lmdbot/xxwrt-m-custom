# main v1.0.6 → feature/material-ui 功能迁移清单

基于 main 已编译 UniApp 的 app-config-service.js 页面目录、app-service.js RPC 调用逐项核对。

Material 是独立 Android 包名，无法直接读取另一个应用在 Android 沙盒里的已添加设备资料，首次使用需要重新添加。

## 已迁移

| main 页面/能力 | Material 实现 | 备注 |
| --- | --- | --- |
| 设备列表 | **多设备添加、编辑、删除、点击进入详情、返回列表** | 独立地址、用户名、会话及状态摘要 |
| 在线状态 | HTTP 可达性探测、保存密码时自动登录并刷新系统摘要 | 可达不等于认证成功 |
| 连接信息 | 设备资料本地保存，可选 Android Keystore 加密记住密码 | 不存储会话 token |
| 首页 | CPU、内存、温度、运行时间、Internet Detector | 实时 RPC 数据 |
| 统计 | CPU、负载、内存、连接数 | 仍缺原版历史曲线 |
| 终端列表/详情 | DHCP 租约列表、IP/MAC/租约详情 | 原版高级图表尚未迁移 |
| 网络 | WAN/LAN、地址、DNS、网卡和无线设备 | 根据固件 RPC 权限变化 |
| 进程 | luci.getProcessList 原版数据格式 | 只读 |
| 启动项 | rc.list | 只读 |
| 路由表 | UCI 静态路由和 /sbin/ip 固定只读命令 | 只读 |
| WOL | luci.wol.stat/exec，UCI 目标增删 | 支持目标列表、添加、删除和唤醒 |
| 家长控制基础设置 | appfilter RPC | 版本状态、启停、日志、工作模式 |
| 家长控制分类、时间、终端和高级设置 | 按 main 的 `class_list`、`get/set_app_filter*`、`add/del_app_filter_user` 等实际 RPC 增加可编辑页面 | 模拟 RPC 已覆盖，需真机与插件版本联调 |
| 恢复出厂 | `file.exec` 运行原版 `/sbin/firstboot -r -y` | 双重确认：弹窗 + 输入“恢复出厂”；破坏性操作未经真实设备执行测试 |
| 设备列表左侧菜单 | 按 main 菜单构建语言、外观、更新、帮助、支持、关于入口 | 语言及帮助部分仍缺原版完整内容 |
| 终端 UI | 紧凑可搜索卡片，支持名称、IP、MAC 过滤 | DHCP 租约不等于在线终端 |
| 设备重启 | system.reboot | 二次确认 |

## 仍未等价迁移

- 家长控制的关于子页面，以及跨不同 appfilter 版本的字段兼容、完整规则交互仍需实际固件验证。
- 原版统计页的历史网络速率/负载图表，终端详情高级统计。
- 恢复出厂的真实设备效果尚未验证；可能导致配置彻底清除，不能在生产路由器上随意测试。
- 完整多语言文案切换、原版帮助和关于页面内容，以及其他原版特定管理交互。
- 不同固件/插件接口版本的全部兼容性验证。

本分支不再使用 LuCI 跳转充当缺失功能的降级方案。上述未完成部分不会被标注为全量迁移。此文档会继续跟踪功能等价进度。

## 安全与限制

- Android 凭据使用 MIT 开源 @aparajita/capacitor-secure-storage 8.0.1（Android Keystore），且必须经用户选择。
- 当前自动化测试采用模拟 RPC，尚未与用户真实 QWRT 做全部端到端测试。
- 不更改 main 的 v1.0.6 基础版；仅在 feature/material-ui 开发实验版。
