# XX-WRT Material 3.0 — Android OpenWrt / QWRT 管理器

这是 `main` 的 Android 应用源码。Vue 3 + Vite + Vuetify 3 + Capacitor 8 构建 Material / Liquid Glass 界面，数据来自登录路由器的真实 ubus JSON-RPC、UCI 与授权的插件接口，不使用假终端数据。

## 独立 Android 应用

- Material 包名：`com.lmdbot.xxwrt.materialpreview`
- Material 应用名称：`XX-WRT管理器`
- 版本：`3.0.0`（Android versionCode `3000000`）
- 与旧版 UniApp `XX-WRT M` 的 Android package ID 不同，可同时安装。
- 保留 Material 主线应用信息与 Capacitor 构建流程；启动器图标使用蓝色二次元 Q 版 OpenWrt 路由器少女设计，并提供传统、圆形及自适应图标。
- 正式 APK 使用 `XX-WRT-Material-vx.x.x.apk` 命名，构建版本自动取自 `package.json`。
- `main` 提供正式发布渠道；`feature/material-ui` 提供预发布测试包。

## 功能与权限

提供多路由器管理、终端在线状态、实时统计、WAN/LAN、网络设备、SSR Plus+、ZeroTier、微信推送、Internet Detector、网络唤醒、防火墙等已实现的 QWRT 功能。只有在 QWRT 允许相应 RPC/文件/服务操作时，才能读取实时状态或执行管理命令；无授权时不伪造状态，也不会打开任意 Shell 权限。

支持浅色、深色和系统主题；统一文字对比度、弹窗/应用子页面返回逻辑及底栏根页面返回路由器列表。底栏可使用标准 Material 或 Liquid Glass 风格。

## 应用更新

- 启动时优先检查阿里云正式版更新，服务不可用时回退至 GitHub 正式 Release；设置 → 关于 → 版本与更新可手动检查。
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

## 开源授权

项目有权授权的原创代码以 [MIT License](../../LICENSE) 公开，允许使用、修改和商用，分发时需保留版权和许可声明。第三方库、Carbon/Simple Icons 数据及历史 UniApp 编译资源的权利边界见 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) 与 [历史资产授权审查](../../docs/LEGACY_ASSETS_LICENSE.md)。APP 内可在“设置 → 关于 → 开源许可证”离线查看 MIT、Apache-2.0 正文与主要运行依赖声明。

## 配置快照文件导出（安卓）

- “生成并保存 JSON”打开安卓系统的“另存为”文件选择器，由用户自主选择存储位置和文件名；只有完成磁盘写入后显示保存成功。
- 取消或保存失败不会丢失已生成 JSON，可重新使用“保存 JSON 文件”按钮，也可复制文本。
- 此功能导出的是所选 UCI 配置（network、dhcp、firewall、system），不是 sysupgrade 原生全量备份；生成的配置可能含密码或密钥，请妥善保管。


## OpenWrt / QWRT 系统原生配置备份（Android）

- 在「应用 → 配置备份与恢复」点击「生成并保存原生备份（tar.gz）」。
- 调用路由器 LuCI 的 cgi-backup 接口，以已登录的 rpcd Session 创建固件兼容的配置备份归档。
- Android 原生插件通过系统文件选择器选择保存位置，使用私有临时文件、64MB 大小限制和 gzip 完整性校验，不将归档当作文本 JSON，也无需额外存储权限。
- 与已有 UCI JSON 快照功能严格区分；系统备份不是固件镜像或整盘克隆，备份的文件范围由目标固件决定。
- 接口缺失、ACL 未授权时明确提示，不通过任意 Shell 权限绕过。原生备份可能包含密码和私钥，需要保密保存。

## 界面动效增强（v2.0.41）

- 主页面、设备列表和详情、设置分类、应用功能列表和子页面采用 270ms 内可中断的方向性页面动效。动画不重建组件，不影响滚动位置恢复、表单输入和后台 RPC。
- 终端和网络分类切换、设备列表增删和位置变化、应用分类展开收起、常用应用与侧栏项目增加简短过渡、有限错峰入场、选中状态和按压反馈。
- 继续由“设置 → 显示 → 界面动效”统一控制；系统“减少动态效果”具有优先级，关闭时即时停止 Web Animations。CPU、带宽、连接数的周期刷新不触发场景动画。

## 关于页面优化（v2.0.43）

- 页面顶部使用与当前 Android APP 启动图标同源的既有 Q 版路由器形象，不使用新设计的 Logo；居中展示应用名称、当前安装版本和简要介绍。
- “应用信息 / 版本与更新 / 相关链接”分组提供项目说明、版本检查与日志、下载/安装、GitHub、Issues、开源许可及隐私/免责声明入口。
- 点击版本标签可查看原生构建号（Android）、前端真实构建时间及包名，支持复制；主题及简中/繁中/英文沿用现有设置。
- 本次仅修改关于页面和相关信息展示，保留原应用更新、Android 签名、原生安装器及路由管理权限逻辑。

## 开发者头像（v2.0.43）

“设置 → 关于 → 开发者与项目”显示用户提供的头像，资源随 APK 打包（`assets/developer-avatar.webp`，160×160），不向 GitHub 或第三方头像 CDN 发起网络请求；点击列表仍打开现有项目页面。应用启动图标不变。


## Material 3.0 整体导航重设计

- 五个底栏：**概览 / 设备 / 网络 / 工具 / 我的**，替代原六入口。`设备` 指连接路由器的终端，多台路由器通过顶部切换或“我的 → 路由器管理”维护。
- **概览** 展示路由状态、资源、真实实时流量摘要与快捷操作；点击“详细监控”进入原统计图表及历史功能。
- **设备** 继续支持 DHCPv4、DHCPv6、无线和应用过滤用户；家长控制和网络唤醒成为终端管理入口。
- **网络** 增设网络功能首页，接口、物理设备、无线硬件、路由表、DNS/DHCP、防火墙、DDNS 和 ZeroTier 按业务分类。
- **工具** 保留原始每台路由器五项收藏与搜索，分类调整为插件中心、系统管理、诊断与安全、维护与备份；所有 28 项原有工具均保留实际入口。
- **我的** 直接提供路由器管理、显示、隐私、刷新、语言、实验室和关于更新。保留原生 APK 更新器、Android KeyStore 和已有 RPC/UCI 功能。
- 引入独立 `style-v3.css`：Material 3 卡片、轻量玻璃底栏、深浅主题及窄屏适配。网络修改、备份恢复与危险操作继续沿用现有确认/回滚保护。

**迁移原则：** 优先调整信息架构及页面容器，原路由器 RPC 业务组件、权限处理、状态检测与配置安全机制保持复用。
