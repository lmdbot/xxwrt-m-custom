/**
 * Opt-in experimental features. All preferences stay on the Android/web client.
 * No router UCI change is made by this module.
 */
export const LAB_PREFS_KEY = 'xxwrt_lab_features_v1'
export const LAB_CARDS_KEY = 'xxwrt_lab_overview_cards_v1'
export const LAB_ROUTES_KEY = 'xxwrt_lab_paired_routes_v1'
export const OVERVIEW_METRICS = Object.freeze(['CPU 占用', '内存占用', '存储', '温度', '终端', '联网监测'])
export const REFRESH_PRESETS = Object.freeze({
  balanced: { overview: 12000, telemetry: 3000, devices: 15000 },
  saver: { overview: 30000, telemetry: 8000, devices: 30000 },
  realtime: { overview: 6000, telemetry: 2000, devices: 10000 }
})
const LIMITS = { overview: [5000, 120000], telemetry: [1500, 30000], devices: [10000, 120000] }
const DEFAULT_LAB = {
  profile: 'balanced', custom: { ...REFRESH_PRESETS.balanced },
  cardsEnabled: false, rpcDebug: false, smartSwitch: false, healthEnabled: false
}
const safelyRead = (storage, key, fallback) => {
  try { return JSON.parse(storage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
const safelyWrite = (storage, key, data) => {
  try { storage.setItem(key, JSON.stringify(data)); return true } catch { return false }
}
const bounded = (key, value) => {
  const [min, max] = LIMITS[key]
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : REFRESH_PRESETS.balanced[key]
}
export function sanitizeLabSettings(value) {
  const item = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    profile: [...Object.keys(REFRESH_PRESETS), 'custom'].includes(item.profile) ? item.profile : 'balanced',
    custom: Object.fromEntries(Object.keys(LIMITS).map(key => [key, bounded(key, item.custom?.[key])])),
    cardsEnabled: item.cardsEnabled === true,
    rpcDebug: item.rpcDebug === true,
    smartSwitch: item.smartSwitch === true,
    healthEnabled: item.healthEnabled === true
  }
}
export function loadLabSettings(storage) { return sanitizeLabSettings(safelyRead(storage, LAB_PREFS_KEY, DEFAULT_LAB)) }
export function saveLabSettings(storage, value) {
  const clean = sanitizeLabSettings(value)
  safelyWrite(storage, LAB_PREFS_KEY, clean)
  return clean
}
/**
 * Factory reset affects *only* laboratory keys, including all per-router layouts
 * and verified alternative endpoints. Core router credentials remain untouched.
 * If persistent storage rejects removal, leave the in-memory settings unchanged.
 */
export function resetAllLabPreferences(storage) {
  try {
    for (const key of [LAB_PREFS_KEY, LAB_CARDS_KEY, LAB_ROUTES_KEY]) storage.removeItem(key)
    return true
  } catch { return false }
}
export function refreshIntervals(settings) {
  const clean = sanitizeLabSettings(settings)
  return clean.profile === 'custom' ? clean.custom : REFRESH_PRESETS[clean.profile]
}
export function normalizeOverviewCards(value) {
  const entries = Array.isArray(value) ? value : []
  const selected = new Set()
  const merged = []
  for (const item of entries) {
    const name = typeof item === 'string' ? item : item?.id
    if (!OVERVIEW_METRICS.includes(name) || selected.has(name)) continue
    selected.add(name)
    merged.push({ id: name, visible: typeof item === 'string' ? true : item.visible !== false })
  }
  for (const id of OVERVIEW_METRICS) if (!selected.has(id)) merged.push({ id, visible: true })
  if (!merged.some(item => item.visible)) merged[0].visible = true
  return merged
}
export function loadOverviewCards(storage, deviceId) {
  const all = safelyRead(storage, LAB_CARDS_KEY, {})
  return normalizeOverviewCards(deviceId ? all?.[deviceId] : [])
}
export function saveOverviewCards(storage, deviceId, value) {
  const cleaned = normalizeOverviewCards(value)
  if (!deviceId) return cleaned
  const all = safelyRead(storage, LAB_CARDS_KEY, {})
  const source = all && typeof all === 'object' && !Array.isArray(all) ? all : {}
  safelyWrite(storage, LAB_CARDS_KEY, { ...source, [deviceId]: cleaned })
  return cleaned
}
export function rearrangeOverviewCards(items, id, movement) {
  const data = normalizeOverviewCards(items)
  const from = data.findIndex(item => item.id === id)
  const to = from + movement
  if (![-1, 1].includes(movement) || from < 0 || to < 0 || to >= data.length) return data
  ;[data[from], data[to]] = [data[to], data[from]]
  return data
}
export function toggleOverviewCard(items, id) {
  const data = normalizeOverviewCards(items)
  const selected = data.find(item => item.id === id)
  if (!selected || (selected.visible && data.filter(item => item.visible).length === 1)) return data
  selected.visible = !selected.visible
  return data
}

/** Diagnostic RPC ring buffer: no request payload, router URL, tokens or response body. */
let tracing = false
const records = []
const listeners = new Set()
export function enableRpcTrace(value) { tracing = value === true; if (!tracing) clearRpcTrace() }
export function getRpcTrace() { return records.slice() }
export function clearRpcTrace() { records.length = 0; for (const cb of listeners) cb(getRpcTrace()) }
export function subscribeRpcTrace(cb) { listeners.add(cb); cb(getRpcTrace()); return () => listeners.delete(cb) }
export function recordRpcTrace(object, method, elapsedMs, outcome) {
  if (!tracing) return
  const safe = v => String(v ?? '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 60)
  records.push({
    at: new Date().toISOString(), object: safe(object), method: safe(method),
    ms: Math.max(0, Math.round(Number(elapsedMs) || 0)),
    status: ['success','unavailable','error'].includes(outcome) ? outcome : 'error'
  })
  if (records.length > 80) records.splice(0, records.length - 80)
  for (const cb of listeners) cb(getRpcTrace())
}

/** Never silently transmit a session token over an arbitrary public HTTP endpoint. */
export function normalizeTrustedAlternative(input) {
  const text = String(input || '').trim()
  if (!/^https?:\/\//i.test(text)) throw new Error('备用入口必须填写完整的 https:// 地址（私有 IPv4 可使用 http://）')
  let url
  try { url = new URL(text) } catch { throw new Error('备用入口 URL 无效') }
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || !url.hostname)
    throw new Error('只允许不含路径、参数及账号密码的 HTTP(S) 地址')
  if (url.protocol === 'http:') {
    const host = url.hostname
    const parts = host.split('.').map(Number)
    const privateIPv4 = parts.length === 4 && parts.every(x => Number.isInteger(x) && x >= 0 && x <= 255) &&
      (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168))
    if (!privateIPv4) throw new Error('公网或域名备用地址必须使用可信 HTTPS，避免泄露会话')
  }
  return url.origin
}
const validMac = value => /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/i.test(String(value || ''))
/**
 * Routers without a stable hardware/Machine ID cannot be paired. Identical
 * model/hostname is never sufficient to authenticate a candidate endpoint.
 */
export async function readRouterIdentity(client) {
  const [board, network] = await Promise.all([
    client.call('system','board',{},true),
    client.call('network.interface','dump',{},true)
  ])
  if (!board || !network) throw new Error('当前路由器无法读取身份信息')
  const lan = (network.interface || []).find(item => item.interface === 'lan')
  const device = String(lan?.device || lan?.l3_device || '')
  const hardware = device ? await client.call('network.device','status',{ name:device },true).catch(()=>null) : null
  const mac = String(hardware?.macaddr || hardware?.mac || '').toLowerCase()
  let marker = validMac(mac) && mac !== '00:00:00:00:00:00' ? 'mac:' + mac : ''
  if (!marker) {
    const file = await client.call('file','read',{ path:'/etc/machine-id' },true).catch(()=>null)
    const machineId = String(file?.data || '').trim()
    if (/^[a-f0-9]{32}$/i.test(machineId)) marker = 'machine:' + machineId.toLowerCase()
  }
  if (!marker) throw new Error('缺少可信的 LAN MAC 或机器 ID，不能安全配对备用入口')
  return { marker, model: String(board.model || board.system || '').trim(), target: String(board.release?.target || '').trim() }
}
export function sameRouterIdentity(a,b) {
  return Boolean(a?.marker && b?.marker && a.marker === b.marker &&
    a.model && a.model === b.model && a.target === b.target)
}
export function loadPairedRoute(storage,deviceId) {
  const all = safelyRead(storage,LAB_ROUTES_KEY,{})
  const route = deviceId ? all?.[deviceId] : null
  if (!route?.address || !route?.identity) return null
  try { return { address:normalizeTrustedAlternative(route.address),identity:route.identity } } catch { return null }
}
export function savePairedRoute(storage,deviceId,route) {
  if (!deviceId) return false
  const all = safelyRead(storage,LAB_ROUTES_KEY,{})
  return safelyWrite(storage,LAB_ROUTES_KEY,{ ...(all && typeof all === 'object' && !Array.isArray(all) ? all : {}),
    [deviceId]:route })
}
export function removePairedRoute(storage,deviceId) {
  if (!deviceId) return false
  const all = safelyRead(storage,LAB_ROUTES_KEY,{})
  if (!all || typeof all !== 'object' || Array.isArray(all)) return false
  delete all[deviceId]
  return safelyWrite(storage,LAB_ROUTES_KEY,all)
}

/** Passive diagnostic results avoid classifying missing evidence as a healthy connection. */
export function passiveNetworkHealth(snapshot) {
  if (!snapshot) return []
  const wan = snapshot.interfaces?.find(item => item.interface === 'wan')
  const wan6 = snapshot.interfaces?.find(item => ['wan6','wan_6'].includes(item.interface))
  const has = value => Boolean(value && String(value) !== '--')
  const detector = snapshot.detectorAvailable
    ? snapshot.checks?.length ? snapshot.checks.filter(x=>x.state==='up').length + '/' + snapshot.checks.length : '未配置监测项'
    : '未获取到监测状态'
  const detectorState = !snapshot.detectorAvailable || !snapshot.checks?.length ? 'unknown'
    : snapshot.checks.every(x=>x.state==='up') ? 'ok' : 'warn'
  const state = iface => !iface || typeof iface.up !== 'boolean' ? 'unknown' : iface.up ? 'ok' : 'fail'
  return [
    { label:'WAN 接口',value:!wan?'未知':wan.up?'已连接':'未连接',status:state(wan) },
    { label:'WAN6 接口',value:!wan6?'未知':wan6.up?'已连接':'未连接',status:state(wan6) },
    { label:'IPv4 默认网关',value:has(snapshot.gateway)?snapshot.gateway:'未获取到',status:has(snapshot.gateway)?'ok':'unknown' },
    { label:'DNS 配置',value:has(snapshot.dns)?snapshot.dns:'未获取到',status:has(snapshot.dns)?'ok':'unknown' },
    { label:'Internet Detector',value:detector,status:detectorState }
  ]
}
export function parsePingResult(result) {
  if (!result || typeof result !== 'object') return {status:'unknown',text:'权限不足或接口不可用'}
  const output = String(result.stdout || '') + '\n' + String(result.stderr || '')
  const loss = output.match(/(\d+(?:\.\d+)?)\s*%\s*packet\s*loss/i)
  if (!loss) return {status:'unknown',text:'无法解析 Ping 结果'}
  const pct = Number(loss[1])
  const rtt = output.match(/(?:rtt|round-trip)[^=\n]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i)
  return {status:pct===100?'fail':pct>0?'warn':'ok',
    text:'丢包 '+pct+'%'+(rtt?' · 平均 '+Number(rtt[2]).toFixed(1)+' ms':'') }
}
export async function runNetworkHealthProbes(client,snapshot) {
  const ipv4 = s => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(s)) && String(s).split('.').every(part=>Number(part)<=255)
  const dns = String(snapshot?.dns || '').split(',').map(s=>s.trim()).find(ipv4)
  const targets = [['网关 Ping',snapshot?.gateway],['DNS Ping',dns]].filter(([,target])=>ipv4(target))
  return Promise.all(targets.map(async ([label,target])=>{
    const started=Date.now()
    let result
    try {
      result=await client.call('file','exec',{
        command:'/bin/ping',params:['-c','3','-W','2',target],env:null
      },true)
    }catch{return {label,status:'unknown',value:'请求失败'}}
    const parsed=parsePingResult(result)
    return {label,status:parsed.status,value:parsed.text,elapsedMs:Date.now()-started}
  }))
}
