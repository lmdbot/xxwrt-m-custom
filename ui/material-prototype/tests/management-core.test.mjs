import test from 'node:test'
import assert from 'node:assert/strict'
import {
  rpcAuditDescriptor, appendAuditRecord, readAuditRecords,
  hasPendingUciChanges, prepareUciChange, applyProtectedUci,
  pendingProtectedUci, finishProtectedUci, discoverRouterCapabilities
} from '../src/services/managementCore.js'

function storage() {
  const map=new Map()
  return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}
}
test('audit records redact values and never store secrets', () => {
  const store=storage(),url='https://router.test'
  const metadata=rpcAuditDescriptor('uci','set',{
    config:'ddns',section:'myddns',values:{password:'ULTRA_SECRET'}
  })
  assert.deepEqual(metadata,{action:'uci.set',resource:'ddns.myddns'})
  assert.equal(rpcAuditDescriptor('uci','get',{config:'ddns'}),null)
  assert.equal(rpcAuditDescriptor('file','read',{path:'/etc/shadow'}),null)
  appendAuditRecord(store,url,{...metadata,status:'success',time:1200})
  const data=readAuditRecords(store,url)
  assert.equal(data.length,1)
  assert.equal(data[0].resource,'ddns.myddns')
  assert.equal(JSON.stringify(data).includes('ULTRA_SECRET'),false)
  assert.equal(readAuditRecords(store,'another-router').length,0)
})
test('UCI preflight detects staged changes and rejects unsafe names', async()=>{
  assert.equal(hasPendingUciChanges({changes:{}}),false)
  assert.equal(hasPendingUciChanges({changes:{network:['x']}}),true)
  await assert.rejects(()=>prepareUciChange({call:async()=>({})},
    [{config:'cron',section:'a',values:{name:'x'}}]),/禁止修改/)
  await assert.rejects(()=>prepareUciChange({call:async()=>({})},
    [{config:'firewall',section:'a;echo hi',values:{name:'x'}}]),/名称不合法/)
})
test('protected UCI transaction validates baseline, applies rollback and confirms explicitly',async()=>{
  const calls=[]
  const client={call:async(obj,method,args={})=>{
    calls.push({obj,method,args})
    if(method==='get')return {values:{'.type':'rule',name:'blocked',enabled:'0'}}
    if(method==='changes')return {changes:{}}
    return {}
  }}
  const plan=await prepareUciChange(client,[
    {config:'firewall',section:'rule1',values:{enabled:'1'}}
  ])
  assert.deepEqual(plan.summary[0].fields,['enabled'])
  const transaction=await applyProtectedUci(client,plan)
  assert.equal(transaction.status,'pending')
  assert.equal(calls.some(x=>x.method==='apply'&&x.args.rollback===true&&x.args.timeout===90),true)
  assert.equal(pendingProtectedUci(client),transaction)
  await assert.rejects(()=>applyProtectedUci(client,plan),/待确认/)
  await finishProtectedUci(client,transaction,true)
  assert.equal(calls.at(-1).method,'confirm')
  assert.equal(pendingProtectedUci(client),null)
})
test('protected UCI transaction refuses clobbering LuCI changes',async()=>{
  const client={call:async(obj,method)=>{
    if(method==='get')return {values:{'.type':'service',enabled:'0'}}
    if(method==='changes')return {changes:{ddns:[['set','a']]}}
    return {}
  }}
  const plan=await prepareUciChange(client,[{
    config:'ddns',section:'a',values:{enabled:'1'}
  }])
  await assert.rejects(()=>applyProtectedUci(client,plan),/尚未处理/)
})
test('capabilities are based on observed firmware, not guessed from router name',async()=>{
  const client={call:async(obj,method,args)=>{
    if(obj==='system'&&method==='board')return {release:{distribution:'OpenWrt',description:'OpenWrt 24'}}
    if(obj==='system'&&method==='info')return {uptime:10}
    if(obj==='rc')return {openclash:{enabled:true},'ddns-go':{running:true}}
    if(obj==='uci'&&args.config==='firewall')return {values:{zone1:{'.type':'zone'}}}
    return null
  }}
  const data=await discoverRouterCapabilities(client)
  assert.equal(data.firmware,'OpenWrt')
  assert.equal(data.features.find(x=>x.id==='firewall').state,'available')
  assert.equal(data.features.find(x=>x.id==='ddnsGo').state,'available')
  assert.equal(data.features.find(x=>x.id==='network').state,'unknown')
})
