import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ipv4Number, readTerminalSettings, saveTerminalStaticIP, saveTerminalRateLimit
} from '../src/services/terminalManagement.js'

const MAC = 'AA:BB:CC:DD:EE:FF'
const device = { mac: MAC, ip: '192.168.100.88', name: 'Phone', displayName: 'Phone' }
const lan = { interface: [{ interface: 'lan',
  'ipv4-address': [{ address: '192.168.100.1', mask: 24 }] }] }
const lease = { dhcp_leases: [{ macaddr: MAC, ipaddr: device.ip },
  { macaddr: '02:12:34:56:78:90', ipaddr: '192.168.100.60' }] }

function mockRouter({ dhcp = {}, eqos = null, limiter = null, nftQos = null, hqos = null,
  runtime = {}, applyCode = 0 } = {}) {
  const configs = {
    dhcp: structuredClone(dhcp), eqos: structuredClone(eqos),
    'nft-limiter': structuredClone(limiter), 'nft-qos': structuredClone(nftQos),
    hqos: structuredClone(hqos)
  }
  const calls = []
  let counter = 0
  const rpc = async (object, method, args = {}) => {
    calls.push({ object, method, args: structuredClone(args) })
    if (object === 'uci') {
      if (method === 'get') {
        return configs[args.config] == null ? null : { values: structuredClone(configs[args.config]) }
      }
      if (method === 'add') {
        const section = 'new_' + ++counter
        configs[args.config][section] = { '.type': args.type, ...args.values }
        return { section }
      }
      if (method === 'set') {
        Object.assign(configs[args.config][args.section], args.values)
        return {}
      }
      if (method === 'delete') {
        if (args.option) delete configs[args.config][args.section][args.option]
        else delete configs[args.config][args.section]
        return {}
      }
      return {}
    }
    if (object === 'network.interface' && method === 'dump') return lan
    if (object === 'luci-rpc' && method === 'getDHCPLeases') return lease
    if (object === 'rc' && method === 'list') return runtime
    if (object === 'file' && method === 'exec') return applyCode == null ? null : { code: applyCode }
    return null
  }
  return {
    calls, configs,
    call: rpc,
    batch: async entries => Promise.all(entries.map(([object, method, args]) => rpc(object, method, args)))
  }
}

test('strict IPv4 parser and DHCP reservation conflict checks', async () => {
  assert.equal(ipv4Number('192.168.100.88'), 3232261208)
  for (const ip of ['256.0.0.1', '192.168.01.1', '192.168.1', '0xC0.168.1.1', '']) {
    assert.equal(ipv4Number(ip), null)
  }
  const api = mockRouter()
  const settings = await readTerminalSettings(api, device)
  await assert.rejects(saveTerminalStaticIP(api, device, settings,
    { enabled: true, ip: '192.168.100.60', name: 'Phone' }), /占用/)
  await assert.rejects(saveTerminalStaticIP(api, device, settings,
    { enabled: true, ip: '192.168.101.50', name: 'Phone' }), /局域网网段/)
  await assert.rejects(saveTerminalStaticIP(api, device, settings,
    { enabled: true, ip: '192.168.100.1', name: 'Phone' }), /网关/)
  assert.equal(api.calls.filter(x => x.object === 'uci' && ['add','set','delete'].includes(x.method)).length, 0)
})

test('static DHCP add, read and remove persists and reloads only dnsmasq', async () => {
  const api = mockRouter()
  let settings = await readTerminalSettings(api, device)
  assert.equal(settings.staticEnabled, false)
  const output = await saveTerminalStaticIP(api, device, settings,
    { enabled: true, ip: '192.168.100.50', name: 'Phone' })
  assert.equal(output.applied, true)
  settings = await readTerminalSettings(api, device)
  assert.equal(settings.staticEnabled, true)
  assert.equal(settings.staticIP, '192.168.100.50')
  assert.equal(settings.host.mac, MAC)
  await saveTerminalStaticIP(api, device, settings, { enabled: false })
  settings = await readTerminalSettings(api, device)
  assert.equal(settings.staticEnabled, false)
  const execs = api.calls.filter(x => x.object === 'file' && x.method === 'exec')
  assert.deepEqual(execs.map(x => x.args.command), ['/etc/init.d/dnsmasq','/etc/init.d/dnsmasq'])
  assert(execs.every(x => x.args.params.join(' ') === 'reload'))
})

test('existing multi-MAC host is never overwritten', async () => {
  const api = mockRouter({ dhcp: {
    shared: { '.type': 'host', mac: [MAC, '00:11:22:33:44:55'], ip: '192.168.100.88' }
  } })
  const settings = await readTerminalSettings(api, device)
  await assert.rejects(saveTerminalStaticIP(api, device, settings,
    { enabled: true, ip: '192.168.100.70', name: 'Phone' }), /多个 MAC/)
  assert.equal(api.configs.dhcp.shared.ip, '192.168.100.88')
})

test('EQOS accepts two positive speed limits or clears the target rule', async () => {
  const api = mockRouter({ eqos: { global: { '.type': 'eqos', enabled: '1' } } })
  let settings = await readTerminalSettings(api, device)
  assert.equal(settings.backend, 'eqos')
  await assert.rejects(saveTerminalRateLimit(api, device, settings,
    { download: '10', upload: '' }), /同时填写/)
  await saveTerminalRateLimit(api, device, settings, { download: '10', upload: '5' })
  settings = await readTerminalSettings(api, device)
  assert.deepEqual(settings.rates, { download: 10, upload: 5 })
  await saveTerminalRateLimit(api, device, settings, { download: '', upload: '' })
  settings = await readTerminalSettings(api, device)
  assert.deepEqual(settings.rates, { download: null, upload: null })
})

test('NFT limiter must be running, and advanced quota rules are protected', async () => {
  const limiter = {
    global: { '.type': 'nft-limiter', iface: 'wan' },
    device: { '.type': 'device', target: device.ip, mac: MAC,
      download: '20', upload: '5', quota: '3' }
  }
  const stopped = mockRouter({ limiter })
  assert.equal((await readTerminalSettings(stopped, device)).backend, '')
  const running = mockRouter({ limiter,
    runtime: { 'nft-limiter': { running: true, enabled: true } } })
  const settings = await readTerminalSettings(running, device)
  assert.equal(settings.backend, 'nft-limiter')
  await assert.rejects(saveTerminalRateLimit(running, device, settings,
    { download: '10', upload: '3' }), /高级规则/)
  assert.equal(running.configs['nft-limiter'].device.quota, '3')
})

test('nft-qos uses kbytes per second for exact whole Mbps settings', async () => {
  const api = mockRouter({ nftQos: {
    default: { '.type': 'default', limit_enable: '1', limit_type: 'static' }
  } })
  let settings = await readTerminalSettings(api, device)
  assert.equal(settings.backend, 'nft-qos')
  await saveTerminalRateLimit(api, device, settings, { download: '8', upload: '2' })
  const rows = Object.values(api.configs['nft-qos'])
  assert.equal(rows.find(x => x['.type'] === 'download').rate, '1000')
  assert.equal(rows.find(x => x['.type'] === 'upload').rate, '250')
  settings = await readTerminalSettings(api, device)
  assert.deepEqual(settings.rates, { download: 8, upload: 2 })
})

test('a failed service reload does not falsely claim settings were applied', async () => {
  const api = mockRouter({ applyCode: null })
  const settings = await readTerminalSettings(api, device)
  const outcome = await saveTerminalStaticIP(api, device, settings,
    { enabled: true, ip: '192.168.100.50', name: 'Phone' })
  assert.equal(outcome.applied, false)
  assert.match(outcome.message, /无法确认/)
  assert.equal(Object.keys(api.configs.dhcp).length, 1)
})

test('QWRT HQoS is identified as installed but disabled without modifying UCI', async () => {
  const api = mockRouter({ hqos: { global: {
    '.type': 'hqos', enabled: '0', backend: 'auto', interface: 'br-lan'
  } } })
  const settings = await readTerminalSettings(api, device)
  assert.equal(settings.backend, '')
  assert.deepEqual(settings.hqosStatus, {
    installed: true, enabled: false, mode: 'auto', interface: 'br-lan'
  })
  assert.match(settings.reason, /HQoS.*禁用/)
  assert.equal(api.calls.filter(x => x.object === 'uci' && ['add', 'set', 'delete', 'commit'].includes(x.method)).length, 0)
})
test('enabled HQoS never enters unsupported IP-based writer', async () => {
  const api = mockRouter({ hqos: { global: {
    '.type': 'hqos', enabled: '1', backend: 'cpu', interface: 'br-lan'
  } } })
  const settings = await readTerminalSettings(api, device)
  assert.equal(settings.backend, '')
  assert.equal(settings.hqosStatus.enabled, true)
  assert.match(settings.reason, /MAC 规则/)
  await assert.rejects(
    saveTerminalRateLimit(api, device, settings, { upload: '1000', download: '2000' }),
    /HQoS/
  )
})
test('enabled EQOS remains usable when disabled HQoS is also installed', async () => {
  const api = mockRouter({
    eqos: { global: { '.type': 'eqos', enabled: '1' } },
    hqos: { global: { '.type': 'hqos', enabled: '0', backend: 'auto', interface: 'br-lan' } }
  })
  const settings = await readTerminalSettings(api, device)
  assert.equal(settings.backend, 'eqos')
  assert.equal(settings.hqosStatus.installed, true)
})
