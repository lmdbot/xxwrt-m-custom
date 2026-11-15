import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WECHAT_DEVICE_ALIASES_PATH, canonicalAliasTarget, readDeviceAliasEntries,
  validateDeviceAliasText, putDeviceAlias, deleteDeviceAlias, findDeviceAlias
} from '../src/services/wechatDeviceAliases.js'

test('WechatPush native alias path, comments and multiword names are preserved', () => {
  assert.equal(WECHAT_DEVICE_ALIASES_PATH, '/usr/share/wechatpush/api/device_aliases.list')
  const content = '# MAC/IP aliases\nAA:BB:CC:DD:EE:FF My Phone\n192.168.1.2 My PC\n'
  assert.equal(readDeviceAliasEntries(content).length, 2)
  assert.equal(findDeviceAlias(content, 'aa:bb:cc:dd:ee:ff'), 'My Phone')
  assert.equal(findDeviceAlias(content, '192.168.1.2'), 'My PC')
  assert.equal(validateDeviceAliasText(content), content)
})
test('create and edit aliases, preserving unrelated lines', () => {
  const original = '# Comment\r\nAA:BB:CC:DD:EE:FF Old name\r\n'
  const updated = putDeviceAlias(original, 'aa:bb:cc:dd:ee:ff', '小米 手机')
  assert.match(updated, /^# Comment\nAA:BB:CC:DD:EE:FF 小米 手机\n$/)
  const added = putDeviceAlias(updated, '192.168.100.1', '主路由 OpenWrt')
  assert.equal(findDeviceAlias(added, '192.168.100.1'), '主路由 OpenWrt')
  assert.equal(readDeviceAliasEntries(added).length, 2)
  assert.equal(deleteDeviceAlias(added, '192.168.100.1'), updated)
})
test('reject invalid addresses, duplicates, empty values and malformed lines', () => {
  assert.equal(canonicalAliasTarget('ff:cc:aa:00:11:22'), 'FF:CC:AA:00:11:22')
  assert.equal(canonicalAliasTarget('192.168.1.256'), '')
  assert.equal(canonicalAliasTarget('192.168.01.2'), '')
  assert.throws(() => putDeviceAlias('', 'not-an-ip', 'name'), /MAC/)
  assert.throws(() => putDeviceAlias('', '192.168.1.1', '   '), /不能为空/)
  assert.throws(() => putDeviceAlias('', '192.168.1.1', 'bad\ntext'), /换行/)
  assert.throws(() => validateDeviceAliasText('a\n'), /第 1 行/)
  assert.throws(() => validateDeviceAliasText('AA:BB:CC:DD:EE:FF Name\naa:bb:cc:dd:ee:ff Another\n'), /重复/)
})
