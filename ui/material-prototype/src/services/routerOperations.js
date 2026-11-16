/**
 * Shared OpenWrt/QWRT maintenance operations. All router-side commands use
 * fixed executable paths and parameter arrays (never a shell).
 * Permission denials are not reported as successful operations.
 */
export const SNAPSHOT_CONFIGS = Object.freeze(['network', 'dhcp', 'firewall', 'system'])
export const APPLY_TIMEOUT = 90
export const CRITICAL_SERVICES = Object.freeze(['network', 'firewall', 'rpcd', 'uhttpd', 'dropbear', 'dnsmasq', 'odhcpd'])
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9][a-z0-9.-]*$/i
const SERVICE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_+.-]{0,62}$/
const SECTION_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const MAC_RE = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i
const ipv4 = x => {
  const p = String(x).split('.')
  return p.length === 4 && p.every(v => /^(0|[1-9][0-9]{0,2})$/.test(v) && Number(v) <= 255)
}
const ipv6 = x => /^[0-9a-f:]+$/i.test(String(x)) && String(x).includes(':') &&
  !String(x).includes(':::') && String(x).split('::').length <= 2 &&
  (String(x).includes('::') ? String(x).split(':').filter(Boolean).length < 8 :
    String(x).split(':').length === 8) &&
  String(x).split(':').filter(Boolean).every(v => v.length <= 4)
export const validIp = value => ipv4(value) || ipv6(value)

export function validateDiagnosticTarget(raw) {
  const value = String(raw || '').trim()
  if (value.length > 253 || !value || !(
    (HOSTNAME.test(value) && !value.includes('..') && !value.startsWith('-') && !value.endsWith('.')) ||
    ipv6(value)
  )) throw new Error('请输入有效的域名、IPv4 或 IPv6 地址；不允许命令参数或空格')
  return value
}
export function diagnosticCommands(kind, target, resolver = '') {
  const host = validateDiagnosticTarget(target)
  if (kind === 'ping') return [
    { command: ipv6(host) ? '/bin/ping6' : '/bin/ping', params: ['-c', '4', '-W', '2', host] },
    { command: ipv6(host) ? '/usr/bin/ping6' : '/usr/bin/ping', params: ['-c', '4', '-W', '2', host] }
  ]
  if (kind === 'trace') return [
    { command: ipv6(host) ? '/bin/traceroute6' : '/bin/traceroute',
      params: ['-n', '-q', '1', '-w', '1', '-m', '12', host] },
    { command: ipv6(host) ? '/usr/bin/traceroute6' : '/usr/bin/traceroute',
      params: ['-n', '-q', '1', '-w', '1', '-m', '12', host] }
  ]
  if (kind === 'dns') {
    const args = resolver ? [host, validateDiagnosticTarget(resolver)] : [host]
    return [{ command: '/usr/bin/nslookup', params: args }, { command: '/bin/nslookup', params: args }]
  }
  throw new Error('不支持的诊断类型')
}
function outputOf(reply) {
  return [String(reply?.stdout || ''), String(reply?.stderr || '')].filter(Boolean).join('\n')
}
async function execAllowed(client, choices) {
  let last = null
  for (const choice of choices) {
    try {
      const reply = client.callTimed
        ? await client.callTimed('file', 'exec',
          { command: choice.command, params: choice.params, env: null }, 95000)
        : await client.call('file', 'exec',
          { command: choice.command, params: choice.params, env: null })
      if (reply && typeof reply.code !== 'undefined' && Number(reply.code) === 127) {
        last = new Error(choice.command + ' 不存在')
        continue
      }
      if (reply && (reply.stdout !== undefined || reply.stderr !== undefined || reply.code !== undefined)) {
        return { ...reply, command: choice.command }
      }
    } catch (error) { last = error }
  }
  throw new Error('路由器未授权诊断命令或未安装相关工具' +
    (last?.message ? '：' + last.message : ''))
}
export async function runNetworkDiagnostic(client, kind, target, resolver = '') {
  const choices = diagnosticCommands(kind, target, resolver)
  const result = await execAllowed(client, choices)
  return { output: outputOf(result).slice(0, 24000) || '无命令输出',
    code: Number(result.code ?? 0), command: result.command }
}
export function normalizeLogResponse(response) {
  const payload = Array.isArray(response) ? response :
    Array.isArray(response?.log) ? response.log :
    Array.isArray(response?.entries) ? response.entries : null
  if (payload) return payload.map(item => typeof item === 'string' ? item :
    [item.time || item.timestamp || '', item.source || item.process || '',
      item.msg || item.message || item.text || ''].filter(Boolean).join(' ')).join('\n')
  if (typeof response?.log === 'string') return response.log
  if (typeof response?.data === 'string') return response.data
  if (typeof response === 'string') return response
  return ''
}
export async function readRouterLogs(client, kind = 'system') {
  if (kind === 'system') {
    const ubus = await client.call('log', 'read', { lines: 300 }, true).catch(() => null)
    const readable = normalizeLogResponse(ubus)
    if (readable) return { output: readable.slice(-90000), source: 'log.read' }
  }
  const candidates = kind === 'kernel'
    ? [{ command: '/bin/dmesg', params: ['-r'] }]
    : [{ command: '/usr/libexec/syslog-wrapper', params: [] },
      { command: '/sbin/logread', params: ['-e', '^'] },
      { command: '/usr/sbin/logread', params: ['-e', '^'] }]
  const result = await execAllowed(client, candidates)
  return { output: outputOf(result).slice(-90000), source: result.command }
}
export function filterLogLines(raw, search, limit = 350) {
  const q = String(search || '').trim().toLowerCase()
  return String(raw || '').split(/\r?\n/).filter(Boolean)
    .filter(line => !q || line.toLowerCase().includes(q)).slice(-limit)
}
export async function readBackupInventory(client) {
  const list = await execAllowed(client, [
    { command: '/sbin/sysupgrade', params: ['--list-backup'] }
  ])
  if (Number(list.code ?? 0) !== 0) throw new Error(outputOf(list).slice(0, 400) || '无法读取 sysupgrade 清单')
  return { files: outputOf(list).split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 5000) }
}
function snapshotValues(section) {
  if (!section || typeof section !== 'object' || !SECTION_NAME.test(section['.type'] || '')) return null
  return Object.fromEntries(Object.entries(section)
    .filter(([key, value]) => !key.startsWith('.') &&
      /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) &&
      (typeof value === 'string' || typeof value === 'number' ||
        (Array.isArray(value) && value.every(v => typeof v === 'string'))))
    .map(([key, value]) => [key, Array.isArray(value) ? [...value] : String(value)]))
}
export async function createConfigSnapshot(client, selected = SNAPSHOT_CONFIGS) {
  const wanted = [...new Set(selected)]
  if (!wanted.length || wanted.some(x => !SNAPSHOT_CONFIGS.includes(x))) {
    throw new Error('请选择需要备份的配置')
  }
  const configs = {}
  for (const name of wanted) {
    const result = await client.call('uci', 'get', { config: name })
    if (!result?.values) throw new Error('无法读取配置 ' + name + '，已取消导出')
    const sections = {}
    for (const [id, section] of Object.entries(result.values)) {
      if (!SECTION_NAME.test(id) || !section?.['.type']) continue
      sections[id] = { type: section['.type'], options: snapshotValues(section) || {} }
    }
    configs[name] = sections
  }
  return {
    format: 'xxwrt-uci-snapshot', schema: 1, createdAt: new Date().toISOString(),
    configs
  }
}
export function validateConfigSnapshot(raw) {
  if (typeof raw === 'string' && raw.length > 2 * 1024 * 1024) throw new Error('配置文件超过 2MB')
  const doc = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (doc?.format !== 'xxwrt-uci-snapshot' || doc?.schema !== 1 ||
    !doc.configs || typeof doc.configs !== 'object' || Array.isArray(doc.configs)) {
    throw new Error('不是受支持的 XX-WRT UCI 配置快照')
  }
  const keys = Object.keys(doc.configs)
  if (!keys.length || keys.some(k => !SNAPSHOT_CONFIGS.includes(k))) throw new Error('包含不受支持的配置')
  let sectionsCount = 0
  for (const [name, sections] of Object.entries(doc.configs)) {
    if (!sections || typeof sections !== 'object' || Array.isArray(sections)) throw new Error(name + ' 配置格式错误')
    for (const [id, row] of Object.entries(sections)) {
      sectionsCount++
      if (sectionsCount > 600 || !SECTION_NAME.test(id) || !SECTION_NAME.test(row?.type || '') ||
        !row.options || typeof row.options !== 'object' || Array.isArray(row.options)) {
        throw new Error('配置节格式无效')
      }
      if (Object.entries(row.options).some(([key, value]) =>
        !SECTION_NAME.test(key) || !(typeof value === 'string' ||
          (Array.isArray(value) && value.every(x => typeof x === 'string'))))) {
        throw new Error('配置字段格式无效')
      }
    }
  }
  return doc
}
export async function previewConfigRestore(client, raw) {
  const doc = validateConfigSnapshot(raw)
  const changes = [], skipped = []
  for (const [name, sections] of Object.entries(doc.configs)) {
    const current = await client.call('uci', 'get', { config: name })
    if (!current?.values) throw new Error(name + ' 当前配置不可读，停止恢复')
    for (const [id, row] of Object.entries(sections)) {
      const existing = current.values[id]
      if (!existing || existing['.type'] !== row.type) {
        skipped.push(name + '.' + id + '（原设备不存在同类型配置节）')
        continue
      }
      const options = {}
      for (const [key, value] of Object.entries(row.options)) {
        if (JSON.stringify(existing[key]) !== JSON.stringify(value)) options[key] = value
      }
      if (Object.keys(options).length) changes.push({ config: name, section: id, values: options })
    }
  }
  return { changes, skipped, count: changes.reduce((sum, c) => sum + Object.keys(c.values).length, 0) }
}
export async function stageConfigRestore(client, plan) {
  if (!plan?.changes?.length) throw new Error('没有需要恢复的配置')
  const names = [...new Set(plan.changes.map(x => x.config))]
  for (const name of names) {
    const result = await client.call('uci', 'changes', { config: name })
    const v = result?.changes ?? result
    if (v && Object.values(v).some(x => Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : Boolean(x))) {
      throw new Error(name + ' 已有未保存的其他修改，请先处理')
    }
  }
  try {
    for (const item of plan.changes) {
      await client.call('uci', 'set', { config: item.config, section: item.section, values: item.values })
    }
    await client.call('uci', 'apply', { rollback: true, timeout: APPLY_TIMEOUT })
  } catch (error) {
    for (const name of names) await client.call('uci', 'revert', { config: name }, true).catch(() => null)
    throw error
  }
}
export async function confirmConfigRestore(client) {
  await client.call('uci', 'confirm', {})
}
export async function rollbackConfigRestore(client) {
  await client.call('uci', 'rollback', {})
}
export function normalizeDhcpEntries(raw) {
  const entries = Object.entries(raw?.values || {})
  return {
    dns: entries.filter(([, s]) => s['.type'] === 'domain').map(([id, s]) => ({
      id, name: String(s.name || ''), ip: String(s.ip || '')
    })),
    leases: entries.filter(([, s]) => s['.type'] === 'host').map(([id, s]) => ({
      id, name: String(s.name || ''), mac: String(s.mac || ''), ip: String(s.ip || '')
    }))
  }
}
export async function readDhcpEntries(client) {
  const raw = await client.call('uci', 'get', { config: 'dhcp' })
  if (!raw?.values) throw new Error('无法读取 /etc/config/dhcp')
  return normalizeDhcpEntries(raw)
}
export function validateDnsRecord(kind, input, all) {
  const name = String(input.name || '').trim()
  const ip = String(input.ip || '').trim()
  if (!name || !HOSTNAME.test(name) || name.includes('..') || name.startsWith('.') ||
    name.endsWith('.')) throw new Error('主机名/域名不合法')
  if (!validIp(ip)) throw new Error('请输入有效的 IPv4 或 IPv6 地址')
  if (kind === 'dns') {
    if (all.dns.some(x => x.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('该域名已有静态解析记录，请先删除旧记录')
    }
    return { name, ip }
  }
  if (kind === 'lease') {
    const mac = String(input.mac || '').trim().toUpperCase()
    if (!MAC_RE.test(mac)) throw new Error('请输入有效的 MAC 地址')
    if (all.leases.some(x => x.mac.toUpperCase() === mac || x.ip === ip)) {
      throw new Error('MAC 或 IP 已存在静态租约')
    }
    return { name, mac, ip }
  }
  throw new Error('不支持的 DHCP 配置类型')
}
export async function changeDhcpEntry(client, kind, action, input, known) {
  if (!['dns', 'lease'].includes(kind) || !['add', 'delete'].includes(action)) {
    throw new Error('不支持的配置操作')
  }
  const type = kind === 'dns' ? 'domain' : 'host'
  const pending = await client.call('uci', 'changes', { config: 'dhcp' })
  const staged = pending?.changes ?? pending
  if (staged && Object.values(staged).some(x => Array.isArray(x) ? x.length :
    x && typeof x === 'object' ? Object.keys(x).length : Boolean(x))) {
    throw new Error('DHCP 已有未提交的配置修改，请先处理')
  }
  try {
  if (action === 'add') {
    const current = known || await readDhcpEntries(client)
    const values = validateDnsRecord(kind, input, current)
    await client.call('uci', 'add', { config: 'dhcp', type, values })
  } else {
    const id = String(input?.id || '')
    if (!SECTION_NAME.test(id)) throw new Error('配置节标识无效')
    const current = await client.call('uci', 'get', { config: 'dhcp', section: id })
    const row = current?.values || current
    if (!row || row['.type'] !== type) throw new Error('配置节不存在或类型不匹配')
    await client.call('uci', 'delete', { config: 'dhcp', section: id })
  }
  await client.call('uci', 'commit', { config: 'dhcp' })
  } catch (error) {
    await client.call('uci', 'revert', { config: 'dhcp' }, true).catch(() => null)
    throw error
  }
  const applied = await client.call('rc', 'init', { name: 'dnsmasq', action: 'reload' }, true).catch(() => null)
  return { applied: applied !== null }
}
export async function readRouterServices(client) {
  const result = await client.call('rc', 'list')
  if (!result || typeof result !== 'object') throw new Error('没有 rc.list 服务管理权限')
  return Object.entries(result).map(([name, state]) => ({
    name, enabled: Boolean(state?.enabled), running: Boolean(state?.running)
  })).sort((a, b) => a.name.localeCompare(b.name))
}
export function validateServiceAction(name, action, services) {
  if (!SERVICE_NAME.test(name) || !services.some(item => item.name === name)) {
    throw new Error('服务不存在或名称不合法')
  }
  if (!['start', 'stop', 'restart', 'enable', 'disable'].includes(action)) {
    throw new Error('不支持的服务操作')
  }
  if (CRITICAL_SERVICES.includes(name) && ['stop', 'disable', 'restart'].includes(action)) {
    throw new Error('为避免切断路由器管理连接，禁止在 APP 中停止、禁用或重启关键服务')
  }
}
export async function changeRouterService(client, name, action, services) {
  validateServiceAction(name, action, services)
  const result = await client.call('rc', 'init', { name, action }, true)
  if (result === null) {
    const legacy = await client.call('luci', 'setInitAction', { name, action }, true)
    if (legacy === null) throw new Error('当前账户无权限操作该服务')
  }
  return await readRouterServices(client)
}
