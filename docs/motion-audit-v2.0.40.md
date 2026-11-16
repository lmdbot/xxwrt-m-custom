# v2.0.40 页面动效检查清单

本清单针对 `ui/material-prototype/src` 应用代码和 Vuetify 通用组件，目的是防止遗漏动效入口。**系统 Android 原生文件选择器、安装器等不属于 APP 内 WebView**，不能用这个开关干预。

| 动效来源 | 覆盖行为 | 开启动效 | 关闭动效 / OS Reduced Motion |
| --- | --- | --- | --- |
| 五大导航页签 | 当前页签再点标题返回顶部 | 平滑滚动 | 即时回顶 |
| 应用子页面导航 | 返回应用首页 | 即时恢复原滚动位置 | 即时恢复原滚动位置 |
| 新页面进入 | 设置、应用列表、终端、路由器卡片、网络/应用详情 | 200ms 淡入/位移 <=8px | 近乎即时 |
| 列表交互 | 应用快捷卡、分类、底栏、普通设备卡 | 短时色彩/缩放反馈 | 即时反馈，无缩放 |
| 抽屉 / 对话框 | 侧边设置、警告、确认、更新、授权等 `VNavigationDrawer`/`VDialog` | Vuetify 内置过渡 | 全局缩短至约 0.01ms |
| 下拉和菜单 | `VMenu`、`VSelect`、下拉菜单 | Vuetify 内置过渡 | 全局缩短至约 0.01ms |
| 提示 / 消息 | `VSnackbar`、Chip、Tooltip、Alert | Vuetify 内置过渡 | 全局缩短至约 0.01ms |
| 折叠区域 | `VExpandTransition`、`VExpansionPanel`、列表筛选 | Vuetify 内置过渡 | 全局缩短至约 0.01ms |
| 加载指示 | 旋转加载、骨架/进度条 | 系统 UI 库原有动效 | 动效冻结，但文本状态仍保留 |
| 实时图表 | `RealtimeChart.vue` 中 ECharts 的首次渲染与数据更新 | 240ms/180ms | `animation:false`，更新立即生效 |
| 历史图表 | `TrendChartPanel.vue` 的静态 SVG | 原始数据静态呈现 | 无动画可关闭 |
| 液态导航 | `VGlass` 动态玻璃装饰 | 使用玻璃渲染组件 | 使用静态 `glass-host` |
| 程序滚动 | “展开全部应用”、页签重复点击、路由滚动恢复 | 平滑（仅用户发起的滚动） | 即时；路由恢复始终即时 |
| 系统无障碍 | `prefers-reduced-motion: reduce` | 不影响 UI 功能 | 无论 APP 动效开关如何，优先禁用 WebView 动效 |

实现边界：全部样式覆盖都挂在 `html[data-xxwrt-motion]`（而非只挂在 `v-app` 内），从而包括通过 Teleport 挂载的 Vuetify 浮层。显示页的本机设置依旧优先于默认值；系统减少动态效果优先级最高。JS 实现另行关闭 ECharts 动画，不能仅依赖 CSS。

回归检查：`tests/motion-preferences.test.mjs` 覆盖存储、系统偏好和所有五大标签；`ui-smoke.spec.cjs` 覆盖显示设置开关、系统 reduced motion、应用子页面返回和重复点应用标签回顶；`test:logic` 和 `test:ui` 与 GitHub Actions 一致。
