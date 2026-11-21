import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeXiaomiAddress, xiaomiConnection, parseXiaomiDevices, parseXiaomiLoginPage,
  mergeXiaomiDeviceLists, queryXiaomiDeviceLists, formatTerminalConnectionLabel
} from '../src/services/xiaomiClientData.js'
import { resolveTerminalPresence } from '../src/services/terminalPresence.js'

test('Xiaomi source only accepts private local IPv4 management addresses', () => {
  assert.equal(normalizeXiaomiAddress('192.168.100.2'), 'http://192.168.100.2')
  assert.equal(normalizeXiaomiAddress('https://10.0.0.3:8443'), 'https://10.0.0.3:8443')
  assert.equal(normalizeXiaomiAddress('172.21.1.9'), 'http://172.21.1.9')
  for (const value of ['public.example', '8.8.8.8', '127.0.0.1', 'http://192.168.100.2/a',
    'http://root:pass@192.168.100.2', '172.32.1.1', '192.168.100.2?x=1']) {
    assert.throws(() => normalizeXiaomiAddress(value), /仅允许/)
  }
})

test('MiWiFi attachment type 0, 1, 2, 3 means LAN, 2.4G, 5G, guest', () => {
  assert.deepEqual(xiaomiConnection(0), { connectionType: 'wired', band: '' })
  assert.deepEqual(xiaomiConnection(1), { connectionType: 'wireless', band: '2.4G' })
  assert.deepEqual(xiaomiConnection(2), { connectionType: 'wireless', band: '5G' })
  assert.deepEqual(xiaomiConnection(3), { connectionType: 'wireless', band: '' })
  assert.deepEqual(xiaomiConnection('5G'), { connectionType: 'wireless', band: '5G' })
  assert.deepEqual(xiaomiConnection(undefined), { connectionType: '', band: '' })
})

test('Xiaomi device inventory is MAC-keyed discovery, never proof of online status', () => {
  const devices = parseXiaomiDevices({ code: 0, list: [
    { mac: 'AA:BB:CC:DD:EE:01', name: 'Laptop', type: 1, online: 1,
      ip: [{ ip: '192.168.100.11', active: 1 }] },
    { mac: 'AA:BB:CC:DD:EE:02', oname: 'Printer', type: 0, online: 0,
      ip: [{ ip: '192.168.100.12', active: 0 }] },
    { mac: 'AA:BB:CC:DD:EE:03', name: 'Phone', type: 2, online: 1, ip: [] },
    { mac: 'aa:bb:cc:dd:ee:03', name: 'Old name', online: 0 },
    { mac: 'garbage', name: 'Invalid' }
  ] })
  assert.equal(devices.length, 3)
  assert.deepEqual(devices.map(d => d.connectionType), ['wireless', 'wired', 'wireless'])
  assert.deepEqual(devices.map(d => d.band), ['2.4G', '', '5G'])
  assert.equal(devices[0].ip, '192.168.100.11')
  for (const device of devices) {
    assert.equal(Object.hasOwn(device, 'online'), false)
    assert.equal(Object.hasOwn(device, 'status'), false)
    assert.equal(Object.hasOwn(device, 'onlineKnown'), false)
  }
})

test('invalid Xiaomi responses fail visibly; no stale inventory fallback', () => {
  assert.throws(() => parseXiaomiDevices({ code: 401, list: [] }), /有效设备列表/)
  assert.throws(() => parseXiaomiDevices({ code: 0 }), /有效设备列表/)
  assert.deepEqual(parseXiaomiDevices({ code: 0, list: [] }), [])
})

test('presence remains WeChatPush-led even for Xiaomi-reported clients', () => {
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: true, monitored: { status: 'offline' },
    fallbackOnline: true, fallbackKnown: true
  }), { online: false, onlineKnown: true, monitorStatus: 'offline' })
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: true, monitored: null, fallbackOnline: false, fallbackKnown: false
  }), { online: false, onlineKnown: false, monitorStatus: '' })
})


test('BE5000 / RD18 firmware serves key and deviceId in login HTML, not init_info', () => {
  const page = [
    '<!doctype html><html><script>',
    "var deviceId = 'ac:12:34:56:78:90';",
    "var Encrypt = { key: 'publicChallengeKey123', encrypt: function() {} };",
    '</script></html>'
  ].join('\n')
  assert.deepEqual(parseXiaomiLoginPage(page), {
    key: 'publicChallengeKey123', deviceId: 'ac:12:34:56:78:90'
  })
  assert.deepEqual(parseXiaomiLoginPage(
    '<html><script>var deviceId="AA:BB:CC:DD:EE:FF"; let x={key:"a1b2c3d4"};</script></html>'
  ), { key: 'a1b2c3d4', deviceId: 'aa:bb:cc:dd:ee:ff' })
})

test('Xiaomi login page requires a valid key and MAC before trying a password', () => {
  for (const page of [
    '{"code":0,"newEncryptMode":1}',
    '<html><script>var deviceId = "xx:xx:xx:xx:xx:xx";</script></html>',
    '<html><script>var deviceId = "aa:bb:cc:dd:ee:ff";</script></html>',
    '<html><script>var x = {key:"anyKey"};</script></html>',
    '<html><script>var deviceId="aa:bb:cc:dd:ee:ff";var x={key:"<bad>"};</script></html>'
  ]) assert.throws(() => parseXiaomiLoginPage(page))
})


test('historical Xiaomi list supports dev response variants, line LAN and unnamed client', () => {
  const rows = parseXiaomiDevices({ code: 0, data: { dev: [
    { mac: 'AA:BB:CC:DD:EE:01', origin_name: 'old-router', type: 'line', online: 0 },
    { mac: 'AA:BB:CC:DD:EE:02', name: 'camera', type: 'wifi', online: 1 },
    { mac: 'AA:BB:CC:DD:EE:03', name: 'sensor', type: 1, online: 0 }
  ] } })
  assert.deepEqual(rows.map(r => r.connectionType), ['wired', 'wireless', 'wireless'])
  assert.deepEqual(rows.map(r => r.band), ['', '', '2.4G'])
  assert.equal(rows[0].name, 'old-router')
  assert.equal(xiaomiConnection('line').connectionType, 'wired')
  assert.ok(rows.every(row => !('online' in row)))
})

test('current inventory takes precedence; historical 2.4G/5G/LAN remain visible by MAC', () => {
  const current = parseXiaomiDevices({ code: 0, list: [
    { mac: 'AA:BB:CC:DD:EE:01', name: 'Phone', ip: [{ ip: '192.168.100.12' }], type: 2, online: 1 },
    { mac: 'AA:BB:CC:DD:EE:02', name: 'Camera', type: 1, online: 1 }
  ] })
  const history = parseXiaomiDevices({ code: 0, list: [
    { mac: 'aa:bb:cc:dd:ee:01', name: 'Old phone', type: 1, online: 0 },
    ...Array.from({ length: 10 }, (_, i) => ({
      mac: 'AA:BB:CC:DD:FF:' + String(i).padStart(2, '0'),
      name: 'history-' + i, type: i === 0 ? 0 : i % 2 ? 1 : 2,
      ip: [{ ip: '192.168.100.99', active: 0 }], online: 0
    }))
  ] })
  const merged = mergeXiaomiDeviceLists(current, history)
  assert.equal(merged.length, 12)
  assert.equal(merged.find(r => r.mac === 'AA:BB:CC:DD:EE:01').band, '5G')
  assert.equal(merged.find(r => r.mac === 'AA:BB:CC:DD:EE:01').xiaomiHistoryOnly, false)
  const firstOld = merged.find(r => r.mac === 'AA:BB:CC:DD:FF:00')
  assert.equal(firstOld.connectionType, 'wired')
  assert.equal(firstOld.ip, '') // Historical IP is not a live QWRT IP.
  assert.equal(firstOld.xiaomiHistoryOnly, true)
  assert.equal(merged.find(r => r.mac === 'AA:BB:CC:DD:FF:01').band, '2.4G')
  assert.ok(merged.every(r => !('online' in r) && !('onlineKnown' in r) && !('status' in r)))
})

test('generic current WiFi with historical 5G is marked as a historical band', () => {
  const [row] = mergeXiaomiDeviceLists(
    [{ mac: 'AA:BB:CC:DD:EE:10', name: 'now', connectionType: 'wireless', band: '' }],
    [{ mac: 'AA:BB:CC:DD:EE:10', name: 'old', connectionType: 'wireless', band: '5G' }]
  )
  assert.equal(row.band, '5G')
  assert.equal(row.xiaomiHistoryOnly, true)
  const [wired] = mergeXiaomiDeviceLists(
    [{ mac: 'AA:BB:CC:DD:EE:11', connectionType: 'wired', band: '' }],
    [{ mac: 'AA:BB:CC:DD:EE:11', connectionType: 'wireless', band: '2.4G' }]
  )
  assert.equal(wired.connectionType, 'wired')
  assert.equal(wired.band, '')
  assert.equal(wired.xiaomiHistoryOnly, false)
})

test('both Xiaomi API paths are queried even if current inventory succeeds', async () => {
  const seen = []
  const rows = await queryXiaomiDeviceLists(async path => {
    seen.push(path)
    return path === 'misystem/devicelist'
      ? { code: 0, list: [{ mac: 'AA:BB:CC:DD:EE:01', type: 2 }] }
      : { code: 0, dev: [{ mac: 'AA:BB:CC:DD:EE:02', type: 1 }] }
  })
  assert.deepEqual(seen, ['misystem/devicelist', 'xqsystem/device_list?all=1'])
  assert.equal(rows.length, 2)
  assert.equal(rows.find(r => r.mac.endsWith(':02')).xiaomiHistoryOnly, true)
})

test('single available Xiaomi API yields partial data; both failed rejects', async () => {
  const partial = await queryXiaomiDeviceLists(async path => {
    if (path === 'misystem/devicelist') throw new Error('unsupported')
    return { code: 0, list: [{ mac: 'AA:BB:CC:DD:EE:01', type: 0 }] }
  })
  assert.equal(partial.length, 1)
  assert.equal(partial[0].xiaomiHistoryOnly, true)
  await assert.rejects(
    queryXiaomiDeviceLists(async () => { throw new Error('expired') }),
    /expired/
  )
})

test('current QWRT online status and Xiaomi past attachment never cross streams', () => {
  assert.equal(formatTerminalConnectionLabel({
    connectionType: 'wireless', connectionBand: '2.4G',
    connectionSource: 'xiaomi', online: false, xiaomiHistoryOnly: true
  }), '曾接入 · 2.4G')
  assert.equal(formatTerminalConnectionLabel({
    connectionType: 'wireless', connectionBand: '5G',
    connectionSource: 'xiaomi', online: true, xiaomiHistoryOnly: true
  }), '曾接入 · 5G')
  assert.equal(formatTerminalConnectionLabel({
    connectionType: 'wired', connectionSource: 'xiaomi', online: false
  }), '曾接入 · LAN')
  assert.equal(formatTerminalConnectionLabel({
    connectionType: 'wireless', connectionBand: '',
    connectionSource: 'xiaomi', online: false
  }), '曾接入 · 无线（频段未知）')
  assert.equal(formatTerminalConnectionLabel({
    connectionType: 'wireless', connectionBand: '5G',
    connectionSource: 'xiaomi', online: true, xiaomiHistoryOnly: false
  }), '无线 · 5G')
  assert.equal(formatTerminalConnectionLabel({
    connectionType: 'wireless', connectionBand: '5G',
    connectionSource: 'wechatpush', online: false
  }), '')
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: true, monitored: { status: 'offline' },
    fallbackOnline: true, fallbackKnown: true
  }), { online: false, onlineKnown: true, monitorStatus: 'offline' })
})
