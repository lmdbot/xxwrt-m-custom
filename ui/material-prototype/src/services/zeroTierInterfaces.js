// Read-only normalization of OpenWrt / ZeroTier interface metadata.
// Do not infer an interface address, MTU or counter from another device.
export function isZeroTierInterfaceName(value) {
  return /^zt[a-z0-9]{1,13}$/i.test(String(value || ''))
}

function addressValues(value) {
  if (value == null) return []
  if (Array.isArray(value)) return value.flatMap(addressValues)
  if (typeof value === 'string') return value.split(/[\s,]+/).filter(Boolean)
  if (typeof value !== 'object' || value.family === 'link') return []
  if (Array.isArray(value.addr_info)) return addressValues(value.addr_info)
  return addressValues(value.local ?? value.address ?? value.addr ?? value.ipaddr ?? value.ip)
}

export function splitZeroTierAddresses(...sources) {
  const ipv4 = [], ipv6 = []
  for (const value of sources.flatMap(addressValues)) {
    const address = String(value).split('/')[0].split('%')[0].trim()
    const octets = address.split('.')
    if (octets.length === 4 && octets.every(x => /^\d{1,3}$/.test(x) && Number(x) <= 255)) {
      if (!ipv4.includes(address)) ipv4.push(address)
    } else if (address.includes(':') && /^[\da-f:]+$/i.test(address) &&
      address.split(':').length >= 3 && !/^(?:[\da-f]{2}:){5}[\da-f]{2}$/i.test(address)) {
      if (!ipv6.includes(address)) ipv6.push(address)
    }
  }
  return { ipv4, ipv6 }
}

export function formatZeroTierBytes(value) {
  if (value == null || value === '') return '未获取'
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '未获取'
  if (bytes < 1024) return Math.floor(bytes) + ' B'
  const sizes = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB']
  let scaled = bytes
  let unit = -1
  do { scaled /= 1024; unit++ } while (scaled >= 1024 && unit < sizes.length - 1)
  return scaled.toFixed(1) + ' ' + sizes[unit]
}

export function buildZeroTierInterface(name, sources = [], extraAddresses = [], fallbackMac = '') {
  const details = sources.filter(x => x && typeof x === 'object')
  const pick = (...fields) => {
    for (const detail of details) {
      for (const field of fields) {
        if (detail[field] != null && detail[field] !== '') return detail[field]
      }
    }
    return null
  }
  const stat = field => {
    for (const detail of details) {
      for (const data of [detail.statistics, detail.stats, detail.stats64, detail]) {
        const raw = data?.[field]
        if (raw == null || raw === '') continue
        const parsed = Number(raw)
        if (Number.isFinite(parsed) && parsed >= 0) return parsed
      }
    }
    return null
  }
  const mtuRaw = pick('mtu')
  const mtuNumber = mtuRaw == null ? null : Number(mtuRaw)
  const allAddresses = details.flatMap(item => [
    item['ipv4-address'], item['ipv6-address'], item.ipaddrs, item.ip4addrs,
    item.ip6addrs, item.addresses, item.addr_info
  ])
  const { ipv4, ipv6 } = splitZeroTierAddresses(...allAddresses, ...extraAddresses)
  const up = details.some(item => item.up === true || item.link === true || item.flags?.up === true)
    ? true : details.some(item => item.up === false || item.link === false || item.flags?.up === false)
      ? false : null
  return {
    name,
    mac: String(pick('macaddr', 'mac', 'mac_address') || fallbackMac || ''),
    mtu: Number.isInteger(mtuNumber) && mtuNumber > 0 ? mtuNumber : null,
    rxBytes: stat('rx_bytes'),
    txBytes: stat('tx_bytes'),
    ipv4,
    ipv6,
    up,
    addresses: [...ipv4, ...ipv6].join(', ')
  }
}
