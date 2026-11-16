import test from 'node:test'
import {parseCpuUsage, parseProcStat, cpuPercentFromSnapshots, readDashboard} from '../src/services/router.js'
import assert from 'node:assert/strict'
import {
  recordMetricSample, readMetricHistory, sampleFromDashboard,
  trendPoints, trendSegments, trendPlotPoints, analyzeSecurityLogs, safeLogExcerpt
} from '../src/services/routerInsights.js'
function storage() {
  const map=new Map()
  return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}
}
test('monitoring keeps real samples, null metrics and a five minute gate',()=>{
  const store=storage(),now=1700000000000
  const snapshot={cpuPercent:55,memoryPercent:72,connPercent:null,load:'1.42 0.62 0.31'}
  assert.equal(recordMetricSample(store,'router-a',snapshot,now),true)
  assert.equal(recordMetricSample(store,'router-a',snapshot,now+1000),false)
  assert.equal(recordMetricSample(store,'router-b',snapshot,now),true)
  assert.equal(recordMetricSample(store,'router-a',snapshot,now+300001),true)
  const points=readMetricHistory(store,'router-a')
  assert.equal(points.length,2)
  assert.equal(points[0].connections,null)
  assert.equal(points[0].load1,1.42)
  assert.equal(readMetricHistory(store,'router-b').length,1)
  assert.equal(sampleFromDashboard({},now).cpu,null)
})
test('trend chart keeps sample timestamp and leaves gaps for missing periods',()=>{
  const now=1700000100000
  const history=[
    {time:now-300000,cpu:42},{time:now-100000,cpu:45},
    {time:now-50000,cpu:null},{time:now-10000,cpu:47}
  ]
  const data=trendPoints(history,'h24','cpu',now)
  assert.ok(data.length>=1)
  assert.equal(data.some(x=>x.value===0),false)
  const paths=trendSegments([
    {time:now-86400000,value:12},{time:now,value:70}
  ],now-86400000,now,100)
  assert.equal(paths.length,2)
})
test('security report is based only on real matching log entries',()=>{
  const raw=[
    'Jan 01 auth: Failed password for invalid user admin',
    'Jan 01 kernel: DROP IN=eth0 SRC=1.2.3.4 DPT=22',
    'Jan 01 daemon: ordinary network startup'
  ]
  const report=analyzeSecurityLogs([raw.join('\n'),raw[0]])
  assert.equal(report.scannedLines,3)
  assert.equal(report.total,2)
  assert.equal(report.byType.length,7)
  assert.equal(report.securityTotal,2)
  assert.equal(report.healthTotal,0)
  assert.equal(report.byType.filter(x=>x.count>0).length,2)
  assert.equal(analyzeSecurityLogs(['no security events']).total,0)
})

test('router CPU parser handles different LuCI percent shapes without inventing values',()=>{
  assert.equal(parseCpuUsage({cpuusage:'12.5%'}),12.5)
  assert.equal(parseCpuUsage({cpuUsage:0}),0)
  assert.equal(parseCpuUsage({cpu_usage:' 7.25 '}),7.25)
  assert.equal(parseCpuUsage({usage:'CPU: 23%'}),23)
  assert.equal(parseCpuUsage({cpuusage:'110%'}),null)
  assert.equal(parseCpuUsage({load:'2.42'}),null)
  assert.equal(parseCpuUsage(null),null)
})
test('proc stat fallback warms up and calculates CPU utilisation from deltas',async()=>{
  const first='cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 1 1 1 1'
  const second='cpu  130 0 110 860 0 0 0 0 0 0\ncpu0 2 2 2 2'
  assert.equal(cpuPercentFromSnapshots(parseProcStat(first),parseProcStat(second)),40)
  assert.equal(cpuPercentFromSnapshots(parseProcStat(second),parseProcStat(first)),null)
  assert.equal(parseProcStat({data:'not proc stat'}),null)
  let callCount=0
  const client={
    batch:async()=>[{release:{description:'QWRT'}},{load:[65536,0,0],memory:{total:1000,available:400}},null],
    call:async()=>({data:callCount++===0?first:second})
  }
  const warm=await readDashboard(client)
  assert.equal(warm.cpuPercent,null)
  assert.equal(warm.cpuSource,'warming')
  const next=await readDashboard(client)
  assert.equal(next.cpuPercent,40)
  assert.equal(next.cpuSource,'proc-stat')
})
test('monitoring replaces a recent incomplete point when CPU becomes valid',()=>{
  const store=storage(),now=1700000000000
  assert.equal(recordMetricSample(store,'router-warmup',{cpuPercent:null,memoryPercent:65,load:'1.00'},now),true)
  assert.equal(recordMetricSample(store,'router-warmup',{cpuPercent:18,memoryPercent:64,load:'1.04'},now+12000),true)
  const history=readMetricHistory(store,'router-warmup')
  assert.equal(history.length,1)
  assert.equal(history[0].cpu,18)
  assert.equal(history[0].time,now+12000)
  assert.equal(recordMetricSample(store,'router-warmup',{cpuPercent:18,memoryPercent:64,load:'1.04'},now+14000),false)
  assert.equal(trendPlotPoints([{time:now,value:18}],now-86400000,now,100).length,1)
})

test('security dashboard shows grounded source activity, severities and all detection rules',()=>{
  const messages=[
    'Nov 16 16:01:01 daemon.info dnsmasq: DHCPACK 192.168.1.100',
    'Nov 16 16:01:03 daemon.warn netifd: wan disconnected',
    'Nov 16 16:01:05 daemon.err procd: service failed',
    'Nov 16 16:01:07 kern.err kernel: Out of memory: Killed process 123',
    'Nov 16 16:01:08 daemon.info dropbear: Bad password attempt',
    'Nov 16 16:01:09 firewall: DROP IN=eth0 SRC=203.0.113.1 DPT=22',
    'Nov 16 16:01:10 dnsmasq: possible DNS-rebind attack detected',
    'Nov 16 16:01:11 daemon.info dnsmasq: password=topSECRET123'
  ]
  const report=analyzeSecurityLogs([messages.join('\n')])
  assert.equal(report.scannedLines,8)
  assert.equal(report.securityTotal,3)
  assert.ok(report.healthTotal>=2)
  assert.ok(report.severity.error>=2)
  assert.ok(report.severity.warning>=1)
  assert.ok(report.serviceActivity.some(x=>x.id==='dnsmasq'&&x.count>=2))
  assert.equal(report.byType.length,7)
  assert.ok(report.byType.find(x=>x.id==='firewall').count>0)
  assert.ok(report.byType.find(x=>x.id==='stability').count>0)
  assert.ok(report.recentNotices.length>0)
  assert.equal(safeLogExcerpt('password=topSECRET123').includes('topSECRET123'),false)
  const clean=analyzeSecurityLogs(['Nov 16 daemon.info dnsmasq: DHCPACK 192.168.1.2'])
  assert.equal(clean.total,0)
  assert.equal(clean.byType.length,7)
  assert.equal(clean.scannedLines,1)
  assert.ok(clean.serviceActivity.some(x=>x.id==='dnsmasq'&&x.count===1))
})
