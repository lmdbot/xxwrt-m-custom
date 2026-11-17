import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_FAVORITES_LIMIT, DEFAULT_APP_FAVORITES,
  readAppFavorites, writeAppFavorites, groupVisibleApps,
  searchAppTools, sortFavoriteTools, toggleAppFavorite,
  moveAppFavorite, isDangerousApp
} from '../src/services/appLauncher.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }
}

const tools = [
  { id: 'lucky', title: 'Lucky', subtitle: '网络服务' },
  { id: 'openclash', title: 'OpenClash', subtitle: '代理模式' },
  { id: 'zerotier', title: 'ZeroTier', subtitle: '虚拟组网' },
  { id: 'ssr', title: 'ShadowSocksR Plus+', subtitle: '代理节点' },
  { id: 'wol', title: '网络唤醒', subtitle: '唤醒终端' },
  { id: 'reboot', title: '重启设备', subtitle: '需要确认' },
  { id: 'reset', title: '恢复出厂', subtitle: '需二次确认' }
]

test('default favorites remain five and users may customize up to eight', () => {
  assert.equal(APP_FAVORITES_LIMIT, 8)
  assert.equal(DEFAULT_APP_FAVORITES.length, 5)
  assert.ok(DEFAULT_APP_FAVORITES.length <= APP_FAVORITES_LIMIT)
  assert.equal(DEFAULT_APP_FAVORITES.some(isDangerousApp), false)
  assert.equal(isDangerousApp('reboot'), true)
  assert.equal(isDangerousApp('reset'), true)
})

test('preferences persist separately for each saved router, including empty favorites', () => {
  const storage = memoryStorage()
  assert.deepEqual(readAppFavorites(storage, 'router-a'), DEFAULT_APP_FAVORITES)
  assert.equal(writeAppFavorites(storage, 'router-a', ['lucky', 'ssr']), true)
  assert.equal(writeAppFavorites(storage, 'router-b', []), true)
  assert.deepEqual(readAppFavorites(storage, 'router-a'), ['lucky', 'ssr'])
  assert.deepEqual(readAppFavorites(storage, 'router-b'), [])
  assert.deepEqual(readAppFavorites(storage, 'router-c'), DEFAULT_APP_FAVORITES)
})

test('corrupted preferences recover; invalid, repeated and dangerous IDs are excluded', () => {
  const storage = memoryStorage()
  storage.setItem('xxwrt_material_app_favorites_v1', '{invalid')
  assert.deepEqual(readAppFavorites(storage, 'router-a'), DEFAULT_APP_FAVORITES)
  writeAppFavorites(storage, 'router-a',
    ['reset', 'lucky', 'lucky', 'unknown', 'reboot', 'ssr', 'zerotier', 'openclash', 'wechatpush', 'firewall'])
  assert.deepEqual(readAppFavorites(storage, 'router-a'),
    ['lucky', 'ssr', 'zerotier', 'openclash', 'wechatpush', 'firewall'])
})

test('blocked localStorage must not break application launch', () => {
  const broken = { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } }
  assert.deepEqual(readAppFavorites(broken, 'router-a'), DEFAULT_APP_FAVORITES)
  assert.equal(writeAppFavorites(broken, 'router-a', ['lucky']), false)
  assert.equal(writeAppFavorites(memoryStorage(), '', ['lucky']), false)
})

test('categories preserve expected ordering and omit unavailable router plugins', () => {
  const groups = groupVisibleApps(tools.filter(tool => tool.id !== 'zerotier'))
  assert.deepEqual(groups.map(group => group.id), ['network', 'services', 'system', 'maintenance'])
  assert.deepEqual(groups.find(group => group.id === 'network').tools.map(tool => tool.id),
    ['ssr', 'openclash'])
  assert.deepEqual(groupVisibleApps([]), [])
})

test('search matches names, descriptions and category labels', () => {
  assert.deepEqual(searchAppTools(tools, ' OPENclash ').map(tool => tool.id), ['openclash'])
  assert.deepEqual(searchAppTools(tools, '代理').map(tool => tool.id), ['openclash', 'ssr'])
  assert.deepEqual(searchAppTools(tools, '设备维护').map(tool => tool.id), ['reboot', 'reset'])
  assert.deepEqual(searchAppTools(tools, ' '), [])
})

test('favorite order is editable; missing plugins and destructive actions never appear', () => {
  assert.deepEqual(sortFavoriteTools(tools, ['reset', 'zerotier', 'lucky', 'firewall'])
    .map(tool => tool.id), ['zerotier', 'lucky'])
  assert.deepEqual(toggleAppFavorite(['lucky'], 'ssr'), ['lucky', 'ssr'])
  assert.deepEqual(toggleAppFavorite(['lucky', 'ssr'], 'lucky'), ['ssr'])
  assert.deepEqual(toggleAppFavorite(['lucky'], 'reset'), ['lucky'])
  assert.equal(toggleAppFavorite([...DEFAULT_APP_FAVORITES], 'ssr').length, 6)
  assert.equal(toggleAppFavorite(['lucky','ssr','wol','openclash','zerotier','firewall','ddns','detector'], 'wechatpush').length, APP_FAVORITES_LIMIT)
  assert.deepEqual(moveAppFavorite(['lucky', 'ssr', 'zerotier'], 'zerotier', -1),
    ['lucky', 'zerotier', 'ssr'])
  assert.deepEqual(moveAppFavorite(['lucky', 'ssr'], 'lucky', -1), ['lucky', 'ssr'])
})
