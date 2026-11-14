# Material UI 与 main v1.0.6 功能覆盖核对

本表以 main 分支已编译 UniApp 页面的路由清单及 Material 分支 RPC 实现为依据。不得把 LuCI 外部入口称为已移植原版页面。

| main 页/功能 | Material 分支状态 | 数据/操作来源 |
| --- | --- | --- |
| 首页（设备、CPU、内存、温度、运行时间） | 已重做，只读 | system/luci/thermal ubus RPC |
| Internet Detector | 已重做，只读 | luci.internet-detector UIPoll |
| 统计 | 已重做，基础指标 | system.info、luci.getCPUUsage、conntrack |
| 终端列表 | 已重做，DHCP 租约 | luci-rpc.getDHCPLeases / getHostHints |
| 终端详情 | 已增加租约详情 | 当前 DHCP 租约，不宣称全量主机信息 |
| 网络 | 已重做，接口地址与基本状态 | network.interface.dump |
| 应用 / 服务 | 已增加服务列表 | rc.list |
| 进程列表 | 已增加只读列表，权限不足则提示 | luci.getProcessList |
| 启动项 | 已增加服务启动状态，暂不允许直接修改 | rc.list |
| 路由管理 | 已增加静态路由只读配置；编辑需 LuCI | uci.get network |
| 网络唤醒 WOL | 提供 LuCI 入口，未移植原版 WOL 操作 | 外部 LuCI |
| 家长控制（基本设置、规则、进阶、关于） | 提供 LuCI 入口，未移植四个原版子页面 | 外部 LuCI |
| 恢复出厂 | 仅通过 LuCI 原有二次确认流程 | 外部 LuCI |
| 重启路由器 | 已实现并要求二次确认 | system.reboot |
| 其他 LuCI 管理页面及插件菜单 | 通过 LuCI 继续管理，未移植到 Material 原生 UI | 外部 LuCI |

## 说明

- 稳定基础版 main **未修改**；上述工作只发生在 feature/material-ui。
- 当前功能并非与 main 完全等价：主版本的 WOL、家长控制和部分专有插件控制仍未迁移；LuCI 可能要求重新登录。
- 不猜测 QWRT 私有命令和参数，不向路由器发送任意 shell 命令，也不自动恢复出厂。
- 设备特有 API 的兼容性（含安装状态、ACL、UI 差异）须在真实 QWRT 环境验证。
- Android 16 状态栏遮挡改用原生 Android WindowInsetsCompat systemBars + displayCutout 处理，避免硬编码状态栏高度；与 Capacitor SystemBars 自动 padding 互斥。
