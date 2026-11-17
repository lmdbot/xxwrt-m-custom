import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { normalizeRouterAddress, RouterClient } from './router.js'
import { normalizeTrustedAlternative } from './labFeatures.js'

const LIST_KEY = 'xxwrt_material_saved_devices_v1'
const OLD_HOST_KEY = 'xxwrt_material_router_url'
const SECRET_PREFIX = 'xxwrt_router_pass_'

export const MAX_ROUTER_ALTERNATIVES = 5

/** Only endpoints explicitly supplied by the user can receive an RPC token.
 * Bare LAN IP means HTTP; bare domains mean HTTPS (never public HTTP). */
export function normalizeRouterAlternates(primaryAddress, values) {
  const primary = normalizeRouterAddress(primaryAddress)
  if (!Array.isArray(values)) return []
  if (values.filter(x => String(x || '').trim()).length > MAX_ROUTER_ALTERNATIVES)
    throw new Error('最多配置 5 个备用登录入口')
  const result = [], seen = new Set([primary])
  for (const raw of values) {
    let address = String(raw || '').trim()
    if (!address) continue
    if (!/^https?:\/\//i.test(address)) {
      address = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(address)
        ? 'http://' + address : 'https://' + address
    }
    const normalized = normalizeTrustedAlternative(address)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

export function loadDevices() {
  let items = []
  try {
    const decoded = JSON.parse(localStorage.getItem(LIST_KEY) || '[]')
    if (Array.isArray(decoded)) {
      items = decoded.filter(item =>
        item && typeof item.id === 'string' &&
        typeof item.address === 'string' && typeof item.name === 'string'
      ).slice(0, 100).map(item => ({
        id: item.id,
        name: item.name,
        address: item.address,
        username: String(item.username || 'root'),
        createdAt: Number(item.createdAt) || Date.now(),
        rememberPassword: !!item.rememberPassword,
        ignoreTlsErrors: !!item.ignoreTlsErrors && item.address.startsWith('https://'),
        alternateAddresses: (() => {
          try { return normalizeRouterAlternates(item.address,item.alternateAddresses || []) }
          catch { return [] }
        })(),
        autoSwitch: typeof item.autoSwitch === 'boolean' ? item.autoSwitch : undefined
      }))
    }
  } catch (_) {}
  // Backwards-compatible with the single-router Material 0.2.x preference.
  if (items.length === 0 && localStorage.getItem(OLD_HOST_KEY)) {
    try {
      const address = normalizeRouterAddress(localStorage.getItem(OLD_HOST_KEY))
      items = [{
        id: 'legacy-router',
        name: '我的 OpenWrt',
        address,
        username: 'root',
        createdAt: Date.now(),
        rememberPassword: false,
        ignoreTlsErrors: false
      }]
      saveDevices(items)
    } catch (_) {}
  }
  return items
}

export function saveDevices(items) {
  const clean = items.map(item => ({
    id: String(item.id),
    name: String(item.name).trim().slice(0, 64),
    address: normalizeRouterAddress(item.address),
    username: String(item.username || 'root').trim().slice(0, 64),
    createdAt: Number(item.createdAt) || Date.now(),
    rememberPassword: !!item.rememberPassword,
    ignoreTlsErrors: !!item.ignoreTlsErrors && normalizeRouterAddress(item.address).startsWith('https://'),
    alternateAddresses: normalizeRouterAlternates(item.address,item.alternateAddresses || []),
    ...(typeof item.autoSwitch === 'boolean' ? {autoSwitch:item.autoSwitch} : {})
  }))
  localStorage.setItem(LIST_KEY, JSON.stringify(clean))
  return clean
}

export function newDevice({
  name, address, username, ignoreTlsErrors = false,
  alternateAddresses = [], autoSwitch = false
}) {
  const url = normalizeRouterAddress(address)
  const label = String(name || '').trim()
  if (!label) throw new Error('请输入设备名称')
  if (label.length > 64) throw new Error('设备名称不能超过 64 个字符')
  const user = String(username || 'root').trim()
  if (!user) throw new Error('请输入用户名')
  return {
    id: 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9),
    name: label,
    address: url,
    username: user,
    createdAt: Date.now(),
    rememberPassword: false,
    ignoreTlsErrors: !!ignoreTlsErrors && url.startsWith('https://'),
    alternateAddresses: normalizeRouterAlternates(url,alternateAddresses),
    autoSwitch: autoSwitch === true
  }
}

/** Android Keystore only. Passwords are never written to localStorage. */
export async function storeDevicePassword(id, password) {
  if (!Capacitor.isNativePlatform()) return false
  await SecureStorage.set(SECRET_PREFIX + id, String(password))
  return true
}

export async function fetchDevicePassword(id) {
  if (!Capacitor.isNativePlatform()) return null
  const data = await SecureStorage.get(SECRET_PREFIX + id)
  return typeof data === 'string' ? data : null
}

export async function deleteDevicePassword(id) {
  if (!Capacitor.isNativePlatform()) return
  await SecureStorage.remove(SECRET_PREFIX + id)
}

/** Check basic HTTP transport only. 'reachable' does NOT mean authenticated. */
export async function probeDevice(address, ignoreTlsErrors = false) {
  const api = new RouterClient(address, { ignoreTlsErrors })
  const url = api.baseUrl + '/ubus'
  try {
    const response = await api.httpRequest('POST', {
      url,
      data: { jsonrpc: '2.0', id: 1, method: 'call',
        params: ['00000000000000000000000000000000', 'session', 'access', {}] },
      headers: { 'Content-Type': 'application/json' },
      connectTimeout: 4500,
      readTimeout: 4500
    })
    return response.status >= 100 && response.status < 600 ? 'reachable' : 'offline'
  } catch (_) {
    return 'offline'
  }
}
