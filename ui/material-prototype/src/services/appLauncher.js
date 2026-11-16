/**
 * Application launcher categorization and per-router favorites.
 * Destructive actions remain in Device maintenance, never in favorites.
 */
export const APP_FAVORITES_STORAGE_KEY = 'xxwrt_material_app_favorites_v1'
export const APP_FAVORITES_LIMIT = 5
export const DEFAULT_APP_FAVORITES = Object.freeze([
  'lucky', 'openclash', 'zerotier', 'wechatpush', 'firewall'
])

export const APP_CATEGORIES = Object.freeze([
  { id: 'network', title: '网络与安全', icon: 'mdi-shield-lock-outline',
    ids: ['parental', 'ssr', 'openclash', 'zerotier', 'firewall', 'diagnostics', 'dnsdhcp', 'ddns', 'topology', 'security'] },
  { id: 'services', title: '服务与插件', icon: 'mdi-puzzle-outline',
    ids: ['lucky', 'vlmcsd', 'wechatpush', 'detector', 'carbon'] },
  { id: 'system', title: '系统工具', icon: 'mdi-tools',
    ids: ['routes', 'process', 'startup', 'services', 'logs', 'backup', 'cron', 'trends', 'capabilities', 'audit', 'wol', 'packages'] },
  { id: 'maintenance', title: '设备维护', icon: 'mdi-cog-outline',
    ids: ['reboot', 'reset'] }
])
const DANGEROUS_IDS = new Set(['reboot', 'reset'])
const FAVORITABLE_IDS = new Set(APP_CATEGORIES.flatMap(group => group.ids)
  .filter(id => !DANGEROUS_IDS.has(id)))

export function isDangerousApp(id) {
  return DANGEROUS_IDS.has(id)
}

export function cleanAppFavorites(value) {
  if (!Array.isArray(value)) return null
  const unique = new Set()
  for (const id of value) {
    if (typeof id === 'string' && FAVORITABLE_IDS.has(id)) unique.add(id)
    if (unique.size >= APP_FAVORITES_LIMIT) break
  }
  return [...unique]
}

export function readAppFavorites(storage, deviceId) {
  if (!deviceId) return [...DEFAULT_APP_FAVORITES]
  try {
    const data = JSON.parse(storage.getItem(APP_FAVORITES_STORAGE_KEY) || '{}')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [...DEFAULT_APP_FAVORITES]
    return cleanAppFavorites(data[deviceId]) ?? [...DEFAULT_APP_FAVORITES]
  } catch (_) {
    return [...DEFAULT_APP_FAVORITES]
  }
}

export function writeAppFavorites(storage, deviceId, favorites) {
  if (!deviceId) return false
  const clean = cleanAppFavorites(favorites)
  if (!clean) return false
  // A malformed JSON value is recoverable: replace it with this router's
  // new favorites, but keep genuine storage access errors non-fatal.
  let raw
  try { raw = storage.getItem(APP_FAVORITES_STORAGE_KEY) }
  catch (_) { return false }
  let saved
  try { saved = JSON.parse(raw || '{}') }
  catch (_) { saved = {} }
  const data = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  data[deviceId] = clean
  try {
    storage.setItem(APP_FAVORITES_STORAGE_KEY, JSON.stringify(data))
    return true
  } catch (_) { return false }
}

export function groupVisibleApps(tools) {
  const byId = new Map(tools.map(tool => [tool.id, tool]))
  return APP_CATEGORIES.map(group => ({
    ...group, tools: group.ids.map(id => byId.get(id)).filter(Boolean)
  })).filter(group => group.tools.length)
}

export function searchAppTools(tools, query) {
  const search = String(query || '').trim().toLocaleLowerCase()
  if (!search) return []
  const categories = new Map(APP_CATEGORIES.flatMap(group =>
    group.ids.map(id => [id, group.title])))
  return tools.filter(tool =>
    [tool.title, tool.subtitle, categories.get(tool.id)].some(text =>
      String(text || '').toLocaleLowerCase().includes(search)))
}

export function sortFavoriteTools(tools, favoriteIds) {
  const available = new Map(tools.filter(tool => !isDangerousApp(tool.id))
    .map(tool => [tool.id, tool]))
  return (cleanAppFavorites(favoriteIds) || [])
    .map(id => available.get(id)).filter(Boolean)
}

export function toggleAppFavorite(favoriteIds, id) {
  const current = cleanAppFavorites(favoriteIds) || []
  if (!FAVORITABLE_IDS.has(id)) return current
  if (current.includes(id)) return current.filter(item => item !== id)
  if (current.length >= APP_FAVORITES_LIMIT) return current
  return [...current, id]
}

export function moveAppFavorite(favoriteIds, id, direction) {
  const current = cleanAppFavorites(favoriteIds) || []
  const index = current.indexOf(id)
  const next = index + direction
  if (![-1, 1].includes(direction) || index < 0 || next < 0 || next >= current.length) return current
  ;[current[index], current[next]] = [current[next], current[index]]
  return current
}
