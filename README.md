# XX-WRT M 自定义版（非官方）

> 推荐创建 **Private 私有仓库**。此仓库存放来自用户提供 APK 的逆向提取编译产物；不是作者原始的 UniApp / Vue 源码工程，也不应当被误称为从源码完整编译。请确认你有权使用和分发本应用。

## 当前功能

- 启动页去广告（来自上一个修改版本）。
- 登录后的首页：Internet Detector 监测实例状态与硬件温度。
- **Internet Detector 界面优化：全部实例单独一行，不再仅显示 3 个并追加 `+N`**。
- 设备列表温度兼容、跟随 Android 系统亮/暗色模式。
- 移除首页底部邮箱显示和链接。
- 继续使用同一个签名证书（SHA-256：`E7:B3:D7:9A:5C:7D:C2:8D:FF:DE:6B:0B:D9:22:63:DA:B9:49:18:DD:C3:E7:EC:60:5B:79:CE:B2:E4:5A:B9:81`）。

## 目录

- `vendor/base.apk`：在此项目开始之前已修改好的 APK，作为可复现重打包的基础镜像。**不是源工程**。
- `src/www/`：从已编译 APK 中提取的 JavaScript、HTML、CSS、JSON 等前端产物；需要编辑首页可查 `app-service.js`。
- `scripts/repackage.py`：把 `src/www/` 的资源覆盖到基础 APK，删除旧签名；输出未签名 APK。
- `.github/workflows/build-apk.yml`：使用官方 Android `zipalign` / `apksigner` 构建**可安装签名 APK**，保存到 Actions Artifacts。
- `scripts/patch_monitor_ui.py`：联网监测 UI 修改补丁（对上一版已编译 JS 的修改过程记录）。当前改动已经体现在 `src/www/app-service.js`，无需再次运行。
- `router/XX-WRT-QWRT-telemetry-install.sh`：之前制作的 QWRT 温度接口脚本；在路由器上安装前应自行审查。

## 首次启用 GitHub Actions（需要手动设置一次密钥）

**不要把 `.p12` 私钥文件提交到 Git 历史，即使仓库是私有的。**

在新建 GitHub 私有仓库后，打开 `Settings → Secrets and variables → Actions → New repository secret`，创建：

| Secret | 内容 |
|---|---|
| `XXWRT_KEYSTORE_BASE64` | 稳定 `.p12` 文件的 Base64（整段单行文本） |
| `XXWRT_KEYSTORE_PASSWORD` | `.p12` 的密码 |

Windows PowerShell 获取 Base64，然后复制输出到 GitHub Secret（注意不要把输出贴在 Issue/Commit/聊天记录里）：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\XX-WRT-M-stable-signing-key.p12")) | Set-Clipboard
```

这段命令将内容放入剪贴板，不会在终端展示私钥的 Base64 文本。第二个 Secret 填密钥密码。签名别名固定为 `xxwrt`。**以上两个 Secret 只有在你创建仓库后才能设置**。

## 构建

在 GitHub 仓库的 `Actions → Build signed XX-WRT M APK → Run workflow` 手动执行，或修改 `src/**` 后推送到 `main` 自动运行。下载 Actions → 对应运行 → `Artifacts → XX-WRT-M-custom-signed-apk`。

在本机可先运行：

```bash
python3 scripts/repackage.py
# 后续使用 Android SDK build-tools zipalign + apksigner 对 build/app-unsigned.apk 进行对齐与签名
```

## 将此目录上传到新仓库

在 GitHub 创建空的 **Private** 仓库（不要勾选自动生成 README / .gitignore），例如 `xxwrt-m-custom`。此压缩包**已包含 `.git` 目录和初始提交**，只需在解压后的工程根目录执行：

```bash
git remote add origin https://github.com/lmdbot/xxwrt-m-custom.git
git push -u origin main
```

如果解压工具意外忽略了隐藏的 `.git` 文件夹，则先 `git init -b main`、`git add .`、`git commit -m "Initial import"`，再运行上述命令。

GitHub 接口也允许向**现有仓库**提交二进制文件；但当前连接不提供“创建仓库”和“写入 Actions Secrets”能力，所以新建仓库及填写 Secrets 需要在 GitHub 界面完成。

## 限制

1. 这条工作流是**预编译资源替换 + APK 重打包 + 签名**，不是从原始 Vue / Android 工程进行完整编译；目前没有原作者源代码。
2. Android 真机的界面表现、路由器版本兼容性需要实际测试。
3. 初次运行 Actions 必须先完成两个 Secret 的配置；未配置时会明确报错而不会签出一个不同证书的包。
4. 不在公共 Release 或公共仓库发布未经授权的第三方 APK 或证书私钥。
