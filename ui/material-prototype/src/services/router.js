import { macFromDuid, normalizeMac } from './deviceIdentity.js'
import { formatRouterUptime } from './routerUptime.js'
import { extractLuciCookie, describeLuciHttpFailure, isSsrUpgradeEndpoint, ssrLuciReadTimeout } from './luciHttp.js'
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core'
const RouterTlsHttp = registerPlugin('RouterTlsHttp')

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
  constructor(address, { ignoreTlsErrors = false } = {}) {
    this.baseUrl = normalizeRouterAddress(address)
    this.ignoreTlsErrors = Boolean(ignoreTlsErrors && this.baseUrl.startsWith('https://'))
    this.session = ''
    this.username = ''
    this.requestId = 1
    this.luciCookie = ''
    this.luciAuthTask = null
    this.luciLoginStatus = ''
  }

  async httpRequest(method, options) {
    if (this.ignoreTlsErrors && Capacitor.isNativePlatform()) {
      // Per-request opt-in: never change the global Android TLS trust store.
      return RouterTlsHttp.request({ ...options, method })
    }
    return method === 'GET' ? CapacitorHttp.get(options) : CapacitorHttp.post(options)
  }

  async request(data) {
    let response
    try {
      response = await this.httpRequest('POST', {
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
    // LuCI's authenticated CGI routes are separate from /ubus login.
    // Authenticate to the SAME configured router using the same credentials
    // once, in memory only. Never persist password or LuCI cookie.
    this.luciAuthTask = Capacitor.isNativePlatform()
      ? this.setupLuciSession(user, password).catch(() => false) : Promise.resolve(false)
    return data
  }

  async setupLuciSession(username, password) {
    this.luciCookie = ''
    this.luciLoginStatus = ''
    try {
      // The LuCI admin route is protected by the login dispatcher. Posting
      // to /cgi-bin/luci/ can redirect before issuing a session cookie.
      const response = await this.httpRequest('POST', {
        url: this.baseUrl + '/cgi-bin/luci/admin',
        data: 'luci_username=' + encodeURIComponent(username) +
          '&luci_password=' + encodeURIComponent(password),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        connectTimeout: 3500, readTimeout: 7000, disableRedirects: true
      })
      this.luciCookie = extractLuciCookie(response.headers)
      if (this.luciCookie) return true
      // Some native stacks retain HTTP cookies without exposing Set-Cookie;
      // allow the subsequent request to use that cookie jar, if available.
      this.luciLoginStatus = 'LuCI 登录未返回可读取的会话 Cookie（HTTP ' + response.status + '）'
      return false
    } catch (error) {
      this.luciLoginStatus = 'LuCI 登录连接失败：' + shortError(error)
      return false
    }
  }

  /**
   * Report concrete failure modes rather than turning every HTTP/HTML/error
   * response into null. Cookies come only from a real LuCI authentication;
   * never impersonate LuCI by manufacturing a cookie from the ubus session.
   */
  async luciGetDetailed(path, params = {}) {
    if (!this.session) return { data: null, reason: '尚未登录路由器' }
    if (!/^\/cgi-bin\/luci\/admin\/services\/shadowsocksr\/[a-z_]+$/.test(path))
      return { data: null, reason: '不允许访问此 LuCI 接口' }
    if (this.luciAuthTask) await this.luciAuthTask
    const query = new URLSearchParams(params).toString()
    try {
      const headers = { Accept: 'application/json' }
      // A native HTTP cookie jar may already have the LuCI session cookie.
      if (this.luciCookie) headers.Cookie = this.luciCookie
      const response = await this.httpRequest('GET', {
        url: this.baseUrl + path + (query ? '?' + query : ''),
        headers,
        connectTimeout: 5000, readTimeout: ssrLuciReadTimeout(path), disableRedirects: true
      })
      if (response.status !== 200) {
        const note = this.luciLoginStatus && [401, 403, 301, 302, 303].includes(response.status)
          ? '；' + this.luciLoginStatus : ''
        return { data: null, status: response.status,
          // A gateway error may arrive while a synchronous install is still running.
          indeterminate: isSsrUpgradeEndpoint(path) && response.status >= 500,
          reason: describeLuciHttpFailure(response.status, path) + note }
      }
      let content = response.data
      if (typeof content === 'string') {
        try { content = JSON.parse(content) }
        catch (_) {
          return { data: null, status: 200,
            indeterminate: isSsrUpgradeEndpoint(path),
            reason: 'LuCI 返回 HTML/非 JSON 内容，可能是登录页面、插件接口不兼容或安装期间服务重启' }
        }
      }
      if (!content || typeof content !== 'object' || Array.isArray(content))
        return { data: null, status: 200,
          indeterminate: isSsrUpgradeEndpoint(path), reason: 'LuCI 返回的数据格式不正确' }
      return { data: content, status: 200, reason: '' }
    } catch (error) {
      // A timed-out GET may still be running on the router. Never infer that
      // the install was cancelled, and never automatically launch it again.
      const upgrade = isSsrUpgradeEndpoint(path)
      return { data: null, indeterminate: upgrade,
        reason: 'LuCI 请求连接失败：' + shortError(error) +
          (upgrade ? '。路由器可能仍在执行安装，请稍后核对本地版本，勿重复更新' : '') }
    }
  }

  async luciGet(path, params = {}) {
    const response = await this.luciGetDetailed(path, params)
    return response.data
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
    this.luciCookie = ''
    this.luciAuthTask = null
  }
}

/**
 * Discover optional applications after connecting and on Apps refresh.
 * A disabled service still counts as installed. Built-in management pages
 * are always shown by App.vue. Unreadable configuration is not an absence
 * signal, so preserve those entries when the RPC capability is ambiguous.
 */
export async function readInstalledRouterApps(client) {
  const configs = ['shadowsocksr', 'wechatpush', 'openclash', 'zerotier',
    'internet-detector', 'luci', 'luci-wol', 'lucky', 'vlmcsd']
  const entries = [
    ...configs.map(config => ['uci', 'get', { config }]),
    ['rc', 'list'],
    ['luci.wol', 'stat'],
    ['appfilter', 'get_app_filter_base'],
    ['luci.internet-detector', 'UIPoll'],
    ['luci.carbon_update', 'status']
  ]
  const [ssr, wechat, clash, zt, detector, luci, wolConfig, lucky, vlmcsd,
    services, wolStat, parental, detectorPoll, carbonStatus] = await client.batch(entries)
  const readable = config => Boolean(config?.values && typeof config.values === 'object' &&
    Object.keys(config.values).length)
  const hasService = name => services != null && Object.hasOwn(services, name)
  const themeOptions = Object.values(luci?.values || {})
  const hasCarbon = themeOptions.some(item => {
    if (!item || typeof item !== 'object') return false
    return Object.entries(item).some(([key, value]) =>
      /carbon/i.test(key) || /carbon/i.test(String(value || '')))
  })
  const map = {
    ssr: readable(ssr) || hasService('shadowsocksr'),
    lucky: readable(lucky) || hasService('lucky'),
    vlmcsd: readable(vlmcsd) || hasService('vlmcsd'),
    wechatpush: readable(wechat) || hasService('wechatpush'),
    openclash: readable(clash) || hasService('openclash'),
    detector: readable(detector) || hasService('internet-detector') || detectorPoll != null,
    carbon: hasCarbon || carbonStatus != null,
    zerotier: readable(zt) || hasService('zerotier'),
    wol: readable(wolConfig) || Boolean(wolStat?.etherwake || wolStat?.wakeonlan),
    parental: parental != null
  }
  // If both the main configuration and the rc registry are inaccessible,
  // absence cannot be established: avoid hiding a possibly installed app.
  const uncertain = services == null
  const installed = Object.fromEntries(Object.entries(map).map(([key, found]) =>
    [key, found || (uncertain && (
      key === 'ssr' && ssr == null ||
      key === 'lucky' && lucky == null ||
      key === 'vlmcsd' && vlmcsd == null ||
      key === 'wechatpush' && wechat == null ||
      key === 'openclash' && clash == null ||
      key === 'zerotier' && zt == null ||
      key === 'detector' && detector == null ||
      key === 'carbon' && luci == null ||
      key === 'wol' && wolStat == null ||
      key === 'parental' && parental == null
    ))]))
  return installed
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
  // netifd reports the remaining valid lifetime in seconds. An IPv6-PD
  // prefix is preferred; fall back to the upstream address if PD is missing.
  const lifetime = [...(wan6['ipv6-prefix'] || []), ...(wan6['ipv6-address'] || [])]
    .map(item => Number(item?.valid))
    .find(value => Number.isFinite(value) && value >= 0 && value < 4294967295)
  const instances = Array.isArray(detector?.instances) ? detector.instances : []
  const checks = instances.map((item, index) => ({
    id: String(item.instance || ('check-' + index)),
    name: NAMES[String(item.instance || '').toLowerCase()] || String(item.instance || '监测 ' + (index + 1)),
    state: Number(item.inet) === 0 ? 'up' : Number(item.inet) === -1 ? 'pending' : 'down'
  }))
  const uptimeSeconds = info?.uptime
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
    uptime: formatRouterUptime(uptimeSeconds),
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
    wan6ValidSeconds: lifetime ?? null,
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

/**
 * A DHCP lease or a getHostHints IP is historical information, not proof
 * that the device is online. Only a REACHABLE neighbour or an associated
 * Wi-Fi station is affirmative evidence. Missing and STALE entries are unknown.
 */
function parseNeighborTables(responses) {
  const byIp = new Map()
  const byMac = new Map()
  let available = false
  for (const response of responses) {
    if (typeof response?.stdout !== 'string' || Number(response?.code ?? 0) !== 0) continue
    available = true
    for (const line of response.stdout.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 3 || !parts.includes('dev')) continue
      const state = parts[parts.length - 1]?.toUpperCase()
      if (!['REACHABLE', 'STALE', 'DELAY', 'PROBE', 'FAILED', 'INCOMPLETE', 'PERMANENT', 'NOARP'].includes(state)) continue
      const status = state === 'REACHABLE' ? 'online' : state === 'FAILED' ? 'offline' : 'unknown'
      const macIndex = parts.indexOf('lladdr')
      const mac = macIndex >= 0 ? normalizeMac(parts[macIndex + 1]).toUpperCase() : ''
      // A FAILED entry often omits lladdr, so matching by IP is essential.
      byIp.set(parts[0].split('%')[0].toLowerCase(), status)
      if (mac) {
        const prior = byMac.get(mac)
        if (status === 'online' || !prior || (prior === 'offline' && status === 'unknown')) {
          byMac.set(mac, status)
        }
      }
    }
  }
  return { available, byIp, byMac }
}

function neighborStatus(table, mac, ...addresses) {
  const states = addresses.flatMap(address => {
    const value = table.byIp.get(String(address || '').toLowerCase())
    return value ? [value] : []
  })
  const byMac = table.byMac.get(String(mac || '').toUpperCase())
  if (byMac) states.push(byMac)
  if (states.includes('online')) return 'online'
  if (states.includes('unknown')) return 'unknown'
  return states.includes('offline') ? 'offline' : 'unknown'
}

function validIPv4(address) {
  const parts = String(address || '').split('.')
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

const NEIGHBOR_REQUESTS = [
  ['file', 'exec', { command: '/sbin/ip', params: ['-4', 'neigh', 'show'], env: null }],
  ['file', 'exec', { command: '/sbin/ip', params: ['-6', 'neigh', 'show'], env: null }]
]

/**
 * Prefer the active WeChatPush monitor's online/offline evidence when present.
 * It actively probes devices and can enrich the list using MiWiFi Mesh info.
 * Never use an old cache while the WeChatPush service is stopped.
 */
function parseWechatPushDevices(file, services, procd) {
  const byMac = new Map()
  const byIp = new Map()
  // rc.list often reports autostart but not live process status. Prefer the
  // named procd instance status, and do not reuse a cache from a stopped service.
  const instances = procd?.wechatpush?.instances || {}
  const procdRunning = Object.values(instances).some(x => x?.running === true)
  const rcRunning = services?.wechatpush?.running === true
  if ((!procdRunning && !rcRunning) || typeof file?.data !== 'string' || file.data.length > 524288) {
    return { byMac, byIp }
  }
  try {
    const raw = JSON.parse(file.data)
    if (!Array.isArray(raw?.devices)) return { byMac, byIp }
    for (const item of raw.devices.slice(0, 1024)) {
      const mac = normalizeMac(item.mac || '').toUpperCase()
      const ip = String(item.ip || '').trim()
      if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) continue
      const status = ['online', 'offline', 'unknown'].includes(item.status) ? item.status : ''
      const candidateName = String(item.name || '').trim()
      const name = candidateName && !['unknown', 'null', mac.toLowerCase(), mac].includes(candidateName.toLowerCase())
        ? candidateName : ''
      const entry = { mac, ip, name, status }
      const previous = byMac.get(mac)
      // Prefer a recent online record to a duplicate stale record.
      if (!previous || (previous.status !== 'online' && status === 'online')) byMac.set(mac, entry)
      if (ip && validIPv4(ip) && !byIp.has(ip)) byIp.set(ip, entry)
    }
  } catch (_) { /* Missing or partially written monitor cache is not evidence. */ }
  return { byMac, byIp }
}

function monitoredClient(monitor, mac, ip) {
  const normalized = String(mac || '').toUpperCase()
  if (monitor.byMac.has(normalized)) return monitor.byMac.get(normalized)
  const found = monitor.byIp.get(String(ip || ''))
  // IP fallback is useful when a DHCPv6 DUID lacks an Ethernet MAC.
  return found && (!normalized || !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalized)) ? found : null
}

function preferredClientStatus(monitored, neighbor) {
  // A live monitor record is authoritative for its matched device.
  // Only a missing or unverified monitor state falls back to ARP/NDP.
  return monitored?.status === 'online' || monitored?.status === 'offline'
    ? monitored.status : neighbor
}

export async function readClients(client) {
  const [leases, hints, ipv4Neighbors, ipv6Neighbors, wechatDevices, runningServices, wechatProcd] = await client.batch([
    ['luci-rpc', 'getDHCPLeases'],
    ['luci-rpc', 'getHostHints'],
    ...NEIGHBOR_REQUESTS,
    ['file', 'read', { path: '/tmp/wechatpush/devices.json' }],
    ['rc', 'list'],
    ['service', 'list', { name: 'wechatpush' }]
  ])
  let neighbors = parseNeighborTables([ipv4Neighbors, ipv6Neighbors])

  // Refresh the kernel ARP cache using bounded router-side IPv4 probes.
  // Never infer offline status from missing ICMP responses: devices may block
  // ping while still answering ARP. Read the resulting neighbour states.
  if (neighbors.available && Array.isArray(leases?.dhcp_leases)) {
    const ips = [...new Set(leases.dhcp_leases.map(item => item.ipaddr)
      .filter(validIPv4))]
      .filter(ip => neighbors.byIp.get(ip) !== 'online')
      .slice(0, 48)
    if (ips.length) {
      const ping = ip => client.call('file', 'exec', {
        command: '/bin/ping', params: ['-c', '1', '-W', '1', ip], env: null
      }, true).catch(() => null)
      // Check command permission first rather than sending many denied calls.
      const first = await ping(ips[0])
      if (first != null && Number(first.code ?? 0) !== 127) {
        let next = 1
        await Promise.all(Array.from({ length: Math.min(6, ips.length - 1) }, async () => {
          while (next < ips.length) await ping(ips[next++])
        }))
      }
      const fresh = await client.batch(NEIGHBOR_REQUESTS).catch(() => [])
      const refreshed = parseNeighborTables(fresh)
      if (refreshed.available) neighbors = refreshed
    }
  }

  const monitored = parseWechatPushDevices(wechatDevices, runningServices, wechatProcd)
  const names = hints || {}
  const lookupHint = mac => names[mac] || names[mac.toUpperCase()] || names[mac.toLowerCase()] || {}
  const data = (leases?.dhcp_leases || []).map(item => {
    const mac = normalizeMac(item.macaddr || item.mac).toUpperCase()
    const hint = lookupHint(mac)
    const ip = item.ipaddr || hint.ipaddrs?.[0] || '--'
    const ip6 = hint.ip6addrs?.[0] || ''
    const monitorDevice = monitoredClient(monitored, mac, ip)
    const state = preferredClientStatus(monitorDevice, neighborStatus(neighbors, mac, ip, ip6))
    return {
      mac, ip, ip6,
      name: monitorDevice?.name || item.hostname || hint.name || '',
      identityName: item.hostname || hint.name || '',
      expires: item.expires,
      active: Number(item.expires) > 0,
      online: state === 'online',
      onlineKnown: state !== 'unknown',
      source: 'dhcp4'
    }
  })
  const ipv6 = (leases?.dhcp6_leases || []).map(item => {
    const mac = normalizeMac(item.macaddr || item.mac) || macFromDuid(item.duid)
    const hint = lookupHint(mac)
    const ip = item.ip6addr || item.address || item.ip6addrs?.[0] || '--'
    const ip4 = hint.ipaddrs?.[0] || ''
    const monitorDevice = monitoredClient(monitored, mac, ip4)
    const state = preferredClientStatus(monitorDevice, neighborStatus(neighbors, mac, ip, ip4))
    return {
      ...item,
      mac: mac.toUpperCase(),
      name: monitorDevice?.name || item.hostname || hint.name || '',
      identityName: item.hostname || hint.name || '',
      ip, ip4,
      online: state === 'online',
      onlineKnown: state !== 'unknown',
      source: 'dhcp6'
    }
  })
  return {
    data, ipv6, hints,
    hintsAvailable: Boolean(hints),
    neighborsAvailable: neighbors.available,
    monitorAvailable: monitored.byMac.size > 0,
    leasesAvailable: Boolean(leases)
  }
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
  const processes = items.map(p => ({
    pid: String(p.PID ?? p.pid ?? '--'),
    user: String(p.USER ?? p.user ?? '--'),
    cpu: String(p['%CPU'] ?? p.cpu ?? p.cpu_percent ?? '--'),
    // Main-branch LuCI reports VSZ in kB and %MEM separately.
    memory: String(p.VSZ ?? p.vsz ?? p.mem ?? p.memory ?? '--'),
    memoryPercent: String(p['%MEM'] ?? p.memory_percent ?? '--'),
    status: String(p.STAT ?? p.stat ?? p.state ?? p.status ?? '--'),
    parentPid: String(p.PPID ?? p.ppid ?? '--'),
    command: String(p.COMMAND ?? p.command ?? p.cmd ?? p.name ?? '--')
  })).sort((a, b) => {
    const cpu = value => Number.parseFloat(String(value).replace('%', '')) || 0
    return cpu(b.cpu) - cpu(a.cpu)
  }).slice(0, 300)
  return { available: result != null, processes }
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
  const [stat, config, hints, nics, wechatDevices, services, wechatProcd] = await client.batch([
    ['luci.wol', 'stat'],
    ['uci', 'get', { config: 'luci-wol' }],
    ['luci-rpc', 'getHostHints'],
    ['network.device', 'status'],
    ['file', 'read', { path: '/tmp/wechatpush/devices.json' }],
    ['rc', 'list'],
    ['service', 'list', { name: 'wechatpush' }]
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
  const statusKnown = Boolean(stat && typeof stat === 'object' &&
    (Object.hasOwn(stat, 'etherwake') || Object.hasOwn(stat, 'wakeonlan')))
  const available = Boolean(stat?.etherwake || stat?.wakeonlan)
  const tool = stat?.etherwake ? '/usr/bin/etherwake' : stat?.wakeonlan ? '/usr/bin/wakeonlan' : ''
  const interfaces = Array.isArray(nics) ? nics.map(n => n.name).filter(Boolean)
    : Object.keys(nics || {}).filter(n => n !== 'lo')
  // Match by MAC, not IP, so a DHCP address change cannot attribute the
  // wrong WeChatPush display name to another device.
  const monitor = parseWechatPushDevices(wechatDevices, services, wechatProcd)
  const known = Object.entries(hints || {}).map(([mac, item]) => {
    const normalizedMac = normalizeMac(mac).toUpperCase()
    const monitored = monitor.byMac.get(normalizedMac)
    return {
      name: monitored?.name || String(item?.name || '未知设备'),
      mac: normalizedMac, ip: item?.ipaddrs?.[0] || monitored?.ip || ''
    }
  }).filter(item => MAC_PATTERN.test(item.mac))
  const knownMacs = new Set(known.map(item => item.mac))
  // Online WeChatPush devices that are not yet present in host hints can be
  // woken from the same list; never pull stale offline records into it.
  for (const [mac, device] of monitor.byMac) {
    if (device.status === 'online' && !knownMacs.has(mac)) {
      known.push({ name: device.name || '未知设备', mac, ip: device.ip || '' })
    }
  }
  const savedMacs = new Set(targets.map(item => item.mac))
  const neighbors = known.filter(item => !savedMacs.has(item.mac))
  return { available, statusKnown, tool, targets, interfaces, known, neighbors }
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
      !Number.isInteger(values.work_mode) || ![0, 1].includes(values.work_mode)) {
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
  const value = data => data && typeof data === 'object' ? Object.entries(data).map(([name, v]) => {
    // QWRT getNetworkDevices follows the main app's stats shape;
    // network.device status may instead return statistics.
    const stats = v?.statistics || v?.stats || {}
    return {
    name, up: Boolean(v?.up ?? v?.link), mac: v?.macaddr || v?.mac || '--',
    type: String(v?.type || v?.device || '--'),
    mtu: v?.mtu ?? null,
    speed: v?.speed ?? v?.bitrate ?? null,
    ports: Array.isArray(v?.ports) ? v.ports : [],
    rxBytes: stats.rx_bytes ?? stats.rxBytes ?? v?.rx_bytes ?? null,
    txBytes: stats.tx_bytes ?? stats.txBytes ?? v?.tx_bytes ?? null,
    rxPackets: stats.rx_packets ?? v?.rx_packets ?? null,
    txPackets: stats.tx_packets ?? v?.tx_packets ?? null,
    ssid: v?.ssid || null, bssid: v?.bssid || null,
    channel: v?.channel ?? null, band: v?.band ?? null,
    encryption: v?.encryption?.description || v?.encryption || null,
    signal: v?.signal ?? null, mode: v?.mode || null
    }
  }).slice(0, 200) : []
  return {
    wiredAvailable: !!wired, wirelessAvailable: !!wireless,
    wired: value(wired), wireless: value(wireless)
  }
}
