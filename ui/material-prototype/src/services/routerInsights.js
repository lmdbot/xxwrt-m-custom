import { readWolDevices } from './router.js'
import { readWirelessStations } from './telemetry.js'
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
const SAFE_MAC=/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/
function parseLldpResponse(raw) {
  if (!raw || typeof raw.stdout!=='string' || Number(raw.code??1)!==0) return []
  let obj
  try { obj=JSON.parse(raw.stdout) } catch (_) { return [] }
  const root=obj.lldp?.interface || obj.interface || {}
  const result=[]
  for (const [iface,rawPeer] of Object.entries(root)) {
    if (!/^[A-Za-z0-9_.:-]{1,32}$/.test(iface)) continue
    const peers=Array.isArray(rawPeer)?rawPeer:[rawPeer]
    for (const peer of peers) {
      const label=peer?.chassis?.name?.value || peer?.chassis?.name ||
        peer?.chassis?.descr?.value || peer?.port?.descr?.value ||
        peer?.port?.id?.value || ''
      const name=String(label).slice(0,80)
      if (name) result.push({
        id:'lldp-'+iface+'-'+result.length,name,ip:'',mac:'',
        detail:iface,medium:iface,source:'LLDP 邻居',
        sources:['lldp'],linkType:'lldp',confirmed:true,status:'observed'
      })
    }
  }
  return result.slice(0,35)
}
const validMac=value=>SAFE_MAC.test(String(value||'').toUpperCase())
const usefulName=value=>String(value||'').trim() &&
  !/^(?:未知设备|unknown(?: device)?|--|n\/a)$/i.test(String(value||'').trim())
const safeText=(value,max=100)=>String(value||'').trim().slice(0,max)
export function buildTopologyGraph(neighbors=[],wifi=[],lldp=[],leases=[],hints={}) {
  const byMac=new Map()
  const add=(raw,source)=>{
    const mac=safeText(raw?.mac||raw?.macaddr||'',24).toUpperCase()
    if (!validMac(mac)) return
    const old=byMac.get(mac)
    const nextName=safeText(raw?.name||raw?.hostname,80)
    const name=usefulName(nextName)?nextName:old?.name||'未知设备'
    const ip=safeText(raw?.ip||raw?.ipaddr||raw?.ip6addr||raw?.address,64)
    const sources=[...new Set([...(old?.sources||[]),source])]
    byMac.set(mac,{
      id:'mac-'+mac,mac,name,ip:ip||old?.ip||'',
      detail:ip||old?.ip||mac,
      medium:old?.medium||'接入方式未知',
      source:sources.includes('dhcp')?'DHCP 租约 / 地址提示':'历史邻居 / 地址提示',
      sources,linkType:old?.linkType||'inferred',
      confirmed:old?.confirmed||false,status:old?.status||'unknown'
    })
  }
  for (const item of neighbors||[]) add(item,'hints')
  for (const [mac,raw] of Object.entries(hints||{})) {
    if (!validMac(mac)) continue
    add({mac,name:raw?.name,ip:raw?.ipaddrs?.[0]||raw?.ip6addrs?.[0]},'hints')
  }
  const leaseRows=Array.isArray(leases)?leases:[
    ...(leases?.dhcp_leases||[]),...(leases?.dhcp6_leases||[])
  ]
  for (const item of leaseRows) add(item,'dhcp')
  for (const station of wifi||[]) {
    const mac=safeText(station?.mac||'',24).toUpperCase()
    if (!validMac(mac)) continue
    const old=byMac.get(mac)
    const sources=[...new Set([...(old?.sources||[]),'wifi'])]
    byMac.set(mac,{
      id:'mac-'+mac,mac,name:old?.name||'未知设备',
      detail:old?.detail||mac,ip:old?.ip||'',
      medium:'Wi-Fi '+safeText(station.device,32),
      source:'当前无线关联',sources,linkType:'wifi',
      confirmed:true,status:'observed'
    })
  }
  const nodes=[...(lldp||[]),...byMac.values()].slice(0,120)
  return {nodes,confirmed:nodes.filter(x=>x.confirmed).length,
    inferred:nodes.filter(x=>!x.confirmed).length}
}
export async function readRouterTopology(client) {
  const settled=await Promise.allSettled([
    readWolDevices(client),
    readWirelessStations(client),
    client.call('file','exec',{
      command:'/usr/sbin/lldpcli',params:['-f','json','show','neighbors'],env:null
    },true),
    client.call('luci-rpc','getDHCPLeases',{},true),
    client.call('luci-rpc','getHostHints',{},true)
  ])
  const val=i=>settled[i].status==='fulfilled'?settled[i].value:null
  const known=val(0),wireless=val(1),lldpReply=val(2)
  const leases=val(3),hints=val(4)
  const graph=buildTopologyGraph(known?.known||known?.neighbors||[],
    wireless?.stations||[],parseLldpResponse(lldpReply),leases,hints)
  const sources={
    hints:hints!=null || Array.isArray(known?.known),
    dhcp:leases!=null,
    wifi:!!wireless?.available,
    lldp:!!lldpReply && Number(lldpReply.code??1)===0
  }
  return {...graph,sources,
    note:'Host 提示和 DHCP 租约只能提示设备信息，不能证明当前在线；Wi-Fi 当前关联和 LLDP 邻接是直接观测证据。分组示意连线不是实际物理拓扑。'}
}
export const SECURITY_PATTERNS=Object.freeze([
  {id:'login',name:'登录认证失败',level:'high',expression:/failed password|authentication failure|invalid user|login failed|bad password|unauthorized login/i},
  {id:'firewall',name:'防火墙拦截',level:'medium',expression:/\b(?:drop|reject|blocked|denied)\b.*(?:SRC=|DPT=|IN=|firewall|nft|iptables)/i},
  {id:'scan',name:'疑似端口扫描/洪泛',level:'high',expression:/port.?scan|syn.?flood|scan detected|possible scan|nmap probe/i},
  {id:'dns',name:'DNS Rebind 防护',level:'low',expression:/dns.rebind|rebind protection/i}
])
export function analyzeSecurityLogs(outputs) {
  const lines=[...new Set(outputs.flatMap(s=>String(s||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)))]
  const events=[]
  for(const line of lines) {
    const match=SECURITY_PATTERNS.find(x=>x.expression.test(line))
    if(match)events.push({id:match.id,name:match.name,level:match.level,
      // Retain bounded excerpts only in memory. Do not save them to history or audit.
      evidence:line.slice(0,320)})
  }
  const byType=SECURITY_PATTERNS.map(x=>({
    id:x.id,name:x.name,level:x.level,count:events.filter(e=>e.id===x.id).length
  })).filter(x=>x.count>0)
  return {scannedLines:lines.length,events:events.slice(-120),byType,total:events.length}
}
export async function readSecurityReport(client) {
  const sources=await Promise.allSettled([
    readRouterLogs(client,'system'),readRouterLogs(client,'kernel')
  ])
  const successful=sources.filter(x=>x.status==='fulfilled').map(x=>x.value)
  if(!successful.length)throw new Error('当前账户无法读取系统或内核日志')
  return { ...analyzeSecurityLogs(successful.map(x=>x.output)),
    sources:successful.map(x=>x.source),note:'仅分析当前读取到的日志行；未命中不等于没有入侵事件。规则匹配不是攻击归因。'
  }
}
