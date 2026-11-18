import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileTerminalClientData, resolveTerminalPresence } from '../src/services/terminalPresence.js'
import { parseWechatClientPresence } from '../src/services/wechatClientPresence.js'

const online = { mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.100.88', name: '客厅电脑', status: 'online' }
const offline = { mac: 'F0:EE:7A:91:AA:12', ip: '192.168.100.90', name: 'MacBook', status: 'offline' }
const live = {
  data: [{ mac: online.mac, ip: online.ip, name: 'DHCP旧名', online: false, onlineKnown: true }],
  ipv6: [], hints: {}, leasesAvailable: true,
  wechatInstalled: true, monitorAvailable: true,
  aliasesAvailable: true, wechatAliases: [[online.mac.toLowerCase(), '客厅电脑']],
  wechatRecords: [online, offline]
}
const failed = {
  data: [], ipv6: [], leasesAvailable: false,
  wechatInstalled: true, monitorAvailable: false,
  aliasesAvailable: false, wechatAliases: [], wechatRecords: [],
  monitorReason: 'devices.json 数据格式无效'
}

test('current WeChatPush online/offline wins over contradictory DHCP/Wi-Fi evidence', () => {
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: true, monitored: online, fallbackOnline: false, fallbackKnown: true
  }), { online: true, onlineKnown: true, monitorStatus: 'online' })
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: true, monitored: offline, fallbackOnline: true, fallbackKnown: true
  }), { online: false, onlineKnown: true, monitorStatus: 'offline' })
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: true, monitored: null, fallbackOnline: true, fallbackKnown: true
  }), { online: false, onlineKnown: false, monitorStatus: '' })
})

test('each refresh replaces app snapshots; a failed read never replays prior WeChatPush names or statuses', () => {
  const first = reconcileTerminalClientData(live)
  const second = reconcileTerminalClientData(failed, first)
  assert.deepEqual(second.wechatRecords, [])
  assert.deepEqual(second.wechatAliases, [])
  assert.deepEqual(second.data, [])
  assert.equal(second.monitorAvailable, false)
  assert.equal(second.monitorReason, 'devices.json 数据格式无效')
  // Even a subsequent failure must not resurrect older online records.
  assert.deepEqual(reconcileTerminalClientData(failed, second).wechatRecords, [])
})

test('subsequent successful snapshots replace data with the latest online status and name', () => {
  const previous = reconcileTerminalClientData(live)
  const next = reconcileTerminalClientData({ ...live,
    wechatRecords: [{ ...online, name: '微信推送新备注', status: 'offline' }],
    wechatAliases: [] }, previous)
  assert.equal(next.wechatRecords[0].name, '微信推送新备注')
  assert.equal(next.wechatRecords[0].status, 'offline')
  assert.deepEqual(next.wechatAliases, [])
})

test('installation detection is retained, never an older monitored observation', () => {
  const previous = reconcileTerminalClientData(live)
  const unknown = reconcileTerminalClientData({
    data: [], ipv6: [], wechatInstalled: false, wechatRecords: [],
    wechatAliases: [], monitorAvailable: false
  }, previous)
  assert.equal(unknown.wechatInstalled, true)
  assert.equal(unknown.monitorAvailable, false)
  assert.deepEqual(unknown.wechatRecords, [])
})

test('missing service status RPC does not discard a newly fetched valid WeChatPush file', () => {
  const snapshot = { data: JSON.stringify({ devices:[online] }) }
  const value = parseWechatClientPresence(snapshot, { wechatpush: {enabled: true} }, null, null)
  assert.equal(value.installed, true)
  assert.equal(value.available, true)
  assert.equal(value.devices[0].status, 'online')
})

test('explicitly stopped service and invalid JSON do not provide online observations', () => {
  const snapshot = { data: JSON.stringify({ devices:[online] }) }
  const stopped = parseWechatClientPresence(snapshot, {}, {
    wechatpush: { instances: { main: { running: false } } }
  }, null)
  assert.equal(stopped.available, false)
  assert.equal(stopped.reason, '微信推送服务未运行')
  const invalid = parseWechatClientPresence({data:'{'}, {}, null, null)
  assert.equal(invalid.available, false)
  assert.match(invalid.reason, /数据格式无效/)
})

test('without WeChatPush other live association evidence remains usable', () => {
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: false, monitored: null, fallbackOnline: true, fallbackKnown: true
  }), { online: true, onlineKnown: true, monitorStatus: '' })
})
