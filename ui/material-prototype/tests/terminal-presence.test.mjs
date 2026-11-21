import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileTerminalClientData, resolveTerminalPresence, terminalDiscoveryEntries, resolveTerminalRosterPresence } from '../src/services/terminalPresence.js'
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

test('valid router-side WeChatPush file wins over false stopped reports; missing or invalid files do not', () => {
  const snapshot = { data: JSON.stringify({ devices:[online] }) }
  const reportedStopped = parseWechatClientPresence(snapshot, {wechatpush:{running:false}}, {
    wechatpush: { instances: { main: { running: false } } }
  }, null)
  assert.equal(reportedStopped.available, true)
  assert.equal(reportedStopped.devices[0].status, 'online')
  const missing = parseWechatClientPresence(null, {wechatpush:{running:false}}, null, null)
  assert.equal(missing.available, false)
  assert.match(missing.reason, /无法读取/)
  const invalid = parseWechatClientPresence({data:'{'}, {}, null, null)
  assert.equal(invalid.available, false)
  assert.match(invalid.reason, /数据格式无效/)
})

test('without WeChatPush other live association evidence remains usable', () => {
  assert.deepEqual(resolveTerminalPresence({
    wechatInstalled: false, monitored: null, fallbackOnline: true, fallbackKnown: true
  }), { online: true, onlineKnown: true, monitorStatus: '' })
})


test('terminal roster contains only QWRT discovery union WeChatPush online, no offline or Xiaomi-only entries', () => {
  const items = terminalDiscoveryEntries({
    dhcp4: [{ mac: 'AA:00:00:00:00:01', online: false }],
    dhcp6: [{ mac: 'AA:00:00:00:00:01', online: false }],
    wireless: [{ mac: 'AA:00:00:00:00:02', online: true }],
    wechatRecords: [
      { mac: 'AA:00:00:00:00:02', status: 'online' },
      { mac: 'AA:00:00:00:00:03', status: 'online' },
      { mac: 'AA:00:00:00:00:04', status: 'offline' },
      { mac: 'AA:00:00:00:00:05', status: 'unknown' }
    ]
  })
  assert.deepEqual(items.map(x => x.source),
    ['dhcp4', 'dhcp6', 'wireless', 'wechatpush', 'wechatpush'])
  const roster = new Set(items.map(x => x.item.mac))
  assert.deepEqual([...roster], [
    'AA:00:00:00:00:01', 'AA:00:00:00:00:02', 'AA:00:00:00:00:03'
  ])
  assert.equal(roster.has('AA:00:00:00:00:04'), false)
  assert.equal(roster.has('AA:00:00:00:00:05'), false)
})

test('WeChatPush online always wins, even when Xiaomi explicitly offline', () => {
  assert.deepEqual(resolveTerminalRosterPresence({
    monitored: { status: 'online' },
    xiaomiReportedOffline: true, qwrtOnline: false, qwrtOnlineKnown: true
  }), { online: true, onlineKnown: true, monitorStatus: 'online' })
})

test('not WeChatPush-online plus explicit Xiaomi current offline means offline', () => {
  for (const monitored of [null, { status: 'offline' }, { status: 'unknown' }]) {
    const result = resolveTerminalRosterPresence({
      monitored, xiaomiReportedOffline: true,
      qwrtOnline: true, qwrtOnlineKnown: true
    })
    assert.equal(result.online, false)
    assert.equal(result.onlineKnown, true)
  }
})

test('all other cases follow independent QWRT neighbour/Wi-Fi state', () => {
  for (const monitored of [null, { status: 'offline' }, { status: 'unknown' }]) {
    const isUp = resolveTerminalRosterPresence({
      monitored, xiaomiReportedOffline: false,
      qwrtOnline: true, qwrtOnlineKnown: true
    })
    assert.equal(isUp.online, true)
    assert.equal(isUp.onlineKnown, true)
    const isDown = resolveTerminalRosterPresence({
      monitored, xiaomiReportedOffline: false,
      qwrtOnline: false, qwrtOnlineKnown: true
    })
    assert.equal(isDown.online, false)
    assert.equal(isDown.onlineKnown, true)
    const unknown = resolveTerminalRosterPresence({
      monitored, xiaomiReportedOffline: false,
      qwrtOnline: false, qwrtOnlineKnown: false
    })
    assert.deepEqual({ online: unknown.online, onlineKnown: unknown.onlineKnown },
      { online: false, onlineKnown: false })
  }
})
