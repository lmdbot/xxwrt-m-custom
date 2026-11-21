import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeXiaomiAddress, xiaomiConnection, parseXiaomiDevices
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
