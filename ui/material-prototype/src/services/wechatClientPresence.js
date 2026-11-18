import { normalizeMac } from './deviceIdentity.js'
import {
  WECHAT_DEVICE_ALIASES_PATH, WECHAT_ALIAS_MAX_BYTES, readDeviceAliasEntries
} from './wechatDeviceAliases.js'

export { WECHAT_DEVICE_ALIASES_PATH }

const MAC = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/
const isValidMac = mac => MAC.test(mac)
const normalizeIp = ip => String(ip || '').trim().toLowerCase()
const validName = value => {
  const name = String(value ?? '').trim()
  return name && !['unknown', 'null', 'undefined', '--'].includes(name.toLowerCase()) ? name : ''
}
const normalizedConnection = value => {
  const raw = String(value || '').trim().toLowerCase()
  if (/^(?:2[.]4|2[.]4g|2g|2[.]4ghz)$/.test(raw)) return { type: 'wireless', band: '2.4G' }
  if (/^(?:5|5g|5ghz)$/.test(raw)) return { type: 'wireless', band: '5G' }
  if (raw === 'wifi' || raw === 'wi-fi' || raw === 'wireless') return { type: 'wireless', band: '' }
  // The WeChatPush client list explicitly treats LAN, unset, and unmapped
  // interfaces as Ethernet. Avoid inferring Wi-Fi from the hostname alone.
  return { type: 'wired', band: '' }
}

export function resolveWechatConnection(item, wlan = []) {
  const bands = new Map((Array.isArray(wlan) ? wlan : [])
    .map(row => [String(row?.interface || '').trim(), String(row?.band || '')]))
  const direct = String(item?.type || '').trim()
  const iface = String(item?.interface || '').trim()
  return normalizedConnection(direct || bands.get(iface) || iface)
}

export function parseWechatClientPresence(snapshot, services, procd, aliasFile) {
  const installed = typeof aliasFile?.data === 'string' ||
    typeof snapshot?.data === 'string' ||
    Boolean(services?.wechatpush || procd?.wechatpush)
  const instances = procd?.wechatpush?.instances || {}
  const procdInstances = Object.values(instances)
  const procdRunning = procdInstances.some(instance => instance?.running === true)
  const rcRunning = services?.wechatpush?.running === true
  // A missing/inaccessible service.list result must not invalidate the
  // WeChatPush file we just read. Only an explicit stopped service means
  // its on-router devices.json should not be treated as current.
  const explicitlyStopped = (procdInstances.length > 0 && !procdRunning && !rcRunning) ||
    (procdInstances.length === 0 && services?.wechatpush?.running === false)
  const running = procdRunning || rcRunning || !explicitlyStopped

  const aliasText = typeof aliasFile?.data === 'string' &&
    new TextEncoder().encode(aliasFile.data).length <= WECHAT_ALIAS_MAX_BYTES
      ? aliasFile.data : ''
  const aliases = new Map()
  for (const entry of readDeviceAliasEntries(aliasText)) {
    const key = entry.target.trim().toLowerCase()
    if (key && !aliases.has(key) && validName(entry.alias)) aliases.set(key, entry.alias.trim())
  }
  const byMac = new Map(), byIp = new Map()
  // WeChatPush may run as a shell/timer-based monitor without a procd-tracked
  // instance. A fresh RPC file read is stronger evidence than rc/service.list
  // (which can report stopped even while the monitor is producing data).
  // Never replace a failed file read with an earlier App-side snapshot.
  if (typeof snapshot?.data !== 'string' || snapshot.data.length > 524288) {
    const reason = typeof snapshot?.data !== 'string'
      ? '无法读取 /tmp/wechatpush/devices.json（文件不存在或 RPC 无读取权限）'
      : '微信推送设备数据超过大小限制'
    return { installed, running, available: false, reason, byMac, byIp, aliases, devices: [] }
  }
  let data
  try { data = JSON.parse(snapshot.data) } catch { data = null }
  if (!Array.isArray(data?.devices)) {
    return { installed, running, available: false, reason: 'devices.json 数据格式无效',
      byMac, byIp, aliases, devices: [] }
  }
  for (const entry of data.devices.slice(0, 1024)) {
    const mac = normalizeMac(entry?.mac).toUpperCase()
    if (!isValidMac(mac)) continue
    const ip = normalizeIp(entry.ip)
    const status = ['online', 'offline', 'unknown'].includes(entry.status) ? entry.status : 'unknown'
    const connection = resolveWechatConnection(entry, data.wlan)
    const alias = aliases.get(mac.toLowerCase()) || aliases.get(ip) || ''
    const record = {
      mac, ip, name: alias || (validName(entry.name).toLowerCase() === mac.toLowerCase() ? '' : validName(entry.name)),
      status, connectionType: connection.type, band: connection.band
    }
    const previous = byMac.get(mac)
    // The router cache may temporarily contain duplicate MACs during roaming.
    // Explicit online evidence takes precedence over an older offline row.
    if (!previous || (previous.status !== 'online' && record.status === 'online')) byMac.set(mac, record)
  }
  for (const entry of byMac.values()) {
    if (entry.ip && !byIp.has(entry.ip)) byIp.set(entry.ip, entry)
  }
  return { installed, running, available: true, reason: '', byMac, byIp, aliases,
    devices: [...byMac.values()] }
}

export function matchedWechatClient(presence, mac, ip) {
  const key = normalizeMac(mac).toUpperCase()
  if (isValidMac(key)) return presence?.byMac?.get(key) || null
  // A MAC match is required when the device has a real MAC: reused DHCP IPs
  // must never copy the wrong person's name or online status.
  return presence?.byIp?.get(normalizeIp(ip)) || null
}
export function resolveWechatClientName(presence, mac, ip, fallback = '') {
  if (!presence?.installed) return validName(fallback)
  const key = normalizeMac(mac).toLowerCase()
  const alias = (key && presence.aliases?.get(key)) ||
    presence.aliases?.get(normalizeIp(ip))
  return alias || matchedWechatClient(presence, mac, ip)?.name || validName(fallback)
}
export function preferredWechatOnlineStatus(matched, fallback) {
  return matched?.status === 'online' || matched?.status === 'offline'
    ? matched.status : fallback
}
