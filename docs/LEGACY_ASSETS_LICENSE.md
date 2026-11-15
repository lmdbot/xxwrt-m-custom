# 历史资产及第三方内容的授权边界

## 已识别范围

| 路径 | 来源和当前判断 | 是否直接纳入项目原创 MIT |
| --- | --- | --- |
| `ui/material-prototype/src/**`（自有实现部分） | Material 2.0 的 Vue、RPC、布局及维护逻辑 | 在版权持有人拥有授权权利的范围内适用 MIT |
| `ui/material-prototype/src/data/carbon-brands.js` | 文件头标明适配自 [luci-theme-carbon](https://github.com/mrjoechen/luci-theme-carbon)，使用 [Simple Icons](https://github.com/simple-icons/simple-icons) 品牌图形（CC0-1.0）以及 IEEE 注册数据 | 第三方数据、图形及上游修改部分**不因根目录 MIT 自动改为 MIT**；需遵守上游条款 |
| `src/www/**` | 旧版 UniApp 编译产物、框架及第三方模块，当前无法从仓库确认所有原作者授权与具体版本 | 否，先核查 |
| `vendor/base.apk` | 旧版 Android APK 二进制基础包，尚未确认其来源、可再分发条件及内部组件清单 | 否，先核查 |
| `docs/screenshots/**` | 部分为测试截图与宣传图，含第三方界面、文字、商标/图形等元素 | 仅在权利许可范围内授权原创部分 |
| `ui/material-prototype/assets/qwrt-purple-network-guardian.webp` | APP 定制图标素材；不代表其他第三方名称、品牌标志或商标权的授权 | 仅在项目有权授权的范围内 |
| `router/**`、`scripts/**` | 项目自有辅助脚本及早期维护脚本；可能调用或处理第三方资源 | 原创部分 MIT；调用的第三方资源保留原授权 |

## 重要边界

- **仓库公开 ≠ 所有历史文件自动按 MIT 授权。** 根目录 `LICENSE` 仅对有权授权的原创贡献生效，不能改变上游或其他权利人的许可证。
- `vendor/base.apk` 和 `src/www/**` 目前仍在仓库中以兼容旧版手动构建流程。它们被单独标记为**来源与再分发权限待核查**，不是已完成合规审计的 MIT 资产；不建议未经独立核实就将这些二进制或打包文件复用于衍生项目。
- 本次不擅自删除历史资产，以免破坏旧工作流；后续可以依据查明的来源与授权情况将它们剥离为独立归档或替换为可合法再分发的版本。
- 包含品牌/商标的图形并不因 Simple Icons 或项目 MIT 声明而免除第三方商标、形象或其他相关权利限制。
- 真实 APK 的 Gradle/Android 原生依赖、传递依赖许可证及适用的 `NOTICE` 仍需在发行流程中持续核查，并与最终分发包一同保留必要文本。

此文档是授权边界与待办登记，不是对未核实文件已获许可的保证。
