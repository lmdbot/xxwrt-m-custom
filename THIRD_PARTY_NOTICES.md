# 第三方开源软件与许可证声明（THIRD_PARTY_NOTICES）

此文件记录 XX-WRT Material 主线明确使用的直接依赖及仓库内已识别的第三方来源。各第三方组件的版权、商标及许可证均归其相应权利人所有；**项目自己的 MIT License 不会替代、覆盖或重新授权这些内容**。

本清单根据 `ui/material-prototype/package.json`（v2.0.16）及已识别的数据来源整理，不是完整 SBOM；实际 npm 传递依赖、Capacitor Android 原生依赖、Gradle 依赖及生产 APK 需要根据最终构建物继续核对。

### Material APP 运行依赖

| 组件 | 版本 | License / 权利说明 | 上游 |
| --- | --- | --- | --- |
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

## 再分发时的注意事项

1. 分发含第三方 MIT 代码的源码或二进制时，请保留各组件原始版权声明与许可声明。
2. 对 Apache-2.0 作品，分发时应提供许可证全文、明确标识已修改的文件，保留适用版权/权利声明；如果上游包包含适用的 `NOTICE`，也应在衍生分发物中保留该 NOTICE。当前清单**不能替代上游发行包实际附带的版权与 NOTICE**。
3. 在 Material APP “设置 → 关于 → 开源许可证”可离线阅读项目 MIT 与 Apache-2.0 正文及主要组件来源；如需各第三方的精确版权行和 NOTICE，应检查实际安装的版本。
4. OpenWrt、LuCI、ubus/rpcd、ShadowSocksR Plus+、OpenClash、ZeroTier、Lucky、OpenAppFilter 等是 APP 所**对接的路由器端服务**，通常未打包进当前 APK。其再分发义务由相应的实际分发行为决定。
5. `src/www/`、`vendor/base.apk` 等旧版编译文件并未完成来源/许可核查，不能仅凭项目根目录 MIT 文件推定拥有复制、二次分发或再授权权利。详见 [历史资产授权审查](docs/LEGACY_ASSETS_LICENSE.md)。

本声明不表示与上述上游项目之间存在赞助、背书或官方合作关系。
