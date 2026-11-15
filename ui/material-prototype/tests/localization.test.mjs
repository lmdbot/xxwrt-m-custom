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
