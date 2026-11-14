# XX-WRT Material UI 演示工程

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
