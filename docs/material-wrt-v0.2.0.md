# XX-WRT M Material QWRT RPC v0.2.0（功能测试版）

该版本沿用 feature/material-ui 分支的 **Vuetify 3 + Vue Liquid Glass** 界面，另用 Capacitor 8 构建 Android 安装包。与主分支 v1.0.6 使用不同包名，并存安装。

## 与 v0.1.1 预览版的主要差异

不再使用固定演示数据。使用已在原 XX-WRT M APK 中核对的 OpenWrt/QWRT HTTP ubus JSON-RPC 协议：

- 用户输入 QWRT IP/域名、HTTP(S) 端口、rpcd 用户名及密码，调用 /ubus 的 session.login 获取会话；密码不存储，关闭 APP 后需重新登录。
- 首页：system.board、system.info、luci.getCPUUsage、luci.getTempInfo、luci.internet-detector.UIPoll、network.interface.dump、系统文件温度兜底，保留全部监测实例。
- 统计：CPU 负载、内存、缓存、连接数和在线用户量。
- 终端：luci-rpc.getDHCPLeases、luci-rpc.getHostHints；DHCP 租约不等于实时在线用户。
- 网络：LAN/WAN 接口 IPv4/IPv6、网关、DNS，以及接口状态。操作配置时可进入 LuCI。
- 应用：通过 rc.list 读取 OpenWrt 服务列表。
- 管理动作：打开真实设备 LuCI 页面，支持二次确认后执行 system.reboot。
- 外观：标准（Vuetify）/ 液态（开源 Vue Liquid Glass）底栏，选择记忆；浅色、深色和系统模式。

## 安装和连接

1. 安装本分支生成的 XX-WRT-M-Material-QWRT-v0.2.0.apk，不会覆盖 v1.0.6 正式管理版。
2. 手机连接到可以访问路由器的 Wi-Fi/VPN，确认路由器 IP 和端口。
3. 在登录页填写地址，例如 http://192.168.100.1 ，用户名 root，输入本机 rpcd 密码；点击“连接并读取路由器”。
4. 如果路由器使用非 80 端口，填写 http://IP:端口 ；HTTPS 需要可信证书，不绕过 TLS 验证。
5. 设备入口只保存基础 URL，不保存密码和会话；敏感账号信息不打印日志。

## 风险与限制

- HTTP 允许局域网访问是为了兼容 QWRT 默认的 /ubus，账号密码会以明文方式在当前网络传输；不建议让 /ubus 暴露公网。远程优先使用 VPN 或有效证书的 HTTPS。
- 当前是**核心管理功能测试版**，不覆盖旧版的全部插件操作、终端功能和特殊配置。尚未通过实际 QWRT 固件的端到端登录、RPC 权限、网络环境和 Android 真机验证。
- 部分 rpcd 服务不可用时对应模块显示“不可用”，而不是演示数据。LuCI 管理页可继续使用路由器原有高级功能，但可能需要再次登录 LuCI。
- Android Manifest 允许明文 HTTP 以支持局域网设备；如果需要更严格的目标域名名单，后续应收紧 Network Security Config。
- 自动化测试在浏览器中拦截模拟 /ubus 响应，验证数据解析、登录交互、页面导航、长页面滚动、两种底栏切换与密码不持久化。测试通过不等于已在真实 QWRT 上验证。
- 提交与签名密钥沿用仓库 GitHub Secrets，绝不提交 P12 私钥。

## 构建隔离

GitHub Action “Material UI Android preview APK” 从 feature/material-ui 生成并发布至 material-wrt-v0.2.0 预发布 Release。不会修改主线基础版 v1.0.6 Release。
