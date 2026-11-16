import test from 'node:test'
import assert from 'node:assert/strict'
import {
  V3_TABS, V3_TOOL_GROUPS, V3_FEATURE_HOME, V3_NETWORK_FEATURE_IDS,
  V3_DEVICE_FEATURE_IDS, V3_OVERVIEW_FEATURE_IDS,
  groupV3Tools, networkV3Tools, featureHome
} from '../src/services/featureCatalogV3.js'

test('Material 3.0 has exactly five primary tabs in approved order', () => {
  assert.deepEqual(V3_TABS.map(tab => tab.label), ['概览','设备','网络','工具','我的'])
  assert.deepEqual(V3_TABS.map(tab => tab.id), ['home','clients','network','apps','more'])
})

test('all 28 existing tools have one and only one canonical home', () => {
  const tools = [
    ...V3_OVERVIEW_FEATURE_IDS,
    ...V3_DEVICE_FEATURE_IDS,
    ...V3_NETWORK_FEATURE_IDS,
    ...V3_TOOL_GROUPS.flatMap(group => group.ids)
  ]
  assert.equal(tools.length, 28)
  assert.equal(new Set(tools).size, tools.length)
  assert.equal(Object.keys(V3_FEATURE_HOME).length, tools.length)
  assert.equal(featureHome('trends'), 'home')
  assert.equal(featureHome('wol'), 'clients')
  assert.equal(featureHome('firewall'), 'network')
  assert.equal(featureHome('lucky'), 'apps')
  assert.equal(featureHome('reset'), 'apps')
  assert.equal(featureHome('topology'), null)
})

test('tool group ordering is stable, filters unavailable plugins and protects risky operations', () => {
  const tools = [
    { id: 'lucky', title: 'Lucky' }, { id: 'backup', title: '配置备份恢复' },
    { id: 'firewall', title: '防火墙' }, { id: 'process', title: '进程' },
    { id: 'reset', title: '恢复出厂' }, { id: 'ssr', title: 'SSR' },
    { id: 'wol', title: '网络唤醒' }
  ]
  assert.deepEqual(groupV3Tools(tools).map(group => group.id), ['plugins','system','maintenance'])
  assert.deepEqual(groupV3Tools(tools)[0].tools.map(tool => tool.id), ['ssr','lucky'])
  assert.deepEqual(groupV3Tools(tools).at(-1).tools.map(tool => tool.id), ['backup','reset'])
  assert.deepEqual(networkV3Tools(tools).map(tool => tool.id), ['firewall'])
  assert.deepEqual(groupV3Tools([]), [])
})
