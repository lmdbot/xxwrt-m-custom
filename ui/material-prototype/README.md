# XX-WRT Material 2.0 — QWRT / OpenWrt 移动管理

这是 `main` 的 Android 应用源码。Vue 3 + Vite + Vuetify 3 + Capacitor 8 构建 Material / Liquid Glass 界面，数据来自登录路由器的真实 ubus JSON-RPC、UCI 与授权的插件接口，不使用假终端数据。

## 独立 Android 应用

- Material 包名：`com.lmdbot.xxwrt.materialpreview`
- Material 应用名称：`XX-WRT Material Preview`
- 版本：`2.0.0`（Gradle versionCode `20000`）
- 与旧版 UniApp `XX-WRT M` 的 Android package ID 不同，可同时安装。
- Android 启动器图标已更换为蓝色二次元 Q 版 OpenWrt 路由器形象；CI 从 `assets/launcher-chibi/` 的五个二进制分片恢复并校验图像，生成五档分辨率、圆形、自适应及单色图标。
- `main` 提供正式发布渠道；`feature/material-ui` 提供预发布测试包。

## 功能与权限

提供多路由器管理、终端在线状态、实时统计、WAN/LAN、网络设备、SSR Plus+、ZeroTier、微信推送、Internet Detector、网络唤醒、防火墙等已实现的 QWRT 功能。只有在 QWRT 允许相应 RPC/文件/服务操作时，才能读取实时状态或执行管理命令；无授权时不伪造状态，也不会打开任意 Shell 权限。

支持浅色、深色和系统主题；统一文字对比度、弹窗/应用子页面返回逻辑及底栏根页面返回路由器列表。底栏可使用标准 Material 或 Liquid Glass 风格。

## 开发与验证

在 `ui/material-prototype/` 运行：

```bash
npm install --no-audit --no-fund
npm run build
npm run test:ui
```

APK 构建由 `.github/workflows/ui-android-preview.yml` 通过 GitHub Actions 执行，使用仓库 Secrets 中的签名凭据，不能将私钥写进源码。

## 注意

浏览器本地预览不具备 Android Keystore 能力。真实插件运行状态、路由器 RPC ACL、Full Cone NAT、TCP 拥塞算法等必须通过实机联调核验；CI 模拟环境不等于路由器。
