import { formatBytes } from './router.js'

const SAFE_DEVICE = /^[a-zA-Z0-9_.:@-]{1,50}$/

/**
 * Exact read-only df invocation, no shell, no user supplied arguments.
 * OpenWrt BusyBox commonly exposes /bin/df. When file.exec ACL is absent
 * display an unavailable state instead of inventing storage numbers.
 */
export async function readDiskUsage(client) {
  let response = await client.call('file', 'exec', {
    command: '/bin/df', params: ['-kP'], env: null
  }, true)
  if (!response || Number(response.code ?? 0) !== 0) {
    response = await client.call('file', 'exec', {
      command: '/usr/bin/df', params: ['-kP'], env: null
    }, true)
  }
  if (typeof response?.stdout !== 'string' || Number(response.code ?? 0) !== 0) {
    return { available: false, partitions: [], primary: null, temporary: null }
  }
  const partitions = response.stdout.split(/\r?\n/).slice(1).map(line => {
    const m = line.trim().match(/^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(.+)$/)
    if (!m) return null
    const total = Number(m[2]) * 1024
    const used = Number(m[3]) * 1024
    return {
      device: m[1], mount: m[6], total, used,
      percent: Number(m[5]), usedText: formatBytes(used),
      totalText: formatBytes(total),
      temporary: m[1] === 'tmpfs' || m[1] === 'devtmpfs'
    }
  }).filter(p => p && p.total > 0)
  // Prefer writable overlay for flash storage; do not mistake tmpfs for disk.
  const primary = partitions.find(p => p.mount === '/overlay') ||
    partitions.find(p => p.mount === '/' && !p.temporary) ||
    partitions.find(p => p.mount.startsWith('/mnt/') && !p.temporary) ||
    partitions.find(p => !p.temporary) || null
  const temporary = partitions.find(p => p.mount === '/tmp') || null
  return { available: partitions.length > 0, partitions, primary, temporary }
}

export function interfaceOptions(interfaces = []) {
  const map = new Map()
  for (const entry of interfaces) {
    const name = String(entry?.l3_device || entry?.device || entry?.ifname || '')
    if (!SAFE_DEVICE.test(name)) continue
    if (!map.has(name)) {
      map.set(name, {
        title: String(entry.interface || name) + ' · ' + name,
        value: name,
        logical: String(entry.interface || ''),
        up: !!entry.up
      })
    }
  }
  return [...map.values()]
}

export function extractCounters(data, deviceName) {
  const match = data?.statistics || data?.[deviceName]?.statistics ||
    data?.device?.statistics || data?.[deviceName] || data
  const rx = Number(match?.rx_bytes ?? match?.rxBytes)
  const tx = Number(match?.tx_bytes ?? match?.txBytes)
  if (!Number.isFinite(rx) || !Number.isFinite(tx) || rx < 0 || tx < 0) return null
  return {
    rxBytes: rx,
    txBytes: tx,
    rxPackets: Number(match.rx_packets) || 0,
    txPackets: Number(match.tx_packets) || 0,
    rxErrors: Number(match.rx_errors) || 0,
    txErrors: Number(match.tx_errors) || 0
  }
}

export async function readInterfaceCounters(client, name) {
  if (!SAFE_DEVICE.test(String(name))) throw new Error('接口名格式不正确')
  const data = await client.call('network.device', 'status', { name }, true)
  return extractCounters(data, name)
}

export async function readSystemLoad(client) {
  const info = await client.call('system', 'info', {}, true)
  const load = Array.isArray(info?.load) ? info.load : []
  if (load.length < 3) return null
  return load.slice(0, 3).map(n => Number((Number(n) / 65536).toFixed(2)))
}

export function bandwidthSample(prev, curr, ms) {
  if (!prev || !curr || !Number.isFinite(ms) || ms < 100) return null
  const rxDelta = curr.rxBytes - prev.rxBytes
  const txDelta = curr.txBytes - prev.txBytes
  // Counter resets on reconnect/driver reset: never show a negative speed.
  if (rxDelta < 0 || txDelta < 0) return null
  return {
    rxBps: Math.round(rxDelta * 1000 / ms),
    txBps: Math.round(txDelta * 1000 / ms)
  }
}

export function prettyRate(bytesPerSecond) {
  return formatBytes(bytesPerSecond || 0) + '/s'
}

/**
 * Standard iwinfo ubus read-only RPC. Some x86 routers have no radio,
 * and some OpenWrt builds omit iwinfo; both produce an empty/unsupported state.
 */
export async function readWirelessStations(client) {
  const raw = await client.call('iwinfo', 'devices', {}, true)
  const names = Array.isArray(raw?.devices) ? raw.devices :
    Array.isArray(raw) ? raw : []
  const devices = names.map(x => typeof x === 'string' ? x : x?.name)
    .filter(x => SAFE_DEVICE.test(String(x))).slice(0, 16)
  const results = await Promise.all(devices.map(async dev => {
    const status = await client.call('iwinfo', 'assoclist', { device: dev }, true)
      .catch(() => null)
    const clients = Array.isArray(status?.results) ? status.results :
      Array.isArray(status?.assoclist) ? status.assoclist : []
    return clients.map(c => ({
      device: dev,
      mac: String(c.mac || c.macaddr || '--').toUpperCase(),
      signal: c.signal ?? null,
      rxRate: c.rx?.rate ?? c.rx_rate ?? null,
      txRate: c.tx?.rate ?? c.tx_rate ?? null,
      connected: c.connected_time ?? c.connected ?? null
    }))
  }))
  return { available: raw != null, stations: results.flat() }
}
