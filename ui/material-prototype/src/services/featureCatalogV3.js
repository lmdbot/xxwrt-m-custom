/**
 * Material 3.0 information architecture. IDs intentionally preserve the
 * 2.x RPC panel identifiers; this registry moves navigation, not UCI writes.
 *
 * Every legacy feature has exactly one primary home (Overview, Devices,
 * Network or Tools), even if global search and favorites link elsewhere.
 */
export const V3_TABS = Object.freeze([
  { id: 'home', label: '概览', icon: 'mdi-view-dashboard-outline' },
  { id: 'clients', label: '设备', icon: 'mdi-devices' },
  { id: 'network', label: '网络', icon: 'mdi-lan' },
  { id: 'apps', label: '工具', icon: 'mdi-apps' },
  { id: 'more', label: '我的', icon: 'mdi-account-circle-outline' }
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
