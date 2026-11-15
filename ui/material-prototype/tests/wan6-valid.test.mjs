import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDashboard, RouterClient } from '../src/services/router.js'

function dash(network) {
  return parseDashboard([
    { hostname: 'QWRT' }, { memory: {} }, {}, {}, {},
    { interface: network }, {}, {}, {}, {}, {}
  ])
}

test('WAN6 remaining time prefers delegated IPv6 prefix lifetime', () => {
  const result = dash([
    { interface: 'wan', 'ipv4-address': [{ address: '192.0.2.1' }] },
    { interface: 'wan6', 'ipv6-address': [{ address: '2001:db8::1', valid: 4000 }],
      'ipv6-prefix': [{ address: '2001:db8:100::', mask: 60, valid: 2400 }] }
  ])
  assert.equal(result.wan6ValidSeconds, 2400)
})
test('WAN6 falls back to address validity; missing lifetime stays absent', () => {
  assert.equal(dash([{ interface: 'wan6', 'ipv6-address': [{ valid: 3600 }] }]).wan6ValidSeconds, 3600)
  assert.equal(dash([{ interface: 'wan6', 'ipv6-address': [{ address: '2001:db8::1' }] }]).wan6ValidSeconds, null)
  assert.equal(dash([{ interface: 'wan_6', 'ipv6-prefix': [{ valid: 4294967295 }] }]).wan6ValidSeconds, null)
  assert.equal(dash([{ interface: 'wan6', 'ipv6-prefix': [{ valid: 0 }] }]).wan6ValidSeconds, 0)
})
test('certificate exception is opt-in and HTTPS only', () => {
  const normal = new RouterClient('https://10.0.0.1')
  const approved = new RouterClient('https://10.0.0.1', { ignoreTlsErrors: true })
  const http = new RouterClient('http://192.168.100.1', { ignoreTlsErrors: true })
  assert.equal(normal.ignoreTlsErrors, false)
  assert.equal(approved.ignoreTlsErrors, true)
  assert.equal(http.ignoreTlsErrors, false)
})
