# UI 美化技术评估与实施路线（feature/material-ui）

## 目标与范围

- 保持 main / v1.0.6 作为稳定基础版；不对基础版 APK / Release 引入尚未验证的新 UI。
- 借用现成的开源组件实现 Material 风格：首页、设备卡片、资源卡片、状态标签和底栏。
- 底栏支持 **标准**（传统 Material 底部导航）和 **液态**（Liquid Glass）两种方案；在设置入口切换，用户选择持久化。
- 保留五个业务入口：首页、统计、终端、网络、应用；保留 QWRT/Internet Detector/温度/明暗主题能力。

## 技术现状与关键约束

现仓库不是原始 Vue/UniApp 工程。src/www 内的 app-service.js 和 app-view.js 已经编译；vendor/base.apk 包含 Android/UniApp 运行时；GitHub Actions 仅覆盖前端资源、打包并重新签名。

原始 src/www/manifest.json 中的 plus.tabBar 是 **UniApp 原生底栏**，不是一个可直接用 npm 包替换的 Vue 组件。要换成 Material/液态底栏，必须同步处理原生 tabBar 隐藏/切换、各页面导航和 Android WebView 兼容。这不是单纯添加 CSS 或 npm 依赖就能完成的。

- 不能把 Vue3/Vuetify 组件直接塞入既有 app-service.js 的已编译渲染树。
- 双层 UniApp 渲染器的节点 ID 和样式绑定需保持一致；此前出现 undefined / 样式丢失正是这种风险。
- 当前仅有前端原型，尚不应宣称 Material UI 已集成进可安装 APK。
- 任何新的路由器通信桥接应复用原有认证流程，避免将登录 Token 暴露到外网、CDN 或第三方页面。

## 开源库评估

| 项目 | 用途 | 许可证 | 适用性与限制 |
| --- | --- | --- | --- |
| Vuetify 3.13.x | Vue3 Material 风格卡片、按钮、主题及 VBottomNavigation | MIT | 主方案：成熟组件；需 Vue3 新工程，不能直接注入旧 UniApp 编译产物 |
| @daisigu/vue-liquid-glass 1.0.4 | VGlass SVG/模糊液态玻璃容器 | MIT | 主方案：包裹底栏；需在 Android WebView 测试模糊、性能和降级 |
| @mdi/font | Material Design Icons | Apache-2.0 | 现成图标字体，离线打包进原型 |
| @material/web | 官方 Material 3 Web Components | Apache-2.0 | 可作为设计基准，但目前仓库处维护模式；与 UniApp 原生底栏的集成不是即插即用 |
| @sapryniukt/vue-liquid-glass | 另一个现成液态 BottomNavBar 实现 | GPL-3.0 | 有专用组件，但许可证义务更强，当前不作为默认依赖 |

官方/源代码链接：
- Vuetify：https://github.com/vuetifyjs/vuetify
- Vuetify Bottom Navigation：https://vuetifyjs.com/en/components/bottom-navigation/
- Vue Liquid Glass：https://github.com/Daisigu/vue-liquid-glass
- MDI：https://github.com/Templarian/MaterialDesign-Webfont
- Material Web：https://github.com/material-components/material-web
- 候选但未选用（GPL）：https://github.com/sapryniukt/vue-liquid-glass

以上为第三方组件及其许可；没有重新实现 Liquid Glass 的折射算法或 Material UI 组件库。分支原型只提供业务组合和少量布局样式。

## 已添加的可运行原型

目录：ui/material-prototype

- Vue 3 + Vuetify 3：Material 卡片、按钮、状态标签、标准底栏、深浅色主题。
- Vue Liquid Glass：VGlass 包裹液态底栏，提供现成的模糊/折射效果。
- 两种底栏共用同一 activeTab；可以切换并记住选择。
- 页面展示基于截图的**演示数据**（不调用路由器 RPC，不包含真实登录状态）。
- 桌面浏览器/手机浏览器预览；尚未部署至 APK，CI 仅构建静态预览资产。

## 接入现有应用的分阶段计划

1. **视觉/性能验证**：在不同 Android 版本、亮/暗主题和不同屏幕尺寸上对比底栏；液态效果不可用时保持清晰的实色/半透明背景；支持减少动画。
2. **接入方式选型**：优先获取原 UniApp 源码，再使用兼容的 Vue 组件重构。若无法获取源码，可研究隔离的 Android WebView + 原生桥接路线；旧编译页面和新 Vue3 页面不可假装是同一渲染体系。
3. **业务接口映射**：把当前页面需用的 ubus/RPC 数据接口封装成独立适配层，在安全桥接环境完成授权、错误处理和刷新。
4. **原生底栏替换**：避免双底栏；做好状态栏与底部安全区、软键盘、返回键、五个页面导航、重启后设置持久化。
5. **构建/发布隔离**：另设 Material 分支构建/测试；真机回归通过且有可复现的构建链路后，才提供实验版 APK。不得自动覆盖稳定版 v1.0.6 Release。

## 验收标准

- 标准与液态模式切换后布局清晰，均能点击五个导航标签。
- UI 原型能在 GitHub Actions 构建，不依赖公网运行时 CDN。
- 液态效果运行不可靠的 Android WebView 具备清晰、可点击的降级显示。
- 不出现 undefined、不挡住底部内容、不产生多重底栏、不破坏温度/监测状态。
- 不动 main 分支原 APK，独立发布实验版方可交付实际安装测试。
