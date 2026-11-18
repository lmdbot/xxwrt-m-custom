import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WECHAT_DEVICE_ALIASES_PATH, resolveWechatConnection, parseWechatClientPresence,
  matchedWechatClient, resolveWechatClientName, preferredWechatOnlineStatus
} from '../src/services/wechatClientPresence.js'

const active = { wechatpush: { instances: { primary: { running: true } } } }
const aliasFile = { data: [
  '# WeChatPush custom names',
  'AA:BB:CC:DD:EE:FF 家里的电脑',
  '192.168.100.23 客厅电视',
  'a6:83:e7:2c:91:0f 孩子的手机'
].join('\n') + '\n' }
const snapshot = { data: JSON.stringify({
  wlan: [{ interface: 'wlan0', band: '2.4G' }, { interface: 'wlan1', band: '5G' }],
  devices: [
    { mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.100.21', name: 'DHCP-MacBook', status: 'online', interface: 'LAN' },
    { mac: '10:20:30:40:50:60', ip: '192.168.100.23', name: 'Generic TV', status: 'online', interface: '' },
    { mac: 'A6:83:E7:2C:91:0F', ip: '192.168.100.25', name: 'unknown', status: 'online', interface: 'wlan1' },
    { mac: '02:11:22:33:44:55', ip: '192.168.100.30', name: 'Family tablet', status: 'offline', type: '2.4G' }
  ]
}) }

test('reads configured aliases by stable MAC first and IPv4 as fallback', () => {
  assert.equal(WECHAT_DEVICE_ALIASES_PATH, '/usr/share/wechatpush/api/device_aliases.list')
  const p = parseWechatClientPresence(snapshot, { wechatpush: { enabled: true } }, active, aliasFile)
  assert.equal(p.installed, true)
  assert.equal(p.running, true)
  assert.equal(p.available, true)
  assert.equal(p.devices.length, 4)
  assert.equal(resolveWechatClientName(p, 'aa:bb:cc:dd:ee:ff', '192.168.100.21', 'DHCP-MacBook'), '家里的电脑')
  assert.equal(resolveWechatClientName(p, '10:20:30:40:50:60', '192.168.100.23', 'Generic TV'), '客厅电视')
  assert.equal(resolveWechatClientName(p, 'ff:ff:ff:ff:ff:ff', '192.168.100.80', 'DHCP-Laptop'), 'DHCP-Laptop')
  assert.equal(resolveWechatClientName(p, 'a6:83:e7:2c:91:0f', '192.168.100.25', 'unknown'), '孩子的手机')
})

test('WechatPush online status is authoritative only when live and explicit', () => {
  const p = parseWechatClientPresence(snapshot, { wechatpush: { enabled: true } }, active, aliasFile)
  const activeDevice = matchedWechatClient(p, 'aa:bb:cc:dd:ee:ff', '192.168.100.21')
  const sleeping = matchedWechatClient(p, '02:11:22:33:44:55', '192.168.100.30')
  assert.equal(preferredWechatOnlineStatus(activeDevice, 'unknown'), 'online')
  assert.equal(preferredWechatOnlineStatus(sleeping, 'online'), 'offline')
  assert.equal(preferredWechatOnlineStatus({ status: 'unknown' }, 'online'), 'online')
  const untracked = parseWechatClientPresence(snapshot, { wechatpush: { enabled: true } },
    { wechatpush: { instances: { primary: { running: false } } } }, aliasFile)
  assert.equal(untracked.installed, true)
  // WeChatPush can update its router-side file without a procd-running instance.
  assert.equal(untracked.available, true)
  assert.equal(untracked.devices.length, 4)
  assert.equal(resolveWechatClientName(untracked, 'aa:bb:cc:dd:ee:ff', '', 'DHCP-MacBook'), '家里的电脑')
  assert.equal(preferredWechatOnlineStatus(matchedWechatClient(untracked, 'aa:bb:cc:dd:ee:ff', ''), 'unknown'), 'online')
})

test('2.4G, 5G and mapped Wi-Fi interfaces are wireless; LAN and empty are wired', () => {
  const cases = [
    [{ type: '2.4G', interface: 'br-lan' }, 'wireless', '2.4G'],
    [{ type: '5G' }, 'wireless', '5G'],
    [{ interface: 'wlan0' }, 'wireless', '2.4G'],
    [{ interface: 'wlan1' }, 'wireless', '5G'],
    [{ interface: 'LAN' }, 'wired', ''],
    [{ interface: '' }, 'wired', ''],
    [{ interface: 'br-lan' }, 'wired', '']
  ]
  const bands = [{ interface: 'wlan0', band: '2.4G' }, { interface: 'wlan1', band: '5G' }]
  for (const [item, type, band] of cases) {
    assert.deepEqual(resolveWechatConnection(item, bands), { type, band })
  }
  const p = parseWechatClientPresence(snapshot, {}, active, aliasFile)
  assert.equal(matchedWechatClient(p, 'A6:83:E7:2C:91:0F', '').connectionType, 'wireless')
  assert.equal(matchedWechatClient(p, '10:20:30:40:50:60', '').connectionType, 'wired')
})

test('reused DHCP IP must not attribute a different MAC device name/status', () => {
  const p = parseWechatClientPresence(snapshot, {}, active, aliasFile)
  assert.equal(matchedWechatClient(p, '11:22:33:44:55:66', '192.168.100.21'), null)
  assert.equal(matchedWechatClient(p, '', '192.168.100.21')?.name, '家里的电脑')
  assert.equal(resolveWechatClientName(p, '11:22:33:44:55:66', '192.168.100.77', 'New device'), 'New device')
})

test('duplicate MAC records prefer online evidence, unreadable files are not offline', () => {
  const duplicate = {
    data: JSON.stringify({ devices: [
      { mac: '11:22:33:44:55:66', ip: '192.168.100.9', status: 'offline', name: 'Old' },
      { mac: '11:22:33:44:55:66', ip: '192.168.100.10', status: 'online', name: 'Current' }
    ] })
  }
  const live = parseWechatClientPresence(duplicate, {}, active, null)
  assert.equal(live.devices.length, 1)
  assert.equal(live.devices[0].name, 'Current')
  assert.equal(live.devices[0].ip, '192.168.100.10')
  const missing = parseWechatClientPresence({ data: '{bad' }, {}, active, null)
  assert.equal(missing.available, false)
  assert.equal(missing.devices.length, 0)
  const nonexistent = parseWechatClientPresence(null, {}, null, null)
  assert.equal(nonexistent.installed, false)
})

test('raw MAC names, oversized aliases and unparseable statuses never fabricate names or online', () => {
  const invalid = parseWechatClientPresence({ data: JSON.stringify({ devices: [
    { mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.100.21', name: 'aa:bb:cc:dd:ee:ff', status: '' }
  ] }) }, {}, active, { data: 'x'.repeat(70000) })
  assert.equal(invalid.devices[0].name, '')
  assert.equal(invalid.devices[0].status, 'unknown')
  assert.equal(invalid.aliases.size, 0)
})
