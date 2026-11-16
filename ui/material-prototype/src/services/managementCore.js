/**
 * Shared capability, configuration transaction and audit layer.
 * Audit only stores sanitized metadata, never UCI values, tokens, or raw logs.
 * UCI writes made through protected transactions stay pending until confirmed.
 */
export const CONFIG_ROLLBACK_SECONDS = 90
export const AUDIT_STORAGE_KEY = 'xxwrt_operation_audit_v1'
export const CAPABILITY_LABELS = Object.freeze({
  uci: 'UCI 配置读写', network: '网络接口', dhcp: 'DHCP/DNS',
  firewall: '防火墙', ddns: 'DDNS Scripts', ddnsGo: 'DDNS-Go',
  openclash: 'OpenClash', cron: '系统 Cron', logs: '系统日志',
  lldp: 'LLDP 发现', qos: 'HQoS', telemetry: '运行监控'
})
const CONFIG_WHITELIST = new Set(['ddns', 'openclash', 'firewall', 'network', 'dhcp', 'system'])
const SIMPLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const AUDITED_UCI = new Set(['set','add','delete','commit','revert','apply','confirm','rollback'])
const AUDITED_RC = new Set(['init'])
const AUDITED_FILE = new Set(['write','remove'])
const AUDITED_LUCI = new Set(['setInitAction'])
const activeTransactions = new WeakMap()
const canStore = () => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }
const clean = x => String(x || '').slice(0, 80).replace(/[^\w.:\-/]/g, '?')

function auditScope(target) {
  return String(target || 'unknown').replace(/\/+$/, '').slice(0, 200)
}
export function rpcAuditDescriptor(object, method, args = {}) {
  const writable = object === 'uci' && AUDITED_UCI.has(method) ||
    object === 'rc' && AUDITED_RC.has(method) ||
    object === 'file' && AUDITED_FILE.has(method) ||
    object === 'luci' && AUDITED_LUCI.has(method) ||
    object === 'file' && method === 'exec' &&
      /^(?:\/etc\/init\.d\/|\/usr\/sbin\/hqos$|\/usr\/bin\/opkg$|\/sbin\/apk$)/.test(args.command || '')
  if (!writable) return null
  // Exclude every argument value; even firewall configs or cron may include credentials.
  const resource = object === 'uci' ? [args.config, args.section, args.option].filter(Boolean).map(clean).join('.') :
    object === 'rc' ? clean(args.name) :
    object === 'file' ? clean(args.path || args.command) : clean(args.name)
  return { action: object + '.' + method, resource }
}
export function readAuditRecords(storage = canStore(), router = '') {
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(AUDIT_STORAGE_KEY) || '{}')
    const entries = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed[auditScope(router)] : null
    return Array.isArray(entries) ? entries.slice(-400).filter(x => x && typeof x === 'object') : []
  } catch (_) { return [] }
}
export function appendAuditRecord(storage = canStore(), router = '', event = {}) {
  if (!storage) return false
  try {
    const parsed = JSON.parse(storage.getItem(AUDIT_STORAGE_KEY) || '{}')
    const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    const key = auditScope(router)
    data[key] = [...readAuditRecords(storage, router), {
      time: Number.isFinite(event.time) ? event.time : Date.now(),
      action: clean(event.action), resource: clean(event.resource),
      status: ['success','error','unknown'].includes(event.status) ? event.status : 'unknown'
    }].slice(-400)
    // Bound router count as well as events; no raw RPC argument content.
    const keys = Object.keys(data)
    for (const old of keys.slice(0, Math.max(0, keys.length - 12))) delete data[old]
    storage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(data))
    return true
  } catch (_) { return false }
}
export function recordRpcAudit(router, object, method, args, status) {
  const item = rpcAuditDescriptor(object, method, args)
  if (item) appendAuditRecord(canStore(), router, { ...item, status })
}
export function hasPendingUciChanges(response) {
  if (!response) return false
  const changes = response.changes ?? response
  if (Array.isArray(changes)) return changes.length !== 0
  if (typeof changes !== 'object') return Boolean(changes)
  return Object.values(changes).some(x => Array.isArray(x) ? x.length > 0 :
    x && typeof x === 'object' ? Object.keys(x).length > 0 : Boolean(x))
}
export async function assertCleanUci(client, configs) {
  for (const config of [...new Set(configs)]) {
    if (!CONFIG_WHITELIST.has(config)) throw new Error('配置类型未获准修改：' + config)
    // Do not silently treat "no ACL" as "no pending changes".
    const result = await client.call('uci', 'changes', { config })
    if (hasPendingUciChanges(result)) throw new Error(config + ' 存在尚未处理的 UCI 修改，请先在 LuCI 保存或撤销')
  }
}
function fieldValue(v) {
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.every(x => typeof x === 'string' && x.length <= 4096)) return [...v]
  throw new Error('只允许有限长度的文本或字符串列表字段')
}
export function validateUciMutations(mutations) {
  if (!Array.isArray(mutations) || !mutations.length || mutations.length > 25) throw new Error('变更数量无效')
  return mutations.map(row => {
    const config = String(row.config || '')
    if (!CONFIG_WHITELIST.has(config)) throw new Error('禁止修改配置 ' + config)
    const kind = row.kind || 'set'
    if (!['set','add','delete'].includes(kind)) throw new Error('不支持的变更类型')
    const section = String(row.section || '')
    if (kind !== 'add' && !SIMPLE_NAME.test(section)) throw new Error('配置节名称不合法')
    const type = String(row.type || '')
    if (kind === 'add' && !SIMPLE_NAME.test(type)) throw new Error('配置类型不合法')
    const values = {}
    for (const [key, value] of Object.entries(row.values || {})) {
      if (!SIMPLE_NAME.test(key) || key.startsWith('.')) throw new Error('配置字段名称不合法')
      values[key] = fieldValue(value)
    }
    if (kind === 'set' && !Object.keys(values).length) throw new Error('未指定配置变更')
    return { kind, config, section, type, values }
  })
}
function currentSection(reply) {
  return reply?.values && reply.values['.type'] ? reply.values :
    reply?.['.type'] ? reply : null
}
export async function prepareUciChange(client, mutations) {
  const rows = validateUciMutations(mutations)
  const sections = []
  for (const row of rows) {
    let before = null
    if (row.kind !== 'add') {
      const reply = await client.call('uci', 'get',
        { config: row.config, section: row.section })
      before = currentSection(reply)
      if (!before) throw new Error('无法读取原始配置节 ' + row.config + '.' + row.section)
    }
    const diff = row.kind === 'set' ? Object.keys(row.values)
      .filter(k => JSON.stringify(before[k]) !== JSON.stringify(row.values[k])) : []
    if (row.kind === 'set' && !diff.length) continue
    sections.push({
      ...row,
      expected: before ? Object.fromEntries(
        Object.keys(row.values).map(k => [k, before[k] === undefined ? null : before[k]])) : null,
      keys: row.kind === 'set' ? diff : Object.keys(row.values)
    })
  }
  if (!sections.length) return { sections: [], summary: [] }
  return { sections, summary: sections.map(x => ({
    config: x.config, section: x.section || '(' + x.type + ' 新建)',
    action: x.kind, fields: x.keys
  })) }
}
async function assertSameBaseline(client, item) {
  if (!item.expected) return
  const latest = currentSection(await client.call('uci', 'get',
    { config: item.config, section: item.section }))
  if (!latest) throw new Error('配置节已被外部删除，请刷新')
  for (const [k, value] of Object.entries(item.expected)) {
    const present = latest[k] === undefined ? null : latest[k]
    if (JSON.stringify(present) !== JSON.stringify(value))
      throw new Error('配置已在其他客户端发生变化，请刷新后重试')
  }
}
export async function applyProtectedUci(client, plan) {
  const rows = plan?.sections
  if (!Array.isArray(rows) || !rows.length) throw new Error('没有需要应用的变更')
  const active = activeTransactions.get(client)
  if (active?.status === 'pending' && Date.now() >= active.deadline) {
    // The router's rollback timer is past its deadline. Unlock the UI only;
    // never assert that the remote rollback succeeded.
    activeTransactions.delete(client)
  } else if (active) throw new Error('已有待确认的配置变更')
  const configs = [...new Set(rows.map(x => x.config))]
  await assertCleanUci(client, configs)
  for (const row of rows) await assertSameBaseline(client, row)
  // Lock before the first RPC mutation so overlapping UI actions are rejected.
  activeTransactions.set(client, { status: 'staging', configs })
  let touched = false
  try {
    for (const row of rows) {
      touched = true
      if (row.kind === 'set') await client.call('uci', 'set', {
        config: row.config, section: row.section,
        values: Object.fromEntries(row.keys.map(k => [k, row.values[k]]))
      })
      else if (row.kind === 'add') await client.call('uci', 'add', {
        config: row.config, type: row.type, values: row.values
      })
      else await client.call('uci', 'delete', {
        config: row.config, section: row.section
      })
    }
    await client.call('uci', 'apply', { rollback: true, timeout: CONFIG_ROLLBACK_SECONDS })
    const tx = { status: 'pending', configs, deadline: Date.now() + CONFIG_ROLLBACK_SECONDS * 1000 }
    activeTransactions.set(client, tx)
    return tx
  } catch (e) {
    if (touched) {
      for (const config of configs) await client.call('uci', 'revert', { config }, true).catch(() => null)
    }
    activeTransactions.delete(client)
    throw e
  }
}
export function pendingProtectedUci(client) {
  return activeTransactions.get(client) || null
}
export function releaseExpiredProtectedUci(client, tx, now = Date.now()) {
  const active = activeTransactions.get(client)
  if (!active || active !== tx || active.status !== 'pending' || now < active.deadline) return false
  activeTransactions.delete(client)
  return true
}
export async function finishProtectedUci(client, tx, keep) {
  const current = activeTransactions.get(client)
  if (!current || current !== tx || current.status !== 'pending') throw new Error('没有可确认的配置')
  if (keep && Date.now() > current.deadline) throw new Error('超过路由器自动回滚时限，请重新读取配置')
  try {
    await client.call('uci', keep ? 'confirm' : 'rollback', {})
    activeTransactions.delete(client)
  } catch (e) { throw e }
}
const status = (yes, unknown) => yes ? 'available' : unknown ? 'unknown' : 'unavailable'
const supports = (config, service, name) => {
  const configVisible = config?.values && typeof config.values === 'object'
  const serviceVisible = service && typeof service === 'object'
  const installed = configVisible || serviceVisible && Object.hasOwn(service, name)
  return status(installed, !configVisible && !serviceVisible)
}
export async function discoverRouterCapabilities(client) {
  const calls = [
    ['system','board',{}], ['system','info',{}], ['rc','list',{}],
    ['uci','get',{config:'ddns'}], ['uci','get',{config:'openclash'}],
    ['uci','get',{config:'firewall'}], ['uci','get',{config:'dhcp'}],
    ['uci','get',{config:'network'}], ['file','read',{path:'/etc/crontabs/root'}],
    ['log','read',{lines:1}], ['luci-rpc','getHostHints',{}],
    ['uci','get',{config:'hqos'}]
  ]
  const results = await Promise.all(calls.map(async ([obj,method,args]) =>
    client.call(obj,method,args,true).catch(() => null)))
  const [board,info,services,ddns,openclash,firewall,dhcp,network,cron,logs,hints,hqos] = results
  const distribution = String(board?.release?.distribution || board?.release?.description || board?.model || '')
  const firmware = /\bQWRT\b/i.test(distribution) ? 'QWRT' :
    /\bOpenWrt\b/i.test(distribution) ? 'OpenWrt' : 'OpenWrt 兼容 / 待确认'
  const features = {
    uci: status(Boolean(network?.values || firewall?.values || dhcp?.values), true),
    network: status(Boolean(network?.values), !network?.values),
    dhcp: status(Boolean(dhcp?.values), !dhcp?.values),
    firewall: status(Boolean(firewall?.values), !firewall?.values),
    ddns: supports(ddns, services, 'ddns'),
    ddnsGo: supports(null, services, 'ddns-go'),
    openclash: supports(openclash, services, 'openclash'),
    cron: status(cron?.data !== undefined || typeof cron === 'string' ||
      !!services?.cron, !services),
    logs: status(Boolean(logs), !logs),
    lldp: status(Boolean(services?.lldpd), !services),
    qos: status(Boolean(hqos?.values || services?.hqos), !services),
    telemetry: status(Boolean(info), !info)
  }
  return {
    firmware, board: {
      model: String(board?.model || '未知'),
      version: String(board?.release?.description || '未知'),
      target: String(board?.release?.target || '未知')
    },
    features: Object.entries(features).map(([id,state]) => ({
      id, name: CAPABILITY_LABELS[id], state
    })),
    note: '未知表示无法由当前 RPC 权限确认；未安装和无权限不能自动等同。'
  }
}
