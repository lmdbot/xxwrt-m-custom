import { CapacitorHttp } from '@capacitor/core'

const NULL_SESSION = '00000000000000000000000000000000'

export function normalizeRouterAddress(value) {
  let address = String(value || '').trim()
  if (!address) throw new Error('请输入路由器 IP 或域名')
  if (!/^https?:\/\//i.test(address)) address = 'http://' + address
  let parsed
  try { parsed = new URL(address) } catch { throw new Error('路由器地址格式不正确') }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('仅支持 HTTP / HTTPS 路由器地址')
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('地址只填写 IP、域名和可选端口，不要包含路径或账号密码')
  }
  return parsed.origin
}

export function shortError(error) {
  if (typeof error === 'string') return error
  return error?.message || '网络通信失败，请检查地址、端口和路由器网络连接'
}

function parseResponse(payload) {
  let data = payload?.data
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { throw new Error('路由器返回了非 JSON 数据，请检查 /ubus 接口') }
  }
  if (data == null || typeof data !== 'object') throw new Error('路由器 RPC 返回为空')
  if (payload.status < 200 || payload.status >= 300) {
    throw new Error('HTTP ' + payload.status + '，请检查登录权限或反向代理设置')
  }
  return data
}

export class RouterClient {
  constructor(address) {
    this.baseUrl = normalizeRouterAddress(address)
    this.session = ''
    this.username = ''
    this.requestId = 1
  }

  async request(data) {
    let response
    try {
      response = await CapacitorHttp.post({
        url: this.baseUrl + '/ubus',
        data,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        connectTimeout: 8000,
        readTimeout: 12000
      })
    } catch (e) {
      throw new Error('无法连接 ' + this.baseUrl + '：' + shortError(e))
    }
    return parseResponse(response)
  }

  envelope(object, method, args = {}, session = this.session, id = ++this.requestId) {
    return { jsonrpc: '2.0', id, method: 'call', params: [session || NULL_SESSION, object, method, args] }
  }

  unpack(payload, allowUnavailable = false) {
    const result = payload?.result
    if (!Array.isArray(result) || result[0] !== 0) {
      const code = Array.isArray(result) ? result[0] : payload?.error?.code
      if (allowUnavailable) return null
      if (code === 6 || code === 9) throw new Error('RPC 没有权限或登录已失效（代码 ' + code + '）')
      throw new Error('RPC 调用失败（代码 ' + String(code ?? '未知') + '）')
    }
    return result[1] ?? {}
  }

  async login(username, password) {
    const user = String(username || 'root').trim()
    if (!user || !password) throw new Error('请输入用户名和密码')
    const result = await this.request(this.envelope('session', 'login',
      { username: user, password, timeout: 1800 }, NULL_SESSION))
    const data = this.unpack(result)
    if (!data.ubus_rpc_session) throw new Error('路由器未返回登录会话，请确认账号、密码及 rpcd 设置')
    this.session = data.ubus_rpc_session
    this.username = user
    return data
  }

  async call(object, method, args = {}, optional = false) {
    if (!this.session) throw new Error('尚未登录')
    return this.unpack(await this.request(this.envelope(object, method, args)), optional)
  }

  async batch(entries) {
    if (!this.session) throw new Error('尚未登录')
    const jobs = entries.map((entry, index) =>
      this.envelope(entry[0], entry[1], entry[2] || {}, this.session, 2000 + index))
    const data = await this.request(jobs)
    if (!Array.isArray(data)) throw new Error('路由器不支持批量 RPC 查询')
    const byId = new Map(data.map(item => [Number(item.id), item]))
    return entries.map((_entry, index) => this.unpack(byId.get(2000 + index), true))
  }

  logout() {
    this.session = ''
    this.username = ''
  }
}

export const DASHBOARD_REQUESTS = [
  ['system', 'board'],
  ['system', 'info'],
  ['luci', 'getCPUUsage'],
  ['luci', 'getTempInfo'],
  ['luci.internet-detector', 'UIPoll'],
  ['network.interface', 'dump'],
  ['luci', 'getOnlineUsers'],
  ['file', 'read', { path: '/proc/sys/net/netfilter/nf_conntrack_count' }],
  ['file', 'read', { path: '/proc/sys/net/netfilter/nf_conntrack_max' }],
  ['luci.xxwrt-telemetry', 'GetTemperature'],
  ['file', 'read', { path: '/sys/class/thermal/thermal_zone0/temp' }]
]

export function formatBytes(input) {
  const number = Number(input) || 0
  if (number < 1024) return Math.round(number) + ' B'
  const power = Math.min(4, Math.floor(Math.log(number) / Math.log(1024)))
  return (number / Math.pow(1024, power)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][power]
}

export function parseTemperature(value, depth = 0) {
  if (depth > 5 || value == null) return null
  if (typeof value === 'object') {
    for (const key of ['tempinfo', 'temperature', 'cpu_temperature', 'cpu_temp', 'temp', 'value', 'data', 'result']) {
      if (value[key] != null) {
        const v = parseTemperature(value[key], depth + 1)
        if (v != null) return v
      }
    }
    return null
  }
  const raw = String(value)
  const match = raw.match(/(-?\d+(?:\.\d+)?)/)
  if (!match) return null
  let val = Number(match[1])
  if (Math.abs(val) > 1000) val /= 1000
  if (val < -30 || val > 125) return null
  return Math.round(val) + '℃'
}

const NAMES = {
  netease_music: '网易云', chatgpt: 'ChatGPT', github: 'GitHub',
  youtube: 'YouTube', telegram: 'Telegram', baidu: 'Baidu',
  google: 'Google', internet: 'Internet'
}

export function parseDashboard(results) {
  const [board, info, cpu, temperature, detector, network, online, connCount, connMax, telemetry, thermal] = results
  const m = info?.memory || {}
  const totalMemory = Number(m.total) || 0
  const usedMemory = totalMemory - (Number(m.available) || 0)
  const memPercent = totalMemory ? Math.round((usedMemory / totalMemory) * 100) : null
  const connUsed = Number(connCount?.data)
  const connLimit = Number(connMax?.data)
  const cpuMatch = String(cpu?.cpuusage || '').match(/(\d+(?:\.\d+)?)%/)
  const interfaces = Array.isArray(network?.interface) ? network.interface : []
  const wan = interfaces.find(item => item.interface === 'wan') || {}
  const wan6 = interfaces.find(item => ['wan6', 'wan_6'].includes(item.interface)) || {}
  const lan = interfaces.find(item => item.interface === 'lan') || {}
  const instances = Array.isArray(detector?.instances) ? detector.instances : []
  const checks = instances.map((item, index) => ({
    id: String(item.instance || ('check-' + index)),
    name: NAMES[String(item.instance || '').toLowerCase()] || String(item.instance || '监测 ' + (index + 1)),
    state: Number(item.inet) === 0 ? 'up' : Number(item.inet) === -1 ? 'pending' : 'down'
  }))
  const uptimeSeconds = Number(info?.uptime) || 0
  const days = Math.floor(uptimeSeconds / 86400)
  const hours = Math.floor((uptimeSeconds % 86400) / 3600)
  const minutes = Math.floor((uptimeSeconds % 3600) / 60)
  const load = Array.isArray(info?.load) ? info.load.slice(0, 3).map(v => (Number(v) / 65536).toFixed(2)).join(' ') : '--'
  const temp = [temperature, telemetry, thermal].map(v => parseTemperature(v)).find(Boolean)
  const ipv4 = item => item?.['ipv4-address']?.[0]?.address || '--'
  const ipv6 = item => item?.['ipv6-address']?.[0]?.address || '--'
  return {
    board: {
      hostname: board?.hostname || '--',
      model: board?.model || board?.system || 'OpenWrt',
      version: board?.release?.description || '--',
      system: board?.system || '--',
      target: board?.release?.target || '--',
      kernel: board?.kernel || '--'
    },
    temperature: temp || '--',
    uptime: days + 'd ' + hours + 'h ' + minutes + 'm',
    localtime: info?.localtime ? new Date(info.localtime * 1000).toLocaleString('zh-CN', { hour12: false }) : '--',
    cpuPercent: cpuMatch ? Number(cpuMatch[1]) : null,
    load,
    memoryPercent: memPercent,
    memoryDetail: totalMemory ? formatBytes(usedMemory) + ' / ' + formatBytes(totalMemory) : '--',
    cachePercent: totalMemory ? Math.round((Number(m.cached || 0) / totalMemory) * 100) : null,
    cacheDetail: totalMemory ? formatBytes(m.cached) + ' / ' + formatBytes(totalMemory) : '--',
    connPercent: connLimit ? Math.round((connUsed / connLimit) * 100) : null,
    connDetail: Number.isFinite(connUsed) && connLimit ? connUsed + ' / ' + connLimit : '--',
    users: online?.onlineusers ?? '--',
    checks,
    detectorAvailable: Boolean(detector),
    interfaces,
    wanIp: ipv4(wan),
    wan6Ip: ipv6(wan6),
    lanIp: ipv4(lan),
    gateway: wan.route?.find(route => route.target === '0.0.0.0' && route.mask === 0)?.nexthop || '--',
    dns: (wan['dns-server'] || []).join(', ') || '--'
  }
}

export async function readDashboard(client) {
  const result = await client.batch(DASHBOARD_REQUESTS)
  if (!result[0] && !result[1]) throw new Error('无法读取系统信息，请确认登录权限')
  return parseDashboard(result)
}

export async function readClients(client) {
  const [leases, hints] = await client.batch([
    ['luci-rpc', 'getDHCPLeases'],
    ['luci-rpc', 'getHostHints']
  ])
  const names = hints || {}
  const data = (leases?.dhcp_leases || []).map(item => {
    const mac = String(item.macaddr || item.mac || '').toUpperCase()
    const hint = names[mac] || names[mac.toLowerCase()] || {}
    return {
      mac,
      ip: item.ipaddr || '--',
      name: item.hostname || hint.name || '未知设备',
      expires: item.expires,
      active: Number(item.expires) >= 0
    }
  })
  return { data, ipv6: leases?.dhcp6_leases || [], hintsAvailable: Boolean(hints), leasesAvailable: Boolean(leases) }
}

export async function readServices(client) {
  const data = await client.call('rc', 'list', {}, true)
  return { available: Boolean(data), services: data ? Object.entries(data).map(([name, state]) => ({
    name, enabled: Boolean(state?.enabled), running: Boolean(state?.running),
    start: state?.start ?? null
  })).sort((a, b) => a.name.localeCompare(b.name)) : [] }
}


/**
 * Read-only equivalents for main-branch Processes / Startup / Routes pages.
 * Fail closed when a QWRT build does not expose the optional method.
 */
export async function readProcessList(client) {
  const result = await client.call('luci', 'getProcessList', {}, true)
  const items = Array.isArray(result) ? result :
    Array.isArray(result?.result) ? result.result :
    Array.isArray(result?.processes) ? result.processes :
    Array.isArray(result?.data) ? result.data : []
  return {
    available: result != null,
    processes: items.map(p => ({
      pid: String(p.pid ?? p.PID ?? '--'),
      user: String(p.user ?? p.USER ?? '--'),
      cpu: String(p.cpu ?? p['%CPU'] ?? p.cpu_percent ?? '--'),
      memory: String(p.mem ?? p['%MEM'] ?? p.memory ?? '--'),
      command: String(p.COMMAND ?? p.command ?? p.cmd ?? p.name ?? '--')
    })).slice(0, 300)
  }
}

export async function readRouteConfig(client) {
  const config = await client.call('uci', 'get', { config: 'network' }, true)
  const values = config?.values && typeof config.values === 'object' ? config.values : null
  const entries = values ? Object.entries(values)
    .filter(([, v]) => v && ['route', 'route6'].includes(v['.type']))
    .map(([section, v]) => ({
      section,
      type: v['.type'],
      interface: String(v.interface ?? '--'),
      target: String(v.target ?? '--'),
      gateway: String(v.gateway ?? '--'),
      metric: String(v.metric ?? '--')
    })) : []
  return { available: Boolean(values), routes: entries }
}


const MAC_PATTERN = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i

/** Main branch: luci.wol.stat + uci.get(luci-wol) + host hints. */
export async function readWolDevices(client) {
  const [stat, config, hints, nics] = await client.batch([
    ['luci.wol', 'stat'],
    ['uci', 'get', { config: 'luci-wol' }],
    ['luci-rpc', 'getHostHints'],
    ['network.device', 'status']
  ])
  const values = config?.values || {}
  const targets = Object.entries(values)
    .filter(([, item]) => item && item['.type'] === 'target')
    .map(([section, item]) => ({
      id: String(item['.name'] || section),
      name: String(item.name || '未命名设备'),
      mac: String(item.mac || '').toUpperCase(),
      iface: String(item.iface || ''),
      broadcast: String(item.broadcast || '0') === '1'
    }))
  const available = Boolean(stat?.etherwake || stat?.wakeonlan)
  const tool = stat?.etherwake ? '/usr/bin/etherwake' : stat?.wakeonlan ? '/usr/bin/wakeonlan' : ''
  const interfaces = Array.isArray(nics) ? nics.map(n => n.name).filter(Boolean)
    : Object.keys(nics || {}).filter(n => n !== 'lo')
  const known = Object.entries(hints || {}).map(([mac, item]) => ({
    name: String(item?.name || '未知设备'),
    mac: mac.toUpperCase(),
    ip: item?.ipaddrs?.[0] || ''
  })).filter(item => MAC_PATTERN.test(item.mac))
  return { available, tool, targets, interfaces, known }
}

/** Only execute the known WOL binary reported by the original LuCI plugin. */
export async function wakeWolDevice(client, item) {
  const mac = String(item?.mac || '').toUpperCase()
  if (!MAC_PATTERN.test(mac)) throw new Error('MAC 地址格式不正确')
  const data = await readWolDevices(client)
  if (!data.available || !['/usr/bin/etherwake', '/usr/bin/wakeonlan'].includes(data.tool)) {
    throw new Error('QWRT 尚未安装 WOL 服务或无权限')
  }
  const args = []
  if (data.tool.endsWith('etherwake')) {
    args.push('-D')
    if (item.iface && data.interfaces.includes(item.iface)) args.push('-i', item.iface)
    if (item.broadcast) args.push('-b')
  }
  args.push(mac)
  const result = await client.call('luci.wol', 'exec', { name: data.tool, args })
  if (Number(result?.code ?? 0) !== 0) throw new Error('WOL 命令失败：' + (result?.stderr || result?.code))
  return result
}

export async function saveWolTarget(client, item) {
  const mac = String(item.mac || '').trim().toUpperCase()
  if (!MAC_PATTERN.test(mac)) throw new Error('MAC 地址格式不正确')
  const name = String(item.name || '').trim()
  if (!name || name.length > 64) throw new Error('请输入长度不超过 64 字的设备名称')
  const iface = String(item.iface || '')
  if (iface && !/^[a-zA-Z0-9_.:@-]{1,40}$/.test(iface)) throw new Error('网卡接口名无效')
  const existing = await readWolDevices(client)
  if (!existing.available) throw new Error('QWRT 缺少网络唤醒组件')
  try {
    await client.call('uci', 'add', { config: 'luci-wol', type: 'target',
      values: { name, mac, iface, broadcast: item.broadcast ? '1' : '0' } })
    await client.call('uci', 'commit', { config: 'luci-wol' })
  } catch (error) {
    await client.call('uci', 'revert', { config: 'luci-wol' }, true).catch(() => {})
    throw error
  }
}

export async function removeWolTarget(client, section) {
  const data = await readWolDevices(client)
  if (!data.targets.some(t => t.id === section)) throw new Error('唤醒设备不存在')
  try {
    await client.call('uci', 'delete', { config: 'luci-wol', section })
    await client.call('uci', 'commit', { config: 'luci-wol' })
  } catch (error) {
    await client.call('uci', 'revert', { config: 'luci-wol' }, true).catch(() => {})
    throw error
  }
}

export async function readParentalSettings(client) {
  const [base, status, advanced, rules, time, users] = await client.batch([
    ['appfilter', 'get_app_filter_base'],
    ['appfilter', 'get_oaf_status'],
    ['appfilter', 'get_app_filter_adv'],
    ['appfilter', 'get_app_filter'],
    ['appfilter', 'get_app_filter_time'],
    ['appfilter', 'get_all_users', { flag: 3 }]
  ])
  return {
    available: Boolean(base?.data || status?.data),
    base: base?.data || {},
    status: status?.data || {},
    advanced: advanced?.data || {},
    selectedRules: Array.isArray(rules?.app_list) ? rules.app_list : [],
    time: time?.data || {},
    users: Array.isArray(users?.data?.list) ? users.data.list : []
  }
}

export async function saveParentalBase(client, settings) {
  const values = {
    enable: settings.enable ? 1 : 0,
    record_enable: settings.record_enable ? 1 : 0,
    work_mode: Number(settings.work_mode)
  }
  if (![0, 1].includes(values.enable) || ![0, 1].includes(values.record_enable) ||
      !Number.isInteger(values.work_mode) || values.work_mode < 0 || values.work_mode > 3) {
    throw new Error('家长控制参数不合法')
  }
  return client.call('appfilter', 'set_app_filter_base', values)
}

export async function readRuntimeRoutes(client) {
  // Matches the main branch, fixed read-only iproute2 command; no user command.
  const response = await client.call('file', 'exec', {
    command: '/sbin/ip',
    params: ['-4', 'route', 'show', 'table', 'all'],
    env: null
  }, true)
  return {
    available: !!response && typeof response.stdout === 'string',
    lines: String(response?.stdout || '').split(/\r?\n/).filter(Boolean).slice(0, 500)
  }
}

export async function readNetworkHardware(client) {
  const [wired, wireless] = await client.batch([
    ['luci-rpc', 'getNetworkDevices'],
    ['luci-rpc', 'getWirelessDevices']
  ])
  const value = data => data && typeof data === 'object' ? Object.entries(data).map(([name, v]) => ({
    name, up: Boolean(v?.up ?? v?.link), mac: v?.macaddr || v?.mac || '--',
    type: String(v?.type || v?.device || '--')
  })).slice(0, 200) : []
  return {
    wiredAvailable: !!wired, wirelessAvailable: !!wireless,
    wired: value(wired), wireless: value(wireless)
  }
}
