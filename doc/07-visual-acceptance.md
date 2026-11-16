# 07 · Design A 逐屏像素差异与 Android 真机验收

> 状态：**自动化验收流程已编制；像素级 100% 一致未认证；真机验收尚缺设备证据。** 不能将 SVG/HTML 示例画面、Chromium Android 视口、Capacitor APK 和真实 Android 手机的结果混为一谈。

## 验收基线与限制

- 规格：本目录 `03-page-specifications.md`、`04-design-system.md`、`05-interactions-and-states.md`。
- 设计参考：`doc/visuals/primary-pages.svg`、`secondary-pages.svg` 与 `doc/prototype.html`。**这些图使用演示数字、独立绘制的手机边框和状态栏，尚不是经批准的 APP 像素级 Golden 图片。**
- 运行基线：`ui/material-prototype/` 真正的 Vue/Vuetify 布局、Playwright 模拟 ubus/RPC、及需单独验证的 Android 原生容器。
- 同一页在不同动态值、屏幕密度、系统字体、缺少 Wi-Fi 的 x86 路由器上不应强求逐像素相等。验证必须区分固定组件的精确几何尺寸与真实动态内容的语义正确性。

## 自动截图与差异报告

手动运行 GitHub Actions **Design A visual screenshot review (manual)**，将生成：

- `test-results/design-a/reference/<宽度>/<light|dark>/<页面>.png`：HTML 交互原型参考；
- `test-results/design-a/actual/<宽度>/<light|dark>/<页面>.png`：使用确定性 RPC mock 的实际 Vue 页面；
- `test-results/design-a/overlay/`：各页 50% 叠加图；
- `test-results/design-a/diff/`：亮度放大的视觉差异图；
- `test-results/design-a/report.html` 和 `report.json`：按页查看、逐屏审阅。

屏幕宽度统一使用 **360×800、393×852、430×932 CSS px**，分别采集浅色/深色主题。此报告的像素差异率只是诊断指标：不同实现的文本、模拟系统状态栏、实时图表和样例数据都可能产生预期差异。不能以任意宽容阈值冒充“100% 一致”。

本地命令（在 `ui/material-prototype`）：

```bash
npm install
npx playwright install chromium
DESIGN_VISUAL_AUDIT=1 npx playwright test tests/ui-smoke.spec.cjs --grep "authenticate to real RPC adapter" --workers=1 --retries=0
node scripts/capture_design_reference.cjs
python3 -m pip install pillow
python3 scripts/compare_design_screenshots.py
```

## 逐页面对照清单

| 编号 | 正式 APP 页面 | 主要核查 | 验收状态 |
| --- | --- | --- | --- |
| A1 | 概览 | HealthHero、4 KPI、曲线、快捷、折叠详情、实值来源 | 自动截图脚本已添加；待人工审图 |
| A2 | 设备 | 多来源合并、在线证据、搜索筛选、终端卡 | 自动截图脚本已添加；待人工审图 |
| A3 | 网络 | WAN/LAN/IPv6、两组入口、状态标签 | 自动截图脚本已添加；待人工审图 |
| A4 | 工具 | 收藏、4 组分类、28 功能唯一归属、危险操作 | 自动截图脚本已添加；待人工审图 |
| A5 | 我的 | 路由器/设置/关于三组层级和版本 | 自动截图脚本已添加；待人工审图 |
| B1 | 详细监控 | 真实采样、图表比例、单位、无数据态 | 自动截图脚本已添加；待人工审图 |
| B2 | 终端详情 | 弹层/编辑、IPv4/IPv6/MAC、证据、QoS、固定 IP | 自动截图脚本已添加；待人工审图 |
| B3 | 网络接口 | WAN/LAN 编辑页、风险确认、回滚、IPv6 PD | 自动截图脚本已添加；待人工审图 |
| B4 | 防火墙 | 区域/规则/转发，生效状态和确认 | 自动截图脚本已添加；待人工审图 |
| B5 | DNS/DHCP | 静态租约、本地域名、校验及修改提示 | 自动截图脚本已添加；待人工审图 |
| B6 | DDNS / ZeroTier | 两个独立页面、服务状态和授权状态 | 自动截图脚本已添加；待人工审图 |
| B7 | 插件中心/详情 | Lucky 及其他 6 插件能力与权限降级 | Lucky 代表页已加入；其余待扩展 |
| B8 | 服务/软件包 | 搜索、运行与自启、软件包动作安全 | 自动截图脚本已添加；待人工审图 |
| B9 | 日志/诊断/安全 | 信息来源、无证据空态、筛选、拷贝 | 自动截图脚本已添加；待人工审图 |
| B10 | 备份恢复 | JSON/tar.gz、差异预览、倒计时与回滚 | 自动截图脚本已添加；待人工审图 |
| B11 | 设置/关于 | 显示、隐私、语言、更新、授权与版权 | 自动截图脚本已添加；待人工审图 |

> B1–B11 是**页面类别**，不是只有 11 张真实页面。代表页截图并不覆盖全部 28 项功能的所有内部 Tab、表单、确认对话框、离线与 ACL 状态。以上均**不是已签收**。

## 真机验收矩阵（待执行）

至少选择一台有 360–430dp 等效宽度的 Android 真机（建议另测大屏/字体放大 1.3×），使用实际签名 APK：

1. **系统层**：Android 状态栏/手势条安全区、浅/深系统主题、字体放大与键盘展开、WebView 渲染、锁屏恢复、横竖屏与返回手势。
2. **连接层**：QWRT x86 无无线网卡、普通 OpenWrt、有/无各插件、不同 RPC ACL；仅用测试路由器对 R2–R4 写入做带回退验证。
3. **功能层**：五个一级页面、各 B1–B11 二级页面及其内部 Tab/表单、28 项入口、跨栏目返回与滚动恢复、登录前/断线/无权限/未安装/未知状态。
4. **风险层**：UCI 保存/90 秒回退、WAN/防火墙变更中断连接、配置恢复和恢复出厂（后者仅隔离测试设备）；未经权限或确认绝不执行生产路由器危险写入。
5. **证据**：逐页设备截图、设备型号与 DPI、Android 版本、APK versionCode、目标路由器固件、测试用例结果、异常记录、复测时间及人工签字。

### 关闭条件

只有当全部页面视觉差异已审阅并修正、自动化/Android APK CI 全绿、完整真机矩阵留存可审计证据、风险操作获明确验证时，才能声明**“设计一致性已完成验收”**。即使如此，“100% 像素相等”只对冻结画面、固定 Golden 以及受控字体/密度/数据有效，不意味着动态信息的全部像素永久相同。

## CI 性能基线

历史 `playwright.config.cjs` 固定 `workers:1`，24 项浏览器测试串行。优化分支添加 CI 并行运行、依赖缓存、各用例耗时排行，真实收益以 GitHub Actions 的总墙钟时间与重试率为准；若并行导致超时，优先拆分超长综合测试或降低 worker 数而不是弱化业务断言。
