import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WECHAT_SNAPSHOT_GRACE_MS,
  reconcileTerminalClientData, resolveTerminalPresence
} from '../src/services/terminalPresence.js'

const online = { mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.100.88', name: '客厅电脑', status: 'online' }
const offline = { mac: 'F0:EE:7A:91:AA:12', ip: '192.168.100.90', name: 'MacBook', status: 'offline' }
const successful = {
  data: [{ mac: online.mac, ip: online.ip, name: 'DHCP临时名称', online: false, onlineKnown: true }],
  ipv6: [], hints: {}, leasesAvailable: true, hintsAvailable: true,
  wechatInstalled: true, monitorAvailable: true, monitorStopped: false,
  aliasesAvailable: true, wechatAliases: [[online.mac.toLowerCase(), '客厅电脑']],
  wechatRecords: [online, offline]
}
const failed = {
  data: [], ipv6: [], hints: null, leasesAvailable: false, hintsAvailable: false,
  wechatInstalled: true, monitorAvailable: false, monitorStopped: false,
  aliasesAvailable: false, wechatAliases: [], wechatRecords: []
}
test('WeChatPush presence overrides contradictory DHCP and wireless states', () => {
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: true, monitored: online, fallbackOnline: false, fallbackKnown: true
  }), { online: true, onlineKnown: true, monitorStatus: 'online' })
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: true, monitored: offline, fallbackOnline: true, fallbackKnown: true
  }), { online: false, onlineKnown: true, monitorStatus: 'offline' })
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: true, monitored: null, fallbackOnline: true, fallbackKnown: true
  }), { online: false, onlineKnown: false, monitorStatus: '' })
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: true, monitored: {status:'unknown'}, fallbackOnline: true, fallbackKnown: true
  }), { online: false, onlineKnown: false, monitorStatus: '' })
})
test('routers without WeChatPush still use independent neighbor and wireless signals', () => {
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: false, monitored: null, fallbackOnline: true, fallbackKnown: true
  }), { online: true, onlineKnown: true, monitorStatus: '' })
})
test('temporary monitor and lease read failures keep latest matching names and statuses', () => {
  const first = reconcileTerminalClientData(successful, null, 100000)
  const second = reconcileTerminalClientData(failed, first, 110000)
  assert.equal(second.monitorStale, true)
  assert.equal(second.monitorAvailable, true)
  assert.deepEqual(second.wechatRecords, first.wechatRecords)
  assert.deepEqual(second.wechatAliases, first.wechatAliases)
  assert.deepEqual(second.data, first.data)
  assert.equal(second.monitorReadAt, 100000)
  assert.equal(second.leasesStale, true)
  // Repeated failed polls must not cause stale data to disappear.
  const third = reconcileTerminalClientData(failed, second, 120000)
  assert.deepEqual(third.data, first.data)
  assert.deepEqual(third.wechatRecords, first.wechatRecords)
  assert.equal(third.monitorReadAt, 100000)
})
test('grace time expires and confirmed monitor stop turn old online into unknown', () => {
  const initial = reconcileTerminalClientData(successful, null, 100000)
  const expired = reconcileTerminalClientData(failed, initial, 100000 + WECHAT_SNAPSHOT_GRACE_MS + 1)
  assert.equal(expired.monitorAvailable, false)
  assert.deepEqual(expired.wechatRecords.map(d=>d.status), ['unknown','unknown'])
  const stopped = reconcileTerminalClientData({ ...failed, monitorStopped: true }, initial, 101000)
  assert.equal(stopped.monitorAvailable, false)
  assert.deepEqual(stopped.wechatRecords.map(d=>d.status), ['unknown','unknown'])
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: stopped.wechatInstalled, monitored: stopped.wechatRecords[0],
    fallbackOnline: true, fallbackKnown: true
  }), { online: false, onlineKnown: false, monitorStatus: '' })
})
test('a fresh snapshot replaces fallback; an explicitly empty alias file clears names', () => {
  const first = reconcileTerminalClientData(successful, null, 100000)
  const stale = reconcileTerminalClientData(failed, first, 110000)
  const fresh = reconcileTerminalClientData({
    ...successful, wechatAliases: [], wechatRecords: [{...online,status:'offline'}]
  }, stale, 111000)
  assert.deepEqual(fresh.wechatAliases, [])
  assert.equal(fresh.wechatRecords[0].status, 'offline')
  assert.equal(fresh.monitorReadAt, 111000)
  assert.equal(fresh.monitorStale, false)
})
