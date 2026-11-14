# XX-WRT Material UI QWRT 功能迁移工程

仅在 feature/material-ui 分支进行 UI 验证；不会修改 v1.0.6 生产 APK。当前页面**全部使用演示数据**。

## 技术栈与开源复用

- Vuetify 3.13.x：MIT，Material 组件和标准底栏（VBottomNavigation）
- @daisigu/vue-liquid-glass：MIT，现成 VGlass 液态玻璃容器
- Material Design Icons：Apache-2.0，现成图标
- Vue3 + Vite：页面组合和本地预览

未重新编写 Material 组件库或 Liquid Glass 折射算法；仅编写路由器业务视图及必要的布局适配样式。打包的开源依赖保留上游许可证。

## 本地运行

1. 安装 Node.js 22
2. 进入 ui/material-prototype
3. 执行 npm install
4. 执行 npm run dev，浏览终端输出的本地预览 URL
5. 执行 npm run build 可生成 dist 静态页面

右上角“标准 / 液态”可以切换底栏，选择保存在浏览器 localStorage；主题可选择跟随系统/浅色/深色。五个导航入口均可交互。

注意：此处的切换是**Vue3 原型里的 UI 行为**，尚未接入真实 APK、UniApp 原生 tabBar 或路由器 RPC。详见 docs/ui-material-evaluation.md。


## v0.4.0 UI 与 main 功能迁移进展

- 首页设备列表增加左侧抽屉菜单，复用原版菜单名称，并把底栏“标准/液态”和主题设置移动到侧栏。
- 终端列表改为紧凑 Material 卡片，支持设备名/IP/MAC 检索。
- 家长控制新增独立 OpenAppFilter RPC 规则编辑组件（分类、时间、用户、高级），不以 LuCI 页面代替。
- 恢复出厂沿用 main 的 file.exec /sbin/firstboot -r -y 参数，加入输入“恢复出厂”确认；未对实际路由器执行破坏性测试。
- **仍不等价于 main 全部功能**：历史统计、终端高级统计、多语言完整文案、部分帮助/关于未全量迁移。参见 docs/material-main-feature-parity.md。
