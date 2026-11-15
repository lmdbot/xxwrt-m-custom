# XX-WRT Material 2.0.11 — QWRT / OpenWrt 移动管理

这是 `main` 的 Android 应用源码。Vue 3 + Vite + Vuetify 3 + Capacitor 8 构建 Material / Liquid Glass 界面，数据来自登录路由器的真实 ubus JSON-RPC、UCI 与授权的插件接口，不使用假终端数据。

## 独立 Android 应用

- Material 包名：`com.lmdbot.xxwrt.materialpreview`
- Material 应用名称：`XX-WRT管理器`
- 版本：`2.0.11`（Android versionCode 从版本号生成，保持单调递增）
- 与旧版 UniApp `XX-WRT M` 的 Android package ID 不同，可同时安装。
- 保留 Material 分支的应用信息与 Capacitor 构建流程，启动器图标使用已选中的路由器＋盾牌设计并适配安全边距。
- 正式 APK 使用 `XX-WRT-Material-vx.x.x.apk` 命名，构建版本自动取自 `package.json`。
- `main` 提供正式发布渠道；`feature/material-ui` 提供预发布测试包。

## 功能与权限

提供多路由器管理、终端在线状态、实时统计、WAN/LAN、网络设备、SSR Plus+、ZeroTier、微信推送、Internet Detector、网络唤醒、防火墙等已实现的 QWRT 功能。只有在 QWRT 允许相应 RPC/文件/服务操作时，才能读取实时状态或执行管理命令；无授权时不伪造状态，也不会打开任意 Shell 权限。

支持浅色、深色和系统主题；统一文字对比度、弹窗/应用子页面返回逻辑及底栏根页面返回路由器列表。底栏可使用标准 Material 或 Liquid Glass 风格。

## 应用更新

- 启动时自动检查 GitHub 正式 Release；设置 → 关于 → 版本与更新可手动检查。
- 版本号逐段按数字比较，例如 `2.21.0 > 2.3.0`；不使用字符串排序。
- 过滤 Draft、Pre-release 和测试标签，只允许当前 Material Android 应用的 APK。
- Android APK 提交系统下载管理器并存储到“下载”目录；不会自动安装。
- 正式新版没有匹配 APK 时提示用户，不会使用旧包名安装包。

## SSR Plus+ 组件安装耗时处理

- 普通 LuCI 版本查询保持 20 秒读取超时；安装 `geo_upgrade` / `component_upgrade` 的读取超时延长至 10 分钟（600000 毫秒）。
- 如果安装时发生超时、断线或网关错误，界面提示执行结果未知，先查看本地版本；**不会自动发起第二次安装**，避免重复写入或服务重启。
- 安装完成后手动刷新本地版本以确认更新实际是否成功。

## 开发与验证

在 `ui/material-prototype/` 运行：

```bash
npm install --no-audit --no-fund
npm run test:versions
npm run test:logic
npm run build
npm run test:ui
```

APK 构建由 `.github/workflows/ui-android-preview.yml` 通过 GitHub Actions 执行，使用仓库 Secrets 中的签名凭据，不能将私钥写进源码。

## 注意

浏览器本地预览不具备 Android Keystore 能力。真实插件运行状态、路由器 RPC ACL、Full Cone NAT、TCP 拥塞算法等必须通过实机联调核验；CI 模拟环境不等于路由器。
