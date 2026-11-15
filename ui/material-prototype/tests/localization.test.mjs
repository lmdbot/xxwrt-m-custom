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
