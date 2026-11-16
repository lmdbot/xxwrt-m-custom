import test from 'node:test'
import assert from 'node:assert/strict'
import {
  diagnosticCommands, validateDiagnosticTarget, normalizeLogResponse, filterLogLines,
  createConfigSnapshot, validateConfigSnapshot, previewConfigRestore,
  stageConfigRestore, confirmConfigRestore, rollbackConfigRestore,
  normalizeDhcpEntries, validateDnsRecord, validateServiceAction,
  changeRouterService, CRITICAL_SERVICES
} from '../src/services/routerOperations.js'

test('diagnostics use fixed executables and bounded parameter arrays', () => {
  assert.deepEqual(diagnosticCommands('ping', '223.5.5.5')[0], {
    command: '/bin/ping', params: ['-c', '4', '-W', '2', '223.5.5.5']
  })
  assert.equal(diagnosticCommands('ping', '2001:db8::1')[0].command, '/bin/ping6')
  assert.equal(diagnosticCommands('dns', 'example.org', '1.1.1.1')[0].params[1], '1.1.1.1')
  for (const bad of ['-n', ';rm -rf /', 'foo.com && whoami', 'a/b', 'example..org', '']) {
    assert.throws(() => validateDiagnosticTarget(bad))
  }
  assert.throws(() => diagnosticCommands('http', 'example.org'))
})
test('log formats and searches are normalized without making up records', () => {
  assert.equal(normalizeLogResponse({ log: [{ time: 12, msg: 'dnsmasq started' }] }), '12 dnsmasq started')
  assert.deepEqual(filterLogLines('a\nerror 1\nerror 2', 'error'), ['error 1', 'error 2'])
})
test('backup validates schema, excludes foreign config names and previews only existing sections', async () => {
  const configs = {
    dhcp: { values: { lan: { '.type': 'dhcp', interface: 'lan', start: '100' } } },
    firewall: { values: { lan: { '.type': 'zone', name: 'lan', input: 'ACCEPT' } } }
  }
  const mock = {
    call: async (object, method, args) => {
      assert.equal(object, 'uci')
      assert.equal(method, 'get')
      return configs[args.config]
    }
  }
  const snap = await createConfigSnapshot(mock, ['dhcp', 'firewall'])
  assert.equal(snap.configs.dhcp.lan.options.start, '100')
  assert.equal(validateConfigSnapshot(JSON.stringify(snap)).schema, 1)
  const newer = JSON.parse(JSON.stringify(snap))
  newer.configs.dhcp.lan.options.start = '110'
  newer.configs.dhcp.missing = { type: 'host', options: { ip: '192.168.1.99' } }
  const plan = await previewConfigRestore(mock, newer)
  assert.equal(plan.count, 1)
  assert.equal(plan.skipped.length, 1)
  assert.deepEqual(plan.changes[0].values, { start: '110' })
  assert.throws(() => validateConfigSnapshot(JSON.stringify({
    format: 'xxwrt-uci-snapshot', schema: 1, configs: { secrets: {} }
  })))
})
test('restore checks pending changes, applies with rollback and asks for explicit confirm', async () => {
  const actions = []
  const client = { call: async (object, method, args) => {
    actions.push({ object, method, args })
    return method === 'changes' ? { changes: {} } : {}
  } }
  const plan = { changes: [
    { config: 'dhcp', section: 'lan', values: { start: '110' } }
  ] }
  await stageConfigRestore(client, plan)
  assert.equal(actions.at(-1).method, 'apply')
  assert.deepEqual(actions.at(-1).args, { rollback: true, timeout: 90 })
  await confirmConfigRestore(client)
  assert.equal(actions.at(-1).method, 'confirm')
  await rollbackConfigRestore(client)
  assert.equal(actions.at(-1).method, 'rollback')
  await assert.rejects(stageConfigRestore({
    call: async (obj, method) => method === 'changes' ? { changes: { dhcp: ['X'] } } : {}
  }, plan), /未保存/)
})
test('DNS static records validate name, IP and reject lease collisions', () => {
  const known = normalizeDhcpEntries({ values: {
    a: { '.type': 'domain', name: 'nas.lan', ip: '192.168.1.2' },
    b: { '.type': 'host', name: 'nas', ip: '192.168.1.2', mac: 'AA:BB:CC:DD:EE:FF' }
  } })
  assert.equal(known.dns.length, 1)
  assert.deepEqual(validateDnsRecord('dns', { name: 'router.lan', ip: '::1' }, known),
    { name: 'router.lan', ip: '::1' })
  assert.throws(() => validateDnsRecord('dns', { name: 'nas.lan', ip: '1.1.1.1' }, known), /已有/)
  assert.throws(() => validateDnsRecord('lease', {
    name: 'another', ip: '192.168.1.2', mac: '00:11:22:33:44:55'
  }, known), /已存在/)
})
test('critical services cannot be disabled/restarted/stopped and no arbitrary name is allowed', async () => {
  const services = [{ name: 'dnsmasq' }, { name: 'lucky' }]
  assert.ok(CRITICAL_SERVICES.includes('dnsmasq'))
  assert.throws(() => validateServiceAction('dnsmasq', 'stop', services))
  assert.throws(() => validateServiceAction('dnsmasq', 'disable', services))
  assert.throws(() => validateServiceAction('lucky;exit', 'restart', services))
  const actions = []
  const updated = await changeRouterService({ call: async (object, method, args) => {
    actions.push([object, method, args])
    if (method === 'list') return { lucky: { enabled: 1, running: 1 } }
    return {}
  } }, 'lucky', 'restart', services)
  assert.deepEqual(actions[0], ['rc', 'init', { name: 'lucky', action: 'restart' }])
  assert.equal(updated[0].running, true)
})
