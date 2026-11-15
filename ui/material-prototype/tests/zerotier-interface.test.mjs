import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isZeroTierInterfaceName, splitZeroTierAddresses,
  buildZeroTierInterface, formatZeroTierBytes
} from '../src/services/zeroTierInterfaces.js'

test('validates actual ZeroTier interface names before any RPC path construction', () => {
  assert.equal(isZeroTierInterfaceName('ztsjsdnpbo'), true)
  assert.equal(isZeroTierInterfaceName('zt0'), true)
  assert.equal(isZeroTierInterfaceName('eth0'), false)
  assert.equal(isZeroTierInterfaceName('zt0/../../etc/passwd'), false)
  assert.equal(isZeroTierInterfaceName('zt0;cat /etc/passwd'), false)
  assert.equal(isZeroTierInterfaceName('zt12345678901234'), false)
})

test('merges separate IPv4, IPv6 and runtime addresses with no duplicates', () => {
  assert.deepEqual(splitZeroTierAddresses(
    [{ address: '10.158.198.236', mask: 24 }],
    [{ address: 'fe80::b48e:88ff:fe62:c0c0', netmask: 'ffff:ffff:ffff:ffff::' }],
    [{ family: 'inet6', local: 'fe80::b48e:88ff:fe62:c0c0', prefixlen: 64 },
      { family: 'link', address: 'b6:8e:88:62:c0:c0' }],
    '10.158.198.236/24'
  ), { ipv4: ['10.158.198.236'], ipv6: ['fe80::b48e:88ff:fe62:c0c0'] })
})

test('extracts real LuCI/netifd interface fields and counters, preserving zero', () => {
  const device = buildZeroTierInterface('ztsjsdnpbo', [
    { up: true, mtu: 2800, macaddr: 'B6:8E:88:62:C0:C0',
      statistics: { rx_bytes: 755610, tx_bytes: 5347738 } },
    { ipaddrs: [{ address: '10.158.198.236' }],
      ip6addrs: [{ address: 'fe80::b48e:88ff:fe62:c0c0' }] }
  ])
  assert.equal(device.name, 'ztsjsdnpbo')
  assert.equal(device.mac, 'B6:8E:88:62:C0:C0')
  assert.equal(device.mtu, 2800)
  assert.equal(device.rxBytes, 755610)
  assert.equal(device.txBytes, 5347738)
  assert.equal(device.up, true)
  assert.deepEqual(device.ipv4, ['10.158.198.236'])
  assert.deepEqual(device.ipv6, ['fe80::b48e:88ff:fe62:c0c0'])
})

test('uses the correct interface stats when netifd and LuCI have different subsets', () => {
  const device = buildZeroTierInterface('zt0', [
    { up: true, statistics: { rx_bytes: 0, tx_bytes: 1024 } },
    { mtu: 2800, stats: { rx_bytes: 999, tx_bytes: 2048 },
      ip6addrs: [{ address: 'fe80::1' }] }
  ], ['10.10.10.2/24'])
  assert.equal(device.rxBytes, 0)
  assert.equal(device.txBytes, 1024)
  assert.equal(device.mtu, 2800)
  assert.deepEqual(device.ipv4, ['10.10.10.2'])
  assert.deepEqual(device.ipv6, ['fe80::1'])
})

test('unknown statistics never become fabricated zeroes', () => {
  const missing = buildZeroTierInterface('zt0', [{}])
  assert.equal(missing.rxBytes, null)
  assert.equal(missing.txBytes, null)
  assert.equal(missing.mtu, null)
  assert.deepEqual(missing.ipv6, [])
  assert.equal(formatZeroTierBytes(null), '未获取')
  assert.equal(formatZeroTierBytes(0), '0 B')
  assert.equal(formatZeroTierBytes(755610), '737.9 KiB')
  assert.equal(formatZeroTierBytes(5347738), '5.1 MiB')
})
