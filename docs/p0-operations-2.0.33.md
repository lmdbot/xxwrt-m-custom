# Material 2.0.33：P0 运维工具增量实现

本轮以已合入 HQoS PR 的 main v2.0.32 为基础；不修改 QoS 相关文件。

## 新功能

- 网络诊断：从路由器运行 Ping / Traceroute / nslookup，固定可执行路径及参数列表；检查运行结果和退出码。未安装或无 ACL 授权时明确提示，不使用任意 Shell。
- 日志：优先 \`log.read\`，失败回退到 LuCI 已授权的固定日志程序；支持系统/内核日志、搜索、复制和限定最大显示量。
- 配置快照：选择 network/dhcp/firewall/system，生成 UCI JSON 快照，使用系统分享或 Web 下载，提供可复制文本兜底。支持导入、仅对“同名同类型现有配置节”进行差异恢复，跳过缺失节，不会删除额外配置。采用 \`uci.apply(rollback=true, timeout=90)\` 和用户明确 \`confirm\` / \`rollback\`。
- DNS/DHCP：通过 UCI 管理 \`dhcp\` 中的 domain（本地解析）和 host（静态租约），拒绝重复 MAC/IP、非法字段，提交后尝试重载 dnsmasq。
- 服务管理：展示 \`rc.list\` 状态，通过授权的 \`rc.init\`（必要时 \`luci.setInitAction\`）操作服务。阻止停止、禁用、重启网络与管理关键服务。

## 能力边界和风险

1. **配置快照不是 sysupgrade 的完整系统备份**，不含未纳入的文件、证书、软件安装包和第三方插件数据库；若需要整机备份，仍应保留标准 sysupgrade 归档。跨设备恢复时只匹配当前已存在的相同 UCI 节名和类型，未匹配条目被跳过。
2. 快照可能包含 PPPoE 密码等敏感配置；不自动持久化到 APP localStorage 或云端。Android WebView 的文件分享/下载行为因系统而异，已提供可复制文本兜底，**需真机验证**。
3. QWRT/OpenWrt 固件、rpcd ACL、命令路径和部分第三方插件不同。仅声明基于标准接口的最佳努力适配；对无权限操作提供错误反馈。
4. 配置写入超时或网络断开后可能处于结果未知状态。不要立即重试，先等待回滚并重新连接。应用不会绕过路由器权限。DNS/DHCP 写入成功但服务重载不可确认时会提示“已保存，重载待确认”。
5. 关键服务禁止危险操作，但第三方服务仍可能对网络连接产生影响，操作前请保留备用管理通道。

## 验证

- \`npm run test:logic\` 包含 \`router-operations.test.mjs\`，覆盖注入输入拒绝、日志数据转换、快照格式校验、差异恢复、回滚 RPC、DHCP 静态记录冲突和关键服务保护。
- Playwright 的 ubus 模拟不是 QWRT 真机验证。建议分别在 QWRT 与标准 OpenWrt 上测试有/无权限、服务不存在、WAN 断线、DNS 记录重载及恢复超时场景。
