/**
 * Material 3.0 information architecture. IDs intentionally preserve the
 * 2.x RPC panel identifiers; this registry moves navigation, not UCI writes.
 *
 * Every legacy feature has exactly one primary home (Overview, Devices,
 * Network or Tools), even if global search and favorites link elsewhere.
 */
export const V3_TABS = Object.freeze([
  { id: 'home', label: '概览', icon: 'mdi-home-outline' },
  { id: 'clients', label: '设备', icon: 'mdi-monitor' },
  { id: 'network', label: '网络', icon: 'mdi-swap-horizontal' },
  { id: 'apps', label: '工具', icon: 'mdi-star-four-points' },
  { id: 'more', label: '我的', icon: 'mdi-account-outline' }
])
export const V3_NETWORK_FEATURE_IDS = Object.freeze([
  'routes', 'dnsdhcp', 'firewall', 'ddns', 'zerotier'
])
export const V3_DEVICE_FEATURE_IDS = Object.freeze(['parental','wol'])
export const V3_OVERVIEW_FEATURE_IDS = Object.freeze(['trends'])
export const V3_TOOL_GROUPS = Object.freeze([
  { id: 'plugins', title: '插件中心', icon: 'mdi-puzzle-outline',
    ids: ['ssr', 'openclash', 'lucky', 'wechatpush', 'vlmcsd', 'detector', 'carbon'] },
  { id: 'system', title: '系统管理', icon: 'mdi-cog-outline',
    ids: ['packages', 'services', 'process', 'startup', 'cron'] },
  { id: 'diagnostics', title: '诊断与安全', icon: 'mdi-shield-check-outline',
    ids: ['diagnostics', 'logs', 'security', 'audit', 'capabilities'] },
  { id: 'maintenance', title: '维护与备份', icon: 'mdi-backup-restore',
    ids: ['backup', 'reboot', 'reset'] }
])
const assignHome = Object.fromEntries([
  ...V3_OVERVIEW_FEATURE_IDS.map(id => [id, 'home']),
  ...V3_DEVICE_FEATURE_IDS.map(id => [id, 'clients']),
  ...V3_NETWORK_FEATURE_IDS.map(id => [id, 'network']),
  ...V3_TOOL_GROUPS.flatMap(group => group.ids.map(id => [id, 'apps']))
])
export const V3_FEATURE_HOME = Object.freeze(assignHome)
export function featureHome(id) {
  return V3_FEATURE_HOME[id] || null
}
export function groupV3Tools(tools) {
  const byId = new Map(tools.map(item => [item.id,item]))
  return V3_TOOL_GROUPS.map(group => ({
    ...group, tools: group.ids.map(id => byId.get(id)).filter(Boolean)
  })).filter(group => group.tools.length > 0)
}
export function networkV3Tools(tools) {
  const byId = new Map(tools.map(item => [item.id,item]))
  return V3_NETWORK_FEATURE_IDS.map(id => byId.get(id)).filter(Boolean)
}

/**
 * Search across real feature titles/descriptions and their 3.0 categories.
 * Categories are deliberately not baked into the legacy favorites backend.
 */
export function searchV3Features(tools, query) {
  const term = String(query || '').trim().toLocaleLowerCase()
  if (!term) return []
  const titles = Object.fromEntries([
    ...V3_NETWORK_FEATURE_IDS.map(id => [id, '网络']),
    ...V3_DEVICE_FEATURE_IDS.map(id => [id, '设备']),
    ...V3_OVERVIEW_FEATURE_IDS.map(id => [id, '详细监控']),
    ...V3_TOOL_GROUPS.flatMap(group => group.ids.map(id => [id, group.title]))
  ])
  return tools.filter(tool => [tool.title, tool.subtitle, titles[tool.id]].some(value =>
    String(value || '').toLocaleLowerCase().includes(term)))
}
