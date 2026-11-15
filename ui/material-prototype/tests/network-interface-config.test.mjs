import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NETWORK_APPLY_TIMEOUT, buildInterfaceChanges, confirmInterfaceChanges,
  formFromConfig, ipv4Valid, ipv6Valid, validNetmask, isCriticalInterface,
  setInterfaceRuntime, stageAndApplyInterface, stagedChangesPresent
} from '../src/services/networkInterfaceConfig.js'

const network = {
  values: {
    lan: {
      '.type': 'interface', '.name': 'lan',
      proto: 'static', auto: '1', device: 'br-lan',
      ipaddr: '192.168.100.1', netmask: '255.255.255.0',
      ip6assign: '64', dns: ['223.5.5.5']
    },
    wan: {
      '.type': 'interface', '.name': 'wan', proto: 'dhcp', device: 'eth0',
      peerdns: '1', defaultroute: '1'
    },
    dial: {
      '.type': 'interface', '.name': 'dial', proto: 'pppoe', device: 'eth1',
      username: 'my-isp', password: 'secret', ipv6: 'auto'
    },
    wg: { '.type': 'interface', proto: 'wireguard', private_key: 'protected' }
  }
}
const dhcp = { values: {
  lan: {
    '.name': 'lan', '.type': 'dhcp', interface: 'lan',
    ignore: '0', start: '100', limit: '150',
    leasetime: '12h', dhcpv6: 'server', ra: 'server'
  }
}}
const edit = name => formFromConfig(name, network, dhcp)

test('validate IPv4, IPv6 and contiguous netmasks', () => {
  assert.equal(ipv4Valid('192.168.100.1'), true)
  assert.equal(ipv4Valid('192.168.100.999'), false)
  assert.equal(ipv4Valid('192.168.001.1'), false)
  assert.equal(ipv6Valid('2408:8000::1'), true)
  assert.equal(ipv6Valid('2001:::1'), false)
  assert.equal(validNetmask('255.255.255.0'), true)
  assert.equal(validNetmask('255.0.255.0'), false)
  assert.equal(validNetmask('24'), true)
})
test('load static LAN plus distinct DHCP server configuration', () => {
  const form = edit('lan')
  assert.equal(form.proto, 'static')
  assert.equal(form.ipaddr, '192.168.100.1')
  assert.equal(form.dhcpEnabled, true)
  assert.equal(form.dhcpStart, '100')
  assert.equal(form.raMode, 'server')
  assert.equal(form.device, 'br-lan')
  assert.equal(edit('dial').pppoePassword, '')
  assert.equal(edit('dial').pppoePasswordSaved, true)
  assert.equal(edit('wg').editable, false)
  assert.equal(formFromConfig('wan_6', network, dhcp), null)
})
test('unchanged LAN config creates no actions', () => {
  assert.deepEqual(buildInterfaceChanges('lan', network, dhcp, edit('lan')), [])
})
test('static IPv4, DNS, IPv6 and DHCP range edits preserve device and unrelated config', () => {
  const form = edit('lan')
  form.ipaddr = '192.168.100.2'
  form.dns = '1.1.1.1\n2606:4700:4700::1111'
  form.ip6assign = '60'
  form.dhcpStart = '50'
  form.dhcpLimit = '150'
  const changes = buildInterfaceChanges('lan', network, dhcp, form)
  assert.equal(changes.length, 2)
  assert.equal(changes[0].config, 'network')
  assert.equal(changes[0].values.ipaddr, '192.168.100.2')
  assert.deepEqual(changes[0].values.dns, ['1.1.1.1', '2606:4700:4700::1111'])
  assert.equal(changes[0].values.device, undefined)
  assert.equal(changes[0].values.ip6assign, '60')
  assert.equal(changes[1].config, 'dhcp')
  assert.equal(changes[1].values.start, '50')
  assert.equal(changes[1].values.limit, undefined)
})
test('switching LAN static to DHCP client disables its DHCP server and clears static IP', () => {
  const form = edit('lan')
  form.proto = 'dhcp'
  const changes = buildInterfaceChanges('lan', network, dhcp, form)
  assert.equal(changes.length, 2)
  assert.deepEqual(changes[0].deletes, ['ipaddr', 'netmask'])
  assert.equal(changes[0].values.proto, 'dhcp')
  assert.deepEqual(changes[1].values, { ignore: '1' })
})
test('WAN DHCP client and PPPoE password are distinct from DHCP server', () => {
  const wan = edit('wan')
  wan.dns = '1.1.1.1'
  wan.peerdns = false
  const changes = buildInterfaceChanges('wan', network, dhcp, wan)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].config, 'network')
  assert.deepEqual(changes[0].values.dns, ['1.1.1.1'])
  assert.equal(changes[0].values.peerdns, '0')
  const dial = edit('dial')
  dial.pppoeUsername = 'new-isp'
  const update = buildInterfaceChanges('dial', network, dhcp, dial)
  assert.equal(update[0].values.username, 'new-isp')
  assert.equal(update[0].values.password, undefined)
})
test('new DHCP server section is only created with explicit server enablement', () => {
  const lanOnly = { values: { guest: {
    '.type': 'interface', proto: 'static', ipaddr: '10.10.0.1',
    netmask: '255.255.255.0'
  }}}
  const form = formFromConfig('guest', lanOnly, dhcp)
  assert.equal(form.dhcpEnabled, false)
  assert.deepEqual(buildInterfaceChanges('guest', lanOnly, dhcp, form), [{ config: 'network', section: 'guest', values: { auto: '1' }, deletes: [] }])
  form.dhcpEnabled = true
  const changes = buildInterfaceChanges('guest', lanOnly, dhcp, form)
  assert.equal(changes.length, 2)
  assert.equal(changes[1].create, true)
  assert.equal(changes[1].section, 'guest')
  assert.equal(changes[1].values.interface, 'guest')
})
test('validate DHCP subnet ranges, static IP, DNS and protocol options', () => {
  const form = edit('lan')
  form.dhcpStart = '200'
  form.dhcpLimit = '100'
  assert.throws(() => buildInterfaceChanges('lan', network, dhcp, form), /地址池/)
  form.dhcpStart = '100'
  form.dhcpLimit = '150'
  form.netmask = '255.0.255.0'
  assert.throws(() => buildInterfaceChanges('lan', network, dhcp, form), /子网掩码/)
  form.netmask = '255.255.255.0'
  form.dns = 'bad-dns-server'
  assert.throws(() => buildInterfaceChanges('lan', network, dhcp, form), /DNS/)
  form.dns = ''
  form.ipaddr = 'bad'
  assert.throws(() => buildInterfaceChanges('lan', network, dhcp, form), /静态 IPv4/)
  assert.throws(() => buildInterfaceChanges('wg', network, dhcp, {
    ...form, name: 'wg'
  }), /特殊协议/)
})
test('rpcd staged changes are not mixed with a new apply', () => {
  assert.equal(stagedChangesPresent({ changes: [] }), false)
  assert.equal(stagedChangesPresent({ changes: [['set','network']] }), true)
  const actions = []
  const client = { call: async (obj, method, data) => {
    actions.push({ obj, method, data })
    return method === 'changes' ? { changes: { lan: [['set', 'proto']] } } : {}
  }}
  return assert.rejects(
    () => stageAndApplyInterface(client, [{ config: 'network', section: 'wan',
      values: { proto: 'static' }, deletes: [] }]), /尚未应用/)
    .then(() => {
      assert.deepEqual(actions.map(a => a.method), ['changes'])
    })
})
test('apply uses mandatory 90-second rollback and never blind-commits', async () => {
  const events = []
  const client = { call: async (obj, method, data) => {
    events.push({ obj, method, data })
    if (method === 'changes') return { changes: [] }
    return {}
  }}
  await stageAndApplyInterface(client, [
    { config: 'network', section: 'wan', values: { proto: 'dhcp' }, deletes: ['gateway'] },
    { config: 'dhcp', section: 'lan', values: { ignore: '1' }, deletes: [] }
  ])
  assert.deepEqual(events.map(e => e.method),
    ['changes', 'changes', 'set', 'delete', 'set', 'apply'])
  assert.deepEqual(events.at(-1).data, { rollback: true, timeout: NETWORK_APPLY_TIMEOUT })
  assert.equal(events.some(e => e.method === 'commit'), false)
  await confirmInterfaceChanges(client)
  assert.equal(events.at(-1).method, 'confirm')
})
test('stage failure reverts staged values and never applies', async () => {
  const events = []
  const client = { call: async (obj, method, data) => {
    events.push(method)
    if (method === 'changes') return { changes: [] }
    if (method === 'set') throw Error('denied')
    return {}
  }}
  await assert.rejects(() => stageAndApplyInterface(client, [
    { config: 'network', section: 'wan', values: { proto: 'dhcp' }, deletes: [] }
  ]), /denied/)
  assert.deepEqual(events, ['changes', 'set', 'revert'])
})
test('critical LAN/WAN immediate shutdown blocked; netifd up/down other interfaces', async () => {
  const calls = []
  const client = { call: async (obj, method) => { calls.push({ obj, method }); return {} } }
  assert.equal(isCriticalInterface('lan'), true)
  assert.equal(isCriticalInterface('wan6'), true)
  await assert.rejects(() => setInterfaceRuntime(client, 'lan', 'down'), /禁止即时断开/)
  await setInterfaceRuntime(client, 'guest', 'down')
  await setInterfaceRuntime(client, 'guest', 'up')
  assert.deepEqual(calls, [
    { obj: 'network.interface.guest', method: 'down' },
    { obj: 'network.interface.guest', method: 'up' }
  ])
})
