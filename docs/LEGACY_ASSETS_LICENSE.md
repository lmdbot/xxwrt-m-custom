# 历史资产的许可证核查（2026-11-15）

本文件逐项记录 XX-WRT 仓库中 **旧版 UniApp 1.0.6** 及当前 Material APP 所复用的第三方数据的来源与授权状态。这里的“许可证已识别”仅说明**已找到上游授权条款**，不等于整份编译资源或完整 APK 的所有再分发权利都已确认。

**范围区分：** Material 2.0 由 Vue + Capacitor 独立构建，`vendor/base.apk` 与 `src/www/` 不参与 Material 2.0 的自动 APK 构建；这些文件仍用于旧版手动工作流 `.github/workflows/build-apk.yml`。

## 证据清单与核查结论

| 仓库文件 / 组件 | 可直接确认的证据 | 上游 License / 权利 | 审查结论 |
| --- | --- | --- | --- |
| `src/www/manifest.json`、`__uniapp*.js` 与旧版构建资源 | `manifest.json` 标明旧版应用 `1.0.6`、uni-app 编译器版本 `5.26`、DCloud/UniApp 运行环境 | [uni-app 开源部分 Apache-2.0](https://github.com/dcloudio/uni-app/blob/master/LICENSE)；[DCloud 使用许可](https://uniapp.dcloud.net.cn/license.html)另有 Runtime/SDK 条款 | **部分确认**：开源框架不等于整个 Runtime 按 Apache-2.0 提供 |
| `vendor/base.apk` | Git 仓库中的基础 APK，文件大小 **17,437,619 字节**，Git blob `b4360c520ab85bcf3d6f6c63556319007c20e4b3`；旧构建通过 `scripts/repackage.py` 将 `src/www/` 覆盖入 APK 后重新签名 | 基础包的产生方式、SDK 组成、所有权与具体授权材料仍未取得 | **未确认**：不可简单视为可转授 MIT 的 APK；需核对官方打包记录/原始工程/SDK 许可 |
| `src/www/__uniappquill.js` | 文件头明确注明 **Quill Editor v1.3.7**，版权归 Jason Chen / Salesforce | [Quill v1.3.7 上游 BSD-3-Clause](https://github.com/slab/quill/blob/v1.3.7/LICENSE)；[本仓库保存的版权及许可正文](third-party-licenses/Quill-1.3.7-LICENSE.txt) | **许可证确认**；再分发须保留原始 BSD 版权及免责声明 |
| `src/www/__uniappquillhighlight.js` | 文件头明确注明 **Highlight.js v11.9.0**，含 BSD-3-Clause 说明 | [Highlight.js 11.9.0 BSD-3-Clause](https://github.com/highlightjs/highlight.js/blob/11.9.0/LICENSE)；[本仓库保存的版权及许可正文](third-party-licenses/Highlight.js-11.9.0-LICENSE.txt) | **许可证确认**；再分发应保留原始许可正文 |
| `src/www/__uniappquillimageresize.js` | 导出 `ImageResize` 模块，构建形式与 Quill Image Resize 生态吻合，但未能比对原始发行包版本/哈希 | [quill-image-resize-module 上游 MIT](https://github.com/kensnyder/quill-image-resize-module/blob/master/LICENSE) | **候选来源**：不能在版本与来源对应前认定该打包文件已经取得上游 MIT 覆盖 |
| `src/www/uni_modules/lime-echart/**` | 目录名及 `uvue.html` 明确调用 lime-echart、ECharts、ecStat 与 UniApp webview bridge | [lime-echart 插件市场 MIT](https://ext.dcloud.net.cn/plugin?name=lime-echart)；[ECharts Apache-2.0](https://github.com/apache/echarts/blob/master/LICENSE) | **组件授权确认**，但旧包里各个脚本精确版本仍需逐文件核对 |
| `src/www/uni_modules/lime-echart/static/app/ecStat.min.js` | **Git blob SHA 与上游 `ecomfe/echarts-stat/dist/ecStat.min.js` 完全一致**（`222529690ab94eac8d82fadd3092a259d8b1a3a5`） | [echarts-stat package.json](https://github.com/ecomfe/echarts-stat/blob/master/package.json) 声明 `BSD`，上游版本 1.2.0 | **来源确认**；但上游未提供可直接定位的完整 BSD 条款文件，具体 BSD 变体与完整许可文本仍待补证，不能凭“BSD”自行替换为 BSD-3 |
| `src/www/uni_modules/lime-echart/static/app/uni.webview.1.5.5.js` | 文件实现 UniApp webview 通信接口 | DCloud Runtime / SDK 使用条件，不应统一视为 MIT | **需进一步确认**该文件的具体许可与发行版本 |
| `ui/material-prototype/src/data/carbon-brands.js` | 源文件注明适配自 luci-theme-carbon、Simple Icons 及 IEEE MA-L | [Carbon 官方 Apache-2.0](https://github.com/mrjoechen/luci-theme-carbon/blob/main/LICENSE)；[Simple Icons CC0-1.0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md)；[IEEE MA-L 公共登记](https://standards.ieee.org/products-programs/regauth/) | **上游主要许可确认**；须保留归属、修改提示及适用声明。IEEE 公布公开下载列表，不等于自动采用 CC0 或 MIT |
| `docs/screenshots/**`、APP 定制图标 | 仓库内截图、海报和定制素材 | 项目原创部分由权利人授权；其中第三方商标/品牌受相应独立权利限制 | **分项处理**，不能因此向外授予他人商标权 |

## 旧版 APK 打包链路的重点风险

目前 `.github/workflows/build-apk.yml` 的运行方式是手工触发后执行 `scripts/repackage.py`，将修改后的 UniApp 编译 JS 覆盖进 `vendor/base.apk`，再利用 Android `zipalign` / `apksigner` 重签名。此流程**不是直接从原始 UniApp Vue 工程执行 DCloud 官方云打包**。

[DCloud 官方 uni-app 使用许可](https://uniapp.dcloud.net.cn/license.html) 明确区分开源框架与其持有知识产权的 Runtime/SDK，并写有官方云打包/官方离线 SDK 相关条件。**目前缺少足以判断这个“基础 APK + 覆盖编译文件”流程是否符合对应版本许可的材料。** 因此，不能据此保证旧版 APK 的独立改包/再签名及向第三方分发均已获授权；也不能简单断言违法，需结合来源、原始打包记录、适用许可版本核实。

建议在解决该事项之前，**不再使用旧版工作流公开生成新的 APK**；Material 2.0 的独立 Capacitor 构建不依赖上述历史基础包。

## 下一步要取得的证据

1. **基础 APK 来源：** 取得 `vendor/base.apk` 原始生成记录、原始包名与签名来源、对应 DCloud/HBuilderX/离线 SDK 版本；确认是否为版权人自建、官方生成以及是否允许自定义重打包。
2. **基础 APK 组件清单：** 在可授权检查的条件下获取 APK 的 AndroidManifest、内嵌 SDK、第三方 AAR/JAR/so 清单、应用隐私说明，以及原始许可证和 NOTICE。
3. **ecStat 许可全文：** 从当时实际发行的 npm 包或作者维护的许可证文档中确认 `BSD` 具体条款，补入适用版权声明。
4. **图片缩放模块：** 查明 `__uniappquillimageresize.js` 具体上游项目与版本/构建哈希，再确定是否可适用候选 MIT 许可证。
5. **Carbon/IEEE：** 对照上游具体版本保留 Apache-2.0 修改声明、版权/NOTICE（如有），确认所复用 MAC 厂商注册数据的实际获取和再分发条款。
6. **历史资产处理：** 若无法证明 `vendor/base.apk` 或部分编译文件可以按当前方式公开再分发，应从默认公开代码及旧 APK 发布流程中移除/隔离这些文件，而不是为它们直接添加 MIT 标头。

## 关于历史编译资源与本项目 MIT 的关系

本项目 [LICENSE](../LICENSE) 仅对版权持有人有权授权的原创代码与材料生效。对合法使用的第三方 BSD、Apache-2.0、MIT、CC0 与独立 SDK/Runtime，仍必须按各自原始条件分发；**不应该将第三方编译包写成“Copyright (c) 2026 lmdbot / MIT”并替代上游版权行**。

这是基于目前可获取的 GitHub 文件、原始许可文本和公共上游信息做的核查记录；没有读取完整 `vendor/base.apk` 的二进制组件，也没有取得私有的官方打包证明。本报告不是法律意见或最终的二进制分发许可证明。
