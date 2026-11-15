import test from 'node:test'
import assert from 'node:assert/strict'
import { LANGUAGES, normalizeLanguage, translateText } from '../src/services/localization.js'

test('all three supported languages use stable codes', () => {
  assert.deepEqual(LANGUAGES.map(item => item.code), ['zh-CN', 'zh-TW', 'en'])
  assert.equal(normalizeLanguage('xx'), 'zh-CN')
  assert.equal(normalizeLanguage('en'), 'en')
})
test('English covers navigation, settings, app panels and router actions', () => {
  assert.equal(translateText('设备列表', 'en'), 'Device list')
  assert.equal(translateText('语言', 'en'), 'Language')
  assert.equal(translateText('网络唤醒', 'en'), 'Wake on LAN')
  assert.equal(translateText('防火墙区域', 'en'), 'Firewall zones')
  assert.equal(translateText('  运行中  ', 'en'), '  Running  ')
})
test('Traditional Chinese is converted locally and retains identifiers', () => {
  assert.equal(translateText('设备列表', 'zh-TW'), '設備列表')
  assert.equal(translateText('简体中文', 'zh-TW'), '簡體中文')
  assert.equal(translateText('QWRT x86/64 192.168.100.1', 'zh-TW'), 'QWRT x86/64 192.168.100.1')
})
test('language switching is reversible and non-UI values are unchanged', () => {
  assert.equal(translateText('设备列表', 'zh-CN'), '设备列表')
  assert.equal(translateText('192.168.100.1', 'en'), '192.168.100.1')
  assert.equal(translateText('AA:BB:CC:DD:EE:FF', 'en'), 'AA:BB:CC:DD:EE:FF')
  assert.equal(translateText('设备列表', 'zh-TW'), '設備列表')
  assert.equal(translateText('设备列表', 'en'), 'Device list')
})

test('English routing table labels retain their intended meanings', () => {
  const expected = {
    '路由表': 'Routing table',
    '静态配置及系统实时路由': 'Static configuration and active system routes',
    '进程运行信息': 'Process details',
    '搜索网段、网关、接口': 'Search subnets, gateways, or interfaces',
    '静态配置': 'Static configuration',
    '系统路由': 'System routes',
    '默认路由': 'Default route',
    '网络路由': 'Network route',
    '主机路由': 'Host route',
    '原始路由条目': 'Raw route entry',
    '经由 192.168.100.1': 'Via 192.168.100.1',
    '表 999': 'Table 999',
    '协议 kernel': 'Protocol kernel',
    '跃点 10': 'Metric 10',
    '16 条': '16 entries',
    '系统': 'System',
    '静态': 'Static'
  }
  for (const [chinese, english] of Object.entries(expected)) {
    assert.equal(translateText(chinese, 'en'), english, chinese)
  }
})

test('Lucky core health and interpolated settings remain readable in English', () => {
  const expected = {
    '执行权限正常': 'Executable OK',
    '核心执行权限异常': 'Executable permission error',
    '未安装 Lucky 核心': 'Lucky core not installed',
    '核心文件路径不安全': 'Unsafe core file path',
    '无法确认内核状态': 'Core status unknown',
    'CPU 架构：x86_64': 'CPU architecture: x86_64',
    '管理端口：16601': 'Management port: 16601',
    '后台外网访问：允许': 'Remote admin access: Allowed',
    '安全入口：已设置': 'Secure access: Configured',
    'DIY 自定义推送': 'DIY custom notification'
  }
  for (const [chinese, english] of Object.entries(expected)) {
    assert.equal(translateText(chinese, 'en'), english, chinese)
  }
})

test('English translates dropdown options, action toasts, and confirmation dialogs', () => {
  const expected = {
    '关闭推送': 'Disable notifications',
    '企业微信 Markdown': 'WeCom Markdown',
    'Server酱': 'ServerChan',
    '邮件 msmtp': 'Email (msmtp)',
    '规则模式': 'Rule mode',
    '全局模式': 'Global mode',
    '设备上线通知': 'Device online notification',
    '最新状态已刷新': 'Status refreshed',
    '节点切换成功，重启命令已执行': 'Node changed; restart command completed',
    'SSR Plus+ 已启动': 'SSR Plus+ started',
    'ZeroTier 已启用，服务已重启': 'ZeroTier enabled and service restarted',
    '家长控制已刷新': 'Parental controls refreshed',
    'Carbon 更新器未接受检测请求': 'Carbon updater rejected the check request',
    '重新读取会丢弃此文件的未保存修改，是否继续？': 'Reloading will discard unsaved changes to this file. Continue?',
    '配置已保存，已提交服务重启操作': 'Configuration saved; service restart requested'
  }
  for (const [chinese, english] of Object.entries(expected)) {
    assert.equal(translateText(chinese, 'en'), english, chinese)
    assert.equal(translateText(chinese, 'zh-CN'), chinese, chinese)
  }
})

test('dynamic snackbar messages preserve identifiers while translating app copy', () => {
  assert.equal(translateText('JSON 格式无效：Unexpected token', 'en'), 'Invalid JSON: Unexpected token')
  assert.equal(translateText('检查更新失败：HTTP 403', 'en'), 'Update check failed: HTTP 403')
  assert.equal(translateText('配置文件读取失败：RPC denied', 'en'), 'Failed to read configuration file: RPC denied')
  assert.equal(translateText('AA:BB:CC:DD:EE:FF', 'en'), 'AA:BB:CC:DD:EE:FF')
  assert.equal(translateText('/usr/share/wechatpush/api/diy.json', 'en'), '/usr/share/wechatpush/api/diy.json')
})

