import { normalizeMac } from './deviceIdentity.js'

// Only standard UCI backends are touched. No shell interpolation or arbitrary commands.
const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/
const SECTION_RE = /^[A-Za-z0-9_]+$/
const RATE_MAX = 10000

export function ipv4Number(value) {
  const parts = String(value || '').split('.')
  if (parts.length !== 4 || !parts.every(x => /^(0|[1-9]\d{0,2})$/.test(x) && Number(x) <= 255)) return null
  return parts.reduce((n, x) => ((n * 256) + Number(x)) >>> 0, 0)
}

function validMac(value) {
  const mac = normalizeMac(value).toUpperCase()
  if (!MAC_RE.test(mac)) throw new Error('终端缺少有效的 MAC 地址，无法安全地绑定配置')
  return mac
}

function configSections(response, type) {
  return Object.entries(response?.values || {})
    .filter(([id, value]) => SECTION_RE.test(id) && value && value['.type'] === type)
    .map(([id, value]) => ({ id, ...value }))
}

function macMatches(setting, mac) {
  const values = Array.isArray(setting) ? setting : String(setting || '').split(/[\s,]+/)
  return values.some(value => normalizeMac(value).toUpperCase() === mac)
}

function subnetMatches(ip, network) {
  const bits = Number(network?.mask)
  const base = ipv4Number(network?.address)
  if (base == null || !Number.isInteger(bits) || bits < 1 || bits > 32) return false
  const mask = bits === 32 ? 0xFFFFFFFF : (0xFFFFFFFF << (32 - bits)) >>> 0
  return ((ip & mask) >>> 0) === ((base & mask) >>> 0)
}

function knownNetworks(interfaces) {
  return (interfaces?.interface || []).flatMap(item => (item['ipv4-address'] || [])
    .filter(a => ipv4Number(a.address) != null && Number.isInteger(Number(a.mask)))
    .map(a => ({ address: a.address, mask: Number(a.mask), interface: item.interface })))
}

function assertUsableIP(ip, previous, settings) {
  const n = ipv4Number(ip)
  if (n == null || n === 0 || n === 0xFFFFFFFF || (n >>> 24) === 127 || (n >>> 28) === 14) {
    throw new Error('请输入有效的 IPv4 地址')
  }
  const networks = settings.networks || []
  if (!networks.length) throw new Error('无法获取局域网掩码，请先在路由器 Web 管理页面确认 IP 网段')
  const before = ipv4Number(previous)
  const ownNetwork = before == null ? null : networks.find(net => subnetMatches(before, net))
  const relevant = ownNetwork ? [ownNetwork] : networks.filter(net => !/^(wan|wan6|loopback)$/i.test(net.interface))
  if (relevant.length && !relevant.some(net => subnetMatches(n, net))) {
    throw new Error('静态 IP 必须处于终端所在的局域网网段')
  }
  for (const net of relevant) {
    if (!subnetMatches(n, net)) continue
    const addr = ipv4Number(net.address)
    const mask = net.mask === 32 ? 0xFFFFFFFF : (0xFFFFFFFF << (32 - net.mask)) >>> 0
    const broadcast = ((addr & mask) | (~mask >>> 0)) >>> 0
    if (n === addr || (net.mask <= 30 && (n === (addr & mask) || n === broadcast))) {
      throw new Error('不能绑定路由器网关、网络地址或广播地址')
    }
  }
  const ownMac = settings.mac
  if (settings.hosts.some(host => !macMatches(host.mac, ownMac) && host.ip === ip)) {
    throw new Error('该 IP 已被其他终端的静态租约占用')
  }
  if (settings.leases.some(lease => lease.mac !== ownMac && lease.ip === ip)) {
    throw new Error('该 IP 已被其他设备的 DHCP 租约占用')
  }
}

function currentRules(response, type, ip) {
  return configSections(response, type).filter(section => String(section.ip || section.ipaddr || section.target || '') === ip)
}

function rateValue(value, label) {
  if (value === '' || value == null) return null
  const raw = String(value).trim()
  if (!/^\d+$/.test(raw)) throw new Error(label + '只能输入整数 Mbps')
  const rate = Number(raw)
  if (!Number.isSafeInteger(rate) || rate < 1 || rate > RATE_MAX) {
    throw new Error(label + '范围为 1–' + RATE_MAX + ' Mbps；留空表示不限速')
  }
  return rate
}

function readableRates(response, backend, ip) {
  if (backend === 'nft-qos') {
    const asMbps = type => {
      const row = currentRules(response, type, ip)[0]
      if (!row) return null
      const rate = Number(row.rate)
      const factor = { bytes: 0.000008, kbytes: 0.008, mbytes: 8 }[row.unit] ?? 0.008
      return Number.isFinite(rate) ? Math.round(rate * factor * 1000) / 1000 : null
    }
    return { download: asMbps('download'), upload: asMbps('upload') }
  }
  const row = currentRules(response, 'device', ip)[0]
  return {
    download: row?.download && Number(row.download) > 0 ? Number(row.download) : null,
    upload: row?.upload && Number(row.upload) > 0 ? Number(row.upload) : null
  }
}


const HQOS_RATE_MAX = 10000000
const HQOS_CONNECTIONS_MAX = 65535

function hqosUnicastMac(raw) {
  const mac = validMac(raw).toLowerCase()
  if ((Number.parseInt(mac.slice(0, 2), 16) & 1) !== 0 || mac === '00:00:00:00:00:00')
    throw new Error('HQoS 只支持有效的单播 MAC 地址')
  return mac
}

export function parseHqosLimit(raw, limit, label) {
  const value = String(raw ?? '').trim()
  // HQoS LuCI and rpcd both use 0 for unlimited.
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error(label + '必须是非负整数')
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number > limit)
    throw new Error(label + '不能超过 ' + limit)
  return number
}

function hqosRpcResult(result, method) {
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error('HQoS ' + method + ' RPC 未返回有效数据；检查 rpcd ACL 授权')
  // HQoS status may legitimately contain an engine health "error" while
  // still returning enabled/supported/capabilities. Do not confuse it with
  // the rpcd wrapper { error: "Lua exception" }.
  if (method === 'status' && ('supported' in result || 'enabled' in result)) return result
  if (result.error) throw new Error('HQoS ' + method + ' 失败：' + String(result.error).slice(0, 450))
  return result
}

function validateHqosReadLimits(rule) {
  const get = (key, max) => {
    const n = Number(rule?.[key] ?? 0)
    return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : 0
  }
  return { upload: get('upload', HQOS_RATE_MAX),
    download: get('download', HQOS_RATE_MAX), connections: get('connections', HQOS_CONNECTIONS_MAX) }
}

async function readHqosState(client, mac) {
  const [statusResponse, ruleResponse] = await Promise.all([
    client.call('hqos', 'status'),
    client.call('hqos', 'get', { mac: hqosUnicastMac(mac) })
  ])
  const status = hqosRpcResult(statusResponse, 'status')
  const rule = hqosRpcResult(ruleResponse, 'get')
  const maxRate = Number(status.capabilities?.max_rate)
  const cap = Number.isSafeInteger(maxRate) && maxRate > 0
    ? Math.min(maxRate, HQOS_RATE_MAX) : 0
  return { status, rule, rates: validateHqosReadLimits(rule), maxRate: cap }
}


const HQOS_GLOBAL_BACKENDS = new Set(['auto', 'mtk-ppe', 'airoha-ppe', 'cpu'])
const HQOS_INTERFACE_RE = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/

function hqosGlobalValues(config) {
  const global = config?.values?.global
  if (!global || global['.type'] !== 'hqos')
    throw new Error('QWRT 未提供可写的 hqos.global 配置')
  return {
    enabled: String(global.enabled || '0'),
    backend: String(global.backend || 'auto'),
    interface: String(global.interface || 'br-lan')
  }
}

function hqosPendingChanges(result) {
  if (!result || typeof result !== 'object' || !('changes' in result))
    throw new Error('无法确认 HQoS 是否存在其他待应用修改，已取消写入')
  const changes = result.changes
  return Array.isArray(changes) ? changes.length > 0 :
    changes && typeof changes === 'object' ? Object.keys(changes).length > 0 : false
}

async function applyHqosGlobalService(client) {
  // Fixed binary and argv; never derive a shell command from user input.
  const result = await client.call('file', 'exec', {
    command: '/usr/sbin/hqos', params: ['apply'], env: null
  })
  if (!result || Number(result.code) !== 0) {
    throw new Error(String(result?.stderr || result?.stdout ||
      'HQoS apply 未返回成功结果').slice(-800))
  }
  const text = String(result.stdout || '').trim()
  if (text) {
    let parsed
    try { parsed = JSON.parse(text) } catch { throw new Error('HQoS apply 返回的状态不是合法 JSON') }
    hqosRpcResult(parsed, 'apply')
    if (parsed.error) throw new Error('HQoS apply 出错：' + parsed.error)
  }
}

export async function saveHqosGlobal(client, oldSettings, input) {
  if (!oldSettings?.hqosStatus?.installed || !oldSettings.hqosStatus.rpcReady)
    throw new Error('原生 HQoS RPC 不可用，无法修改全局设置')
  if (!HQOS_GLOBAL_BACKENDS.has(input.backend))
    throw new Error('无效的 HQoS 后端选项')
  const interfaceName = String(input.interface || '')
  if (!HQOS_INTERFACE_RE.test(interfaceName) ||
      (input.backend !== 'cpu' && input.backend !== 'auto' &&
        !['lan', 'br-lan'].includes(interfaceName))) {
    throw new Error('QoS 接口无效；硬件后端只能使用 LAN / br-lan')
  }
  const desired = {
    enabled: input.enabled ? '1' : '0',
    backend: input.backend,
    interface: interfaceName
  }
  const config = await client.call('uci', 'get', { config: 'hqos' })
  const original = hqosGlobalValues(config)
  // Refuse stale forms and concurrent LuCI edits. A commit must not include
  // unrelated pending UCI edits from the same rpcd session.
  if (Object.keys(original).some(key =>
    original[key] !== (key === 'enabled'
      ? (oldSettings.hqosStatus.enabled ? '1' : '0')
      : key === 'backend' ? oldSettings.hqosStatus.mode : oldSettings.hqosStatus.interface))) {
    throw new Error('HQoS 全局配置已变化，请刷新页面后重试')
  }
  const pending = await client.call('uci', 'changes', { config: 'hqos' })
  if (hqosPendingChanges(pending))
    throw new Error('HQoS 存在其他未提交的配置更改，请先在 Web 端处理')
  if (Object.keys(desired).every(key => original[key] === desired[key])) {
    return { applied: true, message: 'HQoS 全局设置没有变化' }
  }
  let committed = false
  try {
    await client.call('uci', 'set', { config: 'hqos', section: 'global', values: desired })
    await client.call('uci', 'commit', { config: 'hqos' })
    committed = true
    await applyHqosGlobalService(client)
    return { applied: true, message: 'HQoS 全局配置已保存并应用' }
  } catch (error) {
    if (!committed) {
      try { await client.call('uci', 'revert', { config: 'hqos' }) } catch (_) {}
      throw error
    }
    let restored = false
    try {
      await client.call('uci', 'set', { config: 'hqos', section: 'global', values: original })
      await client.call('uci', 'commit', { config: 'hqos' })
      await applyHqosGlobalService(client)
      restored = true
    } catch (_) {}
    throw new Error('HQoS 全局设置应用失败：' +
      String(error?.message || error) + (restored
        ? '；已恢复原始配置和服务' : '；自动恢复失败，请立即检查 Web 端 HQoS 配置'))
  }
}

export async function saveHqosClient(client, device, settings, input) {
  const mac = hqosUnicastMac(device?.mac)
  if (mac.toUpperCase() !== settings?.mac) throw new Error('终端 MAC 信息已变化，请重新打开')
  if (!settings?.hqosStatus?.installed || settings.backend !== 'hqos')
    throw new Error('该终端当前未选用 HQoS，禁止改写其他限速后端')
  const snapshot = await readHqosState(client, mac)
  if (snapshot.status.supported !== true || !snapshot.maxRate)
    throw new Error('HQoS 选用的内核/硬件后端不可用，请检查 QoS 后端配置')
  const upload = parseHqosLimit(input.upload, snapshot.maxRate, '上传限速（kbps）')
  const download = parseHqosLimit(input.download, snapshot.maxRate, '下载限速（kbps）')
  const connections = parseHqosLimit(input.connections, HQOS_CONNECTIONS_MAX, '并发连接数')
  const wantsLimit = upload > 0 || download > 0 || connections > 0
  if (wantsLimit && snapshot.status.enabled !== true && input.allowEnable !== true)
    throw new Error('保存非零 HQoS 限额会自动启用全局 HQoS，请明确确认后再操作')
  const known = settings.hqosRule
  if (known && (['upload', 'download', 'connections'].some(key =>
    Number(known[key] ?? 0) !== snapshot.rates[key]) ||
    Boolean(known.enabled) !== (snapshot.rule.enabled !== false) ||
    String(known.name || '') !== String(snapshot.rule.name || ''))) {
    throw new Error('HQoS 规则已被其他会话修改，请刷新终端信息后重新编辑')
  }
  const name = String(input.name || snapshot.rule.name || device.displayName ||
    device.name || mac).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 128)
  // manager.set performs validation, isolated UCI commit, live apply and
  // rollback on failure; do not duplicate its transactional logic here.
  const result = hqosRpcResult(await client.call('hqos', 'set', {
    mac, name, upload, download, connections
  }), 'set')
  return { applied: true, message: wantsLimit
    ? 'HQoS 客户端限额已保存并应用（按 MAC，IPv4/IPv6 共享）'
    : 'HQoS 客户端限额已清除；其他客户端规则保持不变', status: result }
}

export async function readTerminalSettings(client, device) {
  const mac = validMac(device?.mac)
  const ip = ipv4Number(device?.ip) == null ? '' : String(device.ip)
  const [dhcp, eqos, nftLimiter, nftQos, hqos, network, leases, services] = await client.batch([
    ['uci', 'get', { config: 'dhcp' }],
    ['uci', 'get', { config: 'eqos' }],
    ['uci', 'get', { config: 'nft-limiter' }],
    ['uci', 'get', { config: 'nft-qos' }],
    // QWRT's independent MAC-based HQoS backend: discover, never mutate.
    ['uci', 'get', { config: 'hqos' }],
    ['network.interface', 'dump'],
    ['luci-rpc', 'getDHCPLeases'],
    ['rc', 'list']
  ])
  if (!dhcp?.values) throw new Error('无法读取 DHCP 配置，请确认当前登录账号具有 UCI 读取权限')
  const hosts = configSections(dhcp, 'host').map(h => ({
    id: h.id, mac: String(h.mac || ''), ip: String(h.ip || ''), name: String(h.name || ''),
    mixed: Boolean(h.duid || h.hostid), raw: h
  }))
  const matchingHosts = hosts.filter(h => macMatches(h.mac, mac))
  if (matchingHosts.length > 1) throw new Error('此 MAC 存在多条 DHCP 静态租约，请先在 Web 管理页面清理重复配置')
  const host = matchingHosts[0] || null
  const leaseList = (leases?.dhcp_leases || []).map(item => ({
    mac: normalizeMac(item.macaddr || item.mac).toUpperCase(), ip: String(item.ipaddr || '')
  }))
  const nftDefault = configSections(nftQos, 'default')[0]
  const eqosGlobal = configSections(eqos, 'eqos')[0]
  const hqosGlobal = configSections(hqos, 'hqos')[0] || null
  const hqosStatus = hqosGlobal ? {
    installed: true, enabled: String(hqosGlobal.enabled) === '1',
    mode: String(hqosGlobal.backend || 'auto'),
    interface: String(hqosGlobal.interface || ''),
    rpcReady: false, supported: false, running: false, maxRate: 0,
    configuredClients: 0, effectiveBackend: '', error: ''
  } : { installed: false, enabled: false, mode: '', interface: '',
    rpcReady: false, supported: false, running: false, maxRate: 0,
    configuredClients: 0, effectiveBackend: '', error: '' }
  let hqosRule = null
  if (hqosStatus.installed) {
    try {
      const state = await readHqosState(client, mac)
      hqosRule = { ...state.rates, name: String(state.rule.name || ''),
        enabled: state.rule.enabled !== false }
      Object.assign(hqosStatus, {
        rpcReady: true, supported: state.status.supported === true,
        running: state.status.running === true, maxRate: state.maxRate,
        configuredClients: Number(state.status.configured_clients || 0),
        effectiveBackend: String(state.status.backend || ''),
        error: String(state.status.error || '')
      })
    } catch (error) {
      hqosStatus.error = String(error?.message || error).slice(0, 450)
    }
  }
  // Choose an already configured and enabled backend. Never silently switch
  // the router's traffic control subsystem or enable it behind the user's back.
  let backend = ''
  let reason = '未检测到受支持的单终端限速服务（nft-limiter / EQOS / nft-qos）'
  let qosConfig = null
  if (configSections(nftLimiter, 'nft-limiter').length) {
    if (services?.['nft-limiter']?.running === true) {
      backend = 'nft-limiter'
      qosConfig = nftLimiter
    } else reason = 'NFT Limiter 已安装但未运行，请先在路由器 Web 端启用'
  } else if (eqosGlobal) {
    if (String(eqosGlobal.enabled) === '1') {
      backend = 'eqos'
      qosConfig = eqos
    } else reason = 'EQOS 服务未启用，请先在 Web 管理端开启'
  } else if (nftDefault) {
    if (String(nftDefault.limit_enable) !== '1') reason = 'nft-qos 单终端限速未启用'
    else if (String(nftDefault.limit_type || 'static') !== 'static') reason = 'nft-qos 当前使用动态模式，不支持编辑单终端静态规则'
    else {
      backend = 'nft-qos'
      qosConfig = nftQos
    }
  }
  // HQoS is MAC-based and can coexist with older IP-based packages. If
  // globally enabled it wins; when disabled prefer an active legacy backend.
  if (hqosStatus.installed && (hqosStatus.enabled || !backend)) {
    if (hqosStatus.rpcReady && hqosStatus.supported && hqosStatus.maxRate > 0) {
      backend = 'hqos'
      reason = hqosStatus.enabled ? '' :
        'HQoS 当前未启用；保存非零规则会自动启用全局 HQoS，需二次确认'
    } else {
      backend = ''
      reason = hqosStatus.error
        ? '已安装 HQoS，但无法读取原生 RPC：' + hqosStatus.error
        : '已安装 HQoS，但所选硬件/CPU 后端不可用，请检查 Web 端后端设置'
    }
  }
  const activeIP = host?.ip && ipv4Number(host.ip) != null ? host.ip : ip
  const rates = backend === 'hqos'
    ? { upload: hqosRule?.upload ?? 0, download: hqosRule?.download ?? 0 }
    : backend && activeIP ? readableRates(qosConfig, backend, activeIP)
      : { upload: null, download: null }
  return {
    mac, ip, activeIP, host,
    hosts: hosts.map(h => ({ ...h, mac: macMatches(h.mac, mac) ? mac : normalizeMac(h.mac).toUpperCase() })),
    leases: leaseList, networks: knownNetworks(network),
    backend, backendLabel: { hqos: 'QWRT HQoS', 'nft-limiter': 'NFT Limiter',
      eqos: 'EQOS', 'nft-qos': 'NFT QoS' }[backend] || '',
    hqosStatus, hqosRule, connections: backend === 'hqos'
      ? hqosRule?.connections ?? 0 : null, reason, rates,
    staticEnabled: Boolean(host?.ip && ipv4Number(host.ip) != null),
    staticIP: host?.ip && ipv4Number(host.ip) != null ? host.ip : ip
  }
}

function assertDedicatedHost(host, mac) {
  if (!host) return
  const normalized = String(host.mac || '').split(/[\s,]+/).filter(Boolean)
  if (normalized.length > 1 && normalized.some(x => normalizeMac(x).toUpperCase() !== mac)) {
    throw new Error('静态租约同时绑定多个 MAC，为避免误改其他设备，请在 Web 端单独配置')
  }
}

async function persist(client, config, applyCommand, applyArgs = ['reload']) {
  await client.call('uci', 'commit', { config })
  // The configuration is already saved. The fixed command only activates
  // the selected service; never execute a command derived from user input.
  const applied = await client.call('file', 'exec', {
    command: applyCommand, params: applyArgs, env: null
  }, true).catch(() => null)
  const ok = applied && Number(applied.code) === 0
  return {
    applied: Boolean(ok),
    message: ok ? '已保存并应用到路由器' :
      '配置已保存，但无法确认服务已重新加载；请到路由器 Web 管理端应用配置'
  }
}

export async function saveTerminalStaticIP(client, device, settings, input) {
  const mac = validMac(device?.mac)
  if (mac !== settings?.mac) throw new Error('终端信息发生变化，请重新打开')
  const current = settings.host
  assertDedicatedHost(current, mac)
  const enabled = Boolean(input.enabled)
  const ip = String(input.ip || '').trim()
  const rawName = String(input.name || '').trim()
  const name = rawName || 'client-' + mac.replace(/:/g, '').slice(-6).toLowerCase()
  if (enabled && !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(name)) {
    throw new Error('DHCP 主机名只能包含英文、数字和连字符，且长度不超过 63 个字符')
  }
  if (enabled) assertUsableIP(ip, device.ip, settings)
  if (current && !SECTION_RE.test(current.id)) throw new Error('静态租约节名无效')
  if (!enabled && !current) return { applied: true, message: '当前终端未设置静态 IP' }
  try {
    if (!enabled) {
      if (current.mixed) {
        await client.call('uci', 'delete', { config: 'dhcp', section: current.id, option: 'ip' })
      } else {
        await client.call('uci', 'delete', { config: 'dhcp', section: current.id })
      }
    } else if (current) {
      await client.call('uci', 'set', { config: 'dhcp', section: current.id,
        values: { name: name || mac.replace(/:/g, '').toLowerCase(), mac, ip } })
    } else {
      await client.call('uci', 'add', { config: 'dhcp', type: 'host',
        values: { name: name || mac.replace(/:/g, '').toLowerCase(), mac, ip } })
    }
    return await persist(client, 'dhcp', '/etc/init.d/dnsmasq')
  } catch (error) {
    await client.call('uci', 'revert', { config: 'dhcp' }, true).catch(() => {})
    throw error
  }
}

export async function saveTerminalRateLimit(client, device, settings, input) {
  const mac = validMac(device?.mac)
  if (mac !== settings?.mac) throw new Error('终端信息发生变化，请重新打开')
  const backend = settings.backend
  if (backend === 'hqos') return saveHqosClient(client, device, settings, input)
  if (!['eqos', 'nft-qos', 'nft-limiter'].includes(backend)) {
    throw new Error(settings.reason || '当前路由器没有可用的终端限速服务')
  }
  const ip = settings.staticEnabled ? settings.staticIP : String(device.ip || '')
  if (ipv4Number(ip) == null) throw new Error('终端没有有效 IPv4 地址，无法按 IP 限速')
  const upload = rateValue(input.upload, '上传限速')
  const download = rateValue(input.download, '下载限速')
  if (backend === 'eqos' && ((upload == null) !== (download == null))) {
    throw new Error('EQOS 后端要求同时填写上传和下载限速；清空两项可取消限速')
  }
  const config = backend
  const latest = await client.call('uci', 'get', { config })
  const typeNames = backend === 'nft-qos' ? ['download', 'upload'] : ['device']
  // Make no changes to non-device or multi-IP rules.
  const oldRules = typeNames.flatMap(type => currentRules(latest, type, ip))
  if (backend === 'nft-limiter') {
    const conflicting = oldRules.some(row => row.mac && normalizeMac(row.mac).toUpperCase() !== mac)
    if (conflicting) throw new Error('该 IP 的限速规则绑定了其他 MAC，请先清理冲突')
  }
  // Quick editing must not destroy schedule, blocking or quota configuration.
  const simpleKeys = new Set(['id', '.name', '.type', '.index', 'ip', 'ipaddr',
    'target', 'mac', 'download', 'upload', 'enable', 'comment', 'hostname', 'rate', 'unit'])
  if (oldRules.some(row => Object.keys(row).some(key => !simpleKeys.has(key)))) {
    throw new Error('当前终端已有带时段/配额等高级规则，请使用路由器 Web 页面编辑，避免覆盖')
  }
  if (backend === 'nft-limiter' && oldRules.some(row => Array.isArray(row.target))) {
    throw new Error('当前终端处于多地址组合规则中，请使用路由器 Web 页面编辑')
  }
  const name = String(device.displayName || device.name || mac).slice(0, 63)
  try {
    for (const section of oldRules) {
      await client.call('uci', 'delete', { config, section: section.id })
    }
    if (backend === 'nft-qos') {
      for (const [type, rate] of [['download', download], ['upload', upload]]) {
        if (rate == null) continue
        await client.call('uci', 'add', { config, type,
          values: { ipaddr: ip, hostname: name, rate: String(rate * 125), unit: 'kbytes' } })
      }
    } else if (upload != null || download != null) {
      const values = backend === 'eqos'
        ? { ip, download: String(download), upload: String(upload), comment: name }
        : { target: ip, mac, enable: '1', download: String(download || 0),
          upload: String(upload || 0), comment: name }
      await client.call('uci', 'add', { config, type: 'device', values })
    }
    return await persist(client, config, '/etc/init.d/' + backend,
      backend === 'eqos' ? ['restart'] : ['reload'])
  } catch (error) {
    await client.call('uci', 'revert', { config }, true).catch(() => {})
    throw error
  }
}
