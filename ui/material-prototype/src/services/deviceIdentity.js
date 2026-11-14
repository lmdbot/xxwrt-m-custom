import BRAND_DATA from '../data/carbon-brands.js'

const TYPE_LABELS = Object.freeze({
  phone: '手机',
  tablet: '平板',
  pc: '电脑',
  tv: '电视',
  speaker: '音箱',
  game: '游戏机',
  printer: '打印机',
  camera: '摄像头',
  nas: 'NAS',
  iot: '智能设备'
})

const TYPE_ICONS = Object.freeze({
  phone: 'mdi-cellphone',
  tablet: 'mdi-tablet',
  pc: 'mdi-laptop',
  tv: 'mdi-television',
  speaker: 'mdi-speaker',
  game: 'mdi-gamepad-variant',
  printer: 'mdi-printer',
  camera: 'mdi-cctv',
  nas: 'mdi-nas',
  iot: 'mdi-chip'
})

const MAC_PATTERN = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i
let hostRules = null
let ouiMap = null

export function normalizeMac(value) {
  const compact = String(value || '').replace(/[^0-9a-f]/gi, '').toLowerCase()
  if (!/^[0-9a-f]{12}$/.test(compact)) return ''
  return compact.match(/.{2}/g).join(':')
}

export function macFromDuid(value) {
  const hex = String(value || '').replace(/[^0-9a-f]/gi, '')
  let address = ''
  // DUID-LLT: type(2) + hardware(2) + time(4) + link-layer address(6).
  if (hex.length === 28 && /^00010001/i.test(hex)) address = hex.slice(16)
  // DUID-LL: type(2) + hardware(2) + link-layer address(6).
  else if (hex.length === 20 && /^00030001/i.test(hex)) address = hex.slice(8)
  return normalizeMac(address)
}

function buildIndex() {
  if (hostRules && ouiMap) return
  hostRules = BRAND_DATA.host.map(([pattern, key, type]) => {
    try { return [new RegExp(pattern, 'i'), key, type] } catch (_) { return null }
  }).filter(Boolean)
  ouiMap = new Map()
  for (const [key, encoded] of Object.entries(BRAND_DATA.oui)) {
    const binary = atob(encoded)
    for (let i = 0; i + 2 < binary.length; i += 3) {
      const prefix = (binary.charCodeAt(i) << 16)
        | (binary.charCodeAt(i + 1) << 8)
        | binary.charCodeAt(i + 2)
      ouiMap.set(prefix, key)
    }
  }
}

/**
 * Carbon-style identification: hostname rules first, then IEEE OUI.
 * Locally administered (randomised/private) MAC addresses are never used
 * for vendor lookup because their prefix does not identify the manufacturer.
 */
export function identifyDevice(hostname, mac) {
  const result = { key: null, brand: null, type: null, privateMac: false }
  const normalized = normalizeMac(mac)
  const compact = normalized.replace(/:/g, '')
  result.privateMac = compact.length === 12 && (parseInt(compact[1], 16) & 2) === 2

  buildIndex()
  const host = String(hostname || '')
  for (const [pattern, key, type] of hostRules) {
    if (pattern.test(host)) {
      result.key = key
      result.type = type
      break
    }
  }

  if (!result.key && compact.length === 12 && !result.privateMac) {
    result.key = ouiMap.get(parseInt(compact.slice(0, 6), 16)) || null
  }

  if (result.key && BRAND_DATA.brands[result.key]) {
    result.brand = BRAND_DATA.brands[result.key]
    if (!result.brand.n) {
      result.type = result.type || (result.brand.g === 'pc' ? 'pc' : null)
      result.brand = null
      result.key = null
    }
  }

  return result
}

export function deviceTypeLabel(type) {
  return TYPE_LABELS[type] || ''
}

export function deviceTypeIcon(type) {
  return TYPE_ICONS[type] || 'mdi-devices'
}

export function deviceKindLabel(identity) {
  if (!identity) return ''
  return [identity.brand?.n, deviceTypeLabel(identity.type)].filter(Boolean).join(' · ')
}

export function deviceDisplayName(hostname, identity) {
  const host = String(hostname || '').trim()
  if (host) return host
  if (identity?.brand?.n) return identity.brand.n + ' 设备'
  const type = deviceTypeLabel(identity?.type)
  return type ? type + '设备' : '未知设备'
}

export function isValidMac(value) {
  return MAC_PATTERN.test(String(value || ''))
}
