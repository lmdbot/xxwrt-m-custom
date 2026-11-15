# 第三方开源软件与许可证声明（THIRD_PARTY_NOTICES）

此文件记录 XX-WRT Material 主线明确使用的直接依赖及仓库内已识别的第三方来源。各第三方组件的版权、商标及许可证均归其相应权利人所有；**项目自己的 MIT License 不会替代、覆盖或重新授权这些内容**。

本清单根据 `ui/material-prototype/package.json`（v2.0.16）及已识别的数据来源整理，不是完整 SBOM；实际 npm 传递依赖、Capacitor Android 原生依赖、Gradle 依赖及生产 APK 需要根据最终构建物继续核对。

### Material APP 运行依赖

| 组件 | 版本 | License / 权利说明 | 上游 |
| --- | --- | --- | --- |
| `opencc-js` | 1.4.2 | MIT AND Apache-2.0（浏览器端简繁转换及内置词典） | [来源](https://github.com/nk2028/opencc-js) |
| `vue` | 3.5.22 | MIT | [来源](https://github.com/vuejs/core/blob/main/packages/vue/LICENSE) |
| `vuetify` | 3.13.7 | MIT | [来源](https://github.com/vuetifyjs/vuetify/blob/master/packages/vuetify/LICENSE.md) |
| `@mdi/font` | 7.4.47 | Apache-2.0（字体/图标；代码 MIT） | [来源](https://github.com/Templarian/MaterialDesign/blob/master/LICENSE) |
| `echarts` | 5.6.0 | Apache-2.0 | [来源](https://github.com/apache/echarts/blob/master/LICENSE) |
| `@daisigu/vue-liquid-glass` | 1.0.4 | MIT | [来源](https://github.com/Daisigu/vue-liquid-glass) |
| `@capacitor/core` | 8.0.0 | MIT | [来源](https://github.com/ionic-team/capacitor/blob/main/core/LICENSE) |
| `@capacitor/android` | 8.0.0 | MIT | [来源](https://github.com/ionic-team/capacitor) |
| `@capacitor/app` | 8.0.0 | MIT | [来源](https://github.com/ionic-team/capacitor-plugins) |
| `@capacitor/browser` | 8.0.0 | MIT | [来源](https://github.com/ionic-team/capacitor-plugins) |
| `@aparajita/capacitor-secure-storage` | 8.0.1 | MIT | [来源](https://github.com/aparajita/capacitor-secure-storage/blob/main/LICENSE) |

### 构建与测试依赖（通常不随 APK 分发）

| 组件 | 版本 | License / 权利说明 | 上游 |
| --- | --- | --- | --- |
| `vite` | 7.3.8 | MIT | [来源](https://github.com/vitejs/vite/blob/main/LICENSE) |
| `@vitejs/plugin-vue` | 6.0.0 | MIT | [来源](https://github.com/vitejs/vite-plugin-vue) |
| `@capacitor/cli` | 8.0.0 | MIT | [来源](https://github.com/ionic-team/capacitor) |
| `@playwright/test` | 1.65.0 | Apache-2.0 | [来源](https://github.com/microsoft/playwright/blob/main/LICENSE) |

### 源码内额外引用的第三方数据与美术素材

| 组件 | 版本 | License / 权利说明 | 上游 |
| --- | --- | --- | --- |
| `Carbon 品牌识别数据` | 仓库内置/适配 | 需同时遵守上游声明（报告为 Apache-2.0） | [来源](https://github.com/mrjoechen/luci-theme-carbon) |
| `Simple Icons 商标图形` | 仓库内置/适配 | CC0-1.0（各品牌的独立权利另行适用） | [来源](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md) |
| `IEEE MAC 地址前缀注册数据` | 仓库内置/适配 | 数据源条款及数据库权利需另行核查 | [来源](https://standards.ieee.org/products-programs/regauth/) |

## 许可证原文

- **MIT License**：仓库根目录的 [LICENSE](LICENSE) 包含完整 MIT 许可正文（仅就项目有权授权的原创部分提供许可）；第三方 MIT 项目的版权行和具体许可声明仍应从对应发行包保留。
- **Apache License 2.0**：完整英文条款已收录为 [Apache-2.0](ui/material-prototype/src/data/LICENSE-Apache-2.0.txt)，与 [Apache 基金会官方文本](https://www.apache.org/licenses/LICENSE-2.0.txt) 对应。
- **CC0 1.0**：[Creative Commons 官方全文](https://creativecommons.org/publicdomain/zero/1.0/legalcode)。Simple Icons 对商标与单个图形权利另有 [免责声明](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)，CC0 不会消除第三方商标权。

## 历史编译文件许可核查（2026-11-15）

已进一步核对 `src/www/` 中的可识别第三方脚本及旧 APK 生成方式，详情参见 [历史资产核查证据](docs/LEGACY_ASSETS_LICENSE.md)。

| 已识别的旧版组件 | 上游来源及版本证据 | License | 核查结论 |
| --- | --- | --- | --- |
| Quill Editor | `__uniappquill.js` 注明 v1.3.7 | BSD-3-Clause · [全文](docs/third-party-licenses/Quill-1.3.7-LICENSE.txt) | 源文件注明且上游条款确认 |
| Highlight.js | `__uniappquillhighlight.js` 注明 v11.9.0 | BSD-3-Clause · [全文](docs/third-party-licenses/Highlight.js-11.9.0-LICENSE.txt) | 源文件注明且上游条款确认 |
| lime-echart | 旧版 `uni_modules/lime-echart` | [MIT](https://ext.dcloud.net.cn/plugin?name=lime-echart) | 插件许可确认，精确打包版本未确认 |
| ECharts（旧版） | `uni_modules/lime-echart/static/app/echarts.min.js` | [Apache-2.0](https://github.com/apache/echarts/blob/master/LICENSE) | 上游许可确认，文件版本未核实 |
| ecStat | `ecStat.min.js` 与 [上游文件](https://github.com/ecomfe/echarts-stat/blob/master/dist/ecStat.min.js) Git blob 一致 | 上游 package.json 标记 `BSD` | **来源确认、BSD 具体变体/完整条款待补证** |
| Quill ImageResize | `__uniappquillimageresize.js` 模块结构 | 候选上游 [MIT](https://github.com/kensnyder/quill-image-resize-module/blob/master/LICENSE) | 具体版本及代码来源尚不能严格对应 |
| DCloud uni-app / 5+ Runtime | `manifest.json` 标记旧版 uni-app 1.0.6 | 开源部分 [Apache-2.0](https://github.com/dcloudio/uni-app/blob/master/LICENSE)，Runtime 另见 [DCloud 条款](https://uniapp.dcloud.net.cn/license.html) | **非统一 Apache-2.0/MIT，再打包与再分发方式待核实** |

旧工作流会将 `src/www/` 资源覆盖至 `vendor/base.apk` 后重新签名；在取得原始 DCloud 打包/SDK 许可证明前，不能确认这一历史二进制的公开再分发权利。**以上条款均不自动适用于旧版整个 APK**。

## 再分发时的注意事项

1. 分发含第三方 MIT 代码的源码或二进制时，请保留各组件原始版权声明与许可声明。
2. 对 Apache-2.0 作品，分发时应提供许可证全文、明确标识已修改的文件，保留适用版权/权利声明；如果上游包包含适用的 `NOTICE`，也应在衍生分发物中保留该 NOTICE。当前清单**不能替代上游发行包实际附带的版权与 NOTICE**。
3. 在 Material APP “设置 → 关于 → 开源许可证”可离线阅读项目 MIT 与 Apache-2.0 正文及主要组件来源；如需各第三方的精确版权行和 NOTICE，应检查实际安装的版本。
4. OpenWrt、LuCI、ubus/rpcd、ShadowSocksR Plus+、OpenClash、ZeroTier、Lucky、OpenAppFilter 等是 APP 所**对接的路由器端服务**，通常未打包进当前 APK。其再分发义务由相应的实际分发行为决定。
5. `src/www/`、`vendor/base.apk` 等旧版编译文件并未完成来源/许可核查，不能仅凭项目根目录 MIT 文件推定拥有复制、二次分发或再授权权利。详见 [历史资产授权审查](docs/LEGACY_ASSETS_LICENSE.md)。

本声明不表示与上述上游项目之间存在赞助、背书或官方合作关系。
