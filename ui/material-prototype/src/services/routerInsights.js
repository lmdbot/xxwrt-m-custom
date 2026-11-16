import { readRouterLogs } from './routerOperations.js'

export const METRIC_STORE_KEY = 'xxwrt_metrics_history_v1'
export const METRIC_INTERVAL_MS = 5 * 60 * 1000
export const METRIC_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
export const METRIC_MAX_POINTS = 8640
const num = x => {
  if (x === '' || x === null || x === undefined) return null
  const n = Number(x)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const metric = v => v === null ? null : Math.min(100, v)
function loadStore(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(METRIC_STORE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (_) { return {} }
}
export function readMetricHistory(storage, router) {
  if (!storage || !router) return []
  const data=loadStore(storage)
  return (Array.isArray(data[router]) ? data[router] : [])
    .filter(x=>x && Number.isFinite(x.time)).sort((a,b)=>a.time-b.time).slice(-METRIC_MAX_POINTS)
}
export function sampleFromDashboard(dashboard, time = Date.now()) {
  const load = String(dashboard?.load || '').split(/\s+/)[0]
  const firstLoad = num(load)
  return {
    time,
    cpu: metric(num(dashboard?.cpuPercent)),
    memory: metric(num(dashboard?.memoryPercent)),
    connections: metric(num(dashboard?.connPercent)),
    load1: firstLoad
  }
}
export function recordMetricSample(storage, router, dashboard, now = Date.now()) {
  if (!storage || !router || !dashboard || !Number.isFinite(now)) return false
  const sample=sampleFromDashboard(dashboard,now)
  if ([sample.cpu,sample.memory,sample.connections,sample.load1].every(x=>x===null))return false
  const data=loadStore(storage)
  const existing=readMetricHistory(storage,router)
    .filter(x=>x.time >= now-METRIC_RETENTION_MS && x.time<=now)
  if (existing.length && now-existing.at(-1).time<METRIC_INTERVAL_MS) {
    const last=existing.at(-1)
    const keys=['cpu','memory','connections','load1']
    // The first /proc/stat read must warm up; allow the next *complete*
    // snapshot to replace an incomplete point without creating fake history.
    const improved=keys.some(key=>last[key]==null && sample[key]!=null)
    const regressed=keys.some(key=>last[key]!=null && sample[key]==null)
    if (!improved || regressed) return false
    existing[existing.length-1]=sample
  } else existing.push(sample)
  data[router]=existing.slice(-METRIC_MAX_POINTS)
  // Cap old routers to prevent unbounded localStorage.
  const routers=Object.keys(data)
  if (routers.length>8)for(const key of routers.slice(0,routers.length-8))delete data[key]
  try {
    storage.setItem(METRIC_STORE_KEY,JSON.stringify(data))
    return true
  } catch (_) {return false}
}
export function trendPoints(history, range, key, now = Date.now()) {
  const durations={h24:86400000,d7:7*86400000,d30:30*86400000}
  const span=durations[range] || durations.h24
  const filtered=history.filter(x=>x.time>=now-span && x.time<=now &&
    Number.isFinite(x[key]) && x[key]!==null)
  const bucketMs=Math.max(METRIC_INTERVAL_MS,Math.ceil(span/180/METRIC_INTERVAL_MS)*METRIC_INTERVAL_MS)
  const buckets=new Map()
  for(const entry of filtered) {
    const bucket=Math.floor(entry.time/bucketMs)
    const a=buckets.get(bucket) || {time:entry.time,total:0,count:0}
    a.total+=entry[key];a.count++;a.time=entry.time;buckets.set(bucket,a)
  }
  return [...buckets.values()].sort((a,b)=>a.time-b.time)
    .map(x=>({time:x.time,value:Math.round(x.total/x.count*100)/100}))
}
export function trendPlotPoints(points, minTime, maxTime, maxValue=100) {
  const denom=Math.max(1,maxTime-minTime)
  return points.map(point=>({
    x:Math.max(0,Math.min(760,(point.time-minTime)/denom*760)),
    y:110-Math.max(0,Math.min(100,point.value/maxValue*100))
  }))
}
export function trendSegments(points, minTime, maxTime, maxValue=100, maxGapMs=18*60*1000) {
  const plotted=trendPlotPoints(points,minTime,maxTime,maxValue)
  const out=[]
  let current=[]
  for(let i=0;i<points.length;i++) {
    const prev=points[i-1]
    if (prev && points[i].time-prev.time>maxGapMs) {
      if(current.length)out.push(current)
      current=[]
    }
    current.push(plotted[i])
  }
  if(current.length)out.push(current)
  return out.map(seg=>seg.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' '))
}
export const SECURITY_PATTERNS=Object.freeze([
  {id:'login',name:'登录 / 认证失败',level:'high',group:'security',
    rule:'匹配认证失败、非法用户与口令错误日志',
    expression:/failed password|authentication failure|invalid user|login failed|bad password|unauthorized login|incorrect password|dropbear.*(?:bad password|failed login|invalid user)/i},
  {id:'firewall',name:'防火墙拦截记录',level:'medium',group:'security',
    rule:'匹配带网络字段的 DROP / REJECT / blocked 日志；需启用规则日志',
    expression:/\b(?:drop|reject|blocked|denied)\b.*(?:SRC=|DPT=|IN=|firewall|nft|iptables)|(?:SRC=|DPT=|IN=).*\b(?:DROP|REJECT)\b/i},
  {id:'scan',name:'扫描 / 洪泛告警',level:'high',group:'security',
    rule:'仅匹配明确出现 scan、flood 等告警字样的日志',
    expression:/port.?scan|syn.?flood|scan detected|possible scan|nmap probe|tcp.*syn.*flood/i},
  {id:'dns',name:'DNS Rebind 防护',level:'medium',group:'security',
    rule:'匹配 DNS Rebind 拦截/防护日志',
    expression:/dns.?rebind|rebind protection|possible dns-rebind/i},
  {id:'stability',name:'系统稳定性',level:'high',group:'health',
    rule:'匹配 OOM、内核崩溃、看门狗、分段错误、I/O 故障',
    expression:/out of memory|oom-killer|killed process.*(?:memory|oom)|kernel panic|watchdog.*(?:timeout|did not stop)|segfault|read-only file system|i\/o error/i},
  {id:'network',name:'网络连接异常',level:'medium',group:'health',
    rule:'匹配 WAN 掉线、PPP LCP 终止、DHCP 获取失败或链路超时',
    expression:/pppd.*(?:timed out|lcp terminated)|wan.*(?:link down|disconnected)|carrier lost|dhcp.*(?:no lease|failed)|netdev watchdog|network.*(?:link down|no carrier)/i},
  {id:'service',name:'服务 / 运行错误',level:'low',group:'health',
    rule:'匹配明确的服务启动失败、进程崩溃和常见守护进程错误',
    expression:/\bservice\b.*(?:failed|crashed)|dnsmasq.*(?:failed|error)|procd.*(?:failed|respawn)|\b(?:daemon|kern|user)\.(?:err|crit|alert|emerg)\b/i}
])
const SERVICE_PATTERNS=Object.freeze([
  {id:'dnsmasq',name:'DNS / DHCP',regex:/\b(?:dnsmasq|odhcpd)\b/i},
  {id:'netifd',name:'网络接口',regex:/\b(?:netifd|udhcpc|pppd)\b/i},
  {id:'dropbear',name:'SSH / 登录',regex:/\b(?:dropbear|sshd|uhttpd)\b/i},
  {id:'firewall',name:'防火墙',regex:/\b(?:firewall4|fw4|nftables|iptables)\b/i},
  {id:'wifi',name:'无线网络',regex:/\b(?:hostapd|wpa_supplicant|wpad)\b/i},
  {id:'services',name:'系统服务',regex:/\b(?:procd|cron|crond|syslogd)\b/i},
  {id:'kernel',name:'内核 / 驱动',regex:/\b(?:kernel|kern\.)\b/i}
])
export function safeLogExcerpt(value) {
  return String(value||'')
    .replace(/\b(authorization|password|passwd|token|secret|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi,'$1=[已隐藏]')
    .replace(/:\/\/[^/@\s]+:[^/@\s]+@/g,'://[凭据已隐藏]@')
    .slice(0,280)
}
function severityOf(line) {
  if (/\b(?:emerg|alert|crit|critical|err|error)\b(?:\s*[:\]])?|(?:^|\s)(?:error|failed):/i.test(line)) return 'error'
  if (/\b(?:warn|warning)\b(?:\s*[:\]])?/i.test(line)) return 'warning'
  return 'other'
}
export function analyzeSecurityLogs(outputs) {
  const lines=[...new Set((Array.isArray(outputs)?outputs:[])
    .flatMap(s=>String(s||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)))]
  const events=[],recentNotices=[]
  const severity={error:0,warning:0,other:0}
  const serviceCounts=Object.fromEntries(SERVICE_PATTERNS.map(x=>[x.id,0]))
  for(const line of lines) {
    const level=severityOf(line)
    severity[level]++
    const source=SERVICE_PATTERNS.find(x=>x.regex.test(line))
    if(source)serviceCounts[source.id]++
    const match=SECURITY_PATTERNS.find(x=>x.expression.test(line))
    if(match)events.push({id:match.id,name:match.name,level:match.level,
      group:match.group,evidence:safeLogExcerpt(line)})
    if(level!=='other'||match)recentNotices.push({
      level:match?.level||(level==='error'?'high':'low'),
      name:match?.name||(level==='error'?'错误日志':'警告日志'),
      evidence:safeLogExcerpt(line),
      type:match?.id||level
    })
  }
  const byType=SECURITY_PATTERNS.map(x=>({
    id:x.id,name:x.name,level:x.level,group:x.group,rule:x.rule,
    count:events.filter(e=>e.id===x.id).length
  }))
  const serviceActivity=SERVICE_PATTERNS.map(x=>({
    id:x.id,name:x.name,count:serviceCounts[x.id]
  })).sort((a,b)=>b.count-a.count)
  return {
    scannedLines:lines.length,
    events:events.slice(-120),byType,total:events.length,
    securityTotal:events.filter(e=>e.group==='security').length,
    healthTotal:events.filter(e=>e.group==='health').length,
    severity,serviceActivity,
    recentNotices:recentNotices.slice(-12).reverse()
  }
}
export async function readSecurityReport(client) {
  const types=['system','kernel']
  const results=await Promise.allSettled(types.map(type=>readRouterLogs(client,type)))
  const sources=results.map((result,i)=>({
    type:types[i],label:types[i]==='system'?'系统日志':'内核日志',
    available:result.status==='fulfilled'&&!!String(result.value?.output||'').trim(),
    source:result.status==='fulfilled'?result.value?.source||'':'',
    lines:result.status==='fulfilled'?
      String(result.value?.output||'').split(/\r?\n/).filter(Boolean).length:0
  }))
  const successful=results.filter(x=>x.status==='fulfilled'&&x.value?.output?.trim())
    .map(x=>x.value)
  if(!successful.length)throw new Error('当前账户无法读取到系统和内核日志；请检查 ubus RPC 权限')
  return {...analyzeSecurityLogs(successful.map(x=>x.output)),sources,
    note:'仅分析本次取得的日志窗口；未命中不等于没有攻击。部分规则需在路由器启用相应日志后才会出现命中。'}
}
