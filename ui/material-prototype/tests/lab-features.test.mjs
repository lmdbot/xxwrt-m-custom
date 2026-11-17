import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LAB_PREFS_KEY,LAB_CARDS_KEY,LAB_ROUTES_KEY,REFRESH_PRESETS,
  sanitizeLabSettings,refreshIntervals,loadLabSettings,saveLabSettings,
  loadOverviewCards,saveOverviewCards,normalizeOverviewCards,
  rearrangeOverviewCards,toggleOverviewCard,resetAllLabPreferences,
  enableRpcTrace,recordRpcTrace,getRpcTrace,
  normalizeTrustedAlternative,sameRouterIdentity,
  passiveNetworkHealth,parsePingResult,runNetworkHealthProbes
} from '../src/services/labFeatures.js'

function memoryStorage() {
  const all=new Map()
  return {
    getItem:key=>all.get(key)??null,
    setItem:(key,value)=>{all.set(key,String(value))},
    removeItem:key=>all.delete(key),
    has:key=>all.has(key)
  }
}

test('refresh presets are bounded and preserve the original 12/3/15 default',()=>{
  assert.deepEqual(refreshIntervals({profile:'balanced'}),REFRESH_PRESETS.balanced)
  assert.deepEqual(refreshIntervals({profile:'saver'}),REFRESH_PRESETS.saver)
  assert.deepEqual(refreshIntervals({profile:'realtime'}),REFRESH_PRESETS.realtime)
  const settings=sanitizeLabSettings({profile:'custom',custom:{overview:100,telemetry:1,devices:999999}})
  assert.deepEqual(refreshIntervals(settings),{overview:5000,telemetry:1500,devices:120000})
  assert.equal(sanitizeLabSettings({profile:'invalid'}).profile,'balanced')
})

test('metric preferences are per-router and prevent hiding the last visible tile',()=>{
  const storage=memoryStorage()
  let cards=loadOverviewCards(storage,'router-a')
  assert.equal(cards.length,6)
  cards=rearrangeOverviewCards(cards,'温度',-1)
  assert.deepEqual(cards.slice(2,4).map(x=>x.id),['温度','存储'])
  for (const id of cards.slice(0,5).map(x=>x.id)) cards=toggleOverviewCard(cards,id)
  assert.equal(cards.filter(x=>x.visible).length,1)
  const last=cards.find(x=>x.visible).id
  assert.equal(toggleOverviewCard(cards,last).filter(x=>x.visible).length,1)
  saveOverviewCards(storage,'router-a',cards)
  assert.deepEqual(loadOverviewCards(storage,'router-a'),cards)
  assert.equal(loadOverviewCards(storage,'router-b').every(x=>x.visible),true)
})

test('RPC tracing never includes request params, response payload, URL or token',()=>{
  enableRpcTrace(true)
  recordRpcTrace('network.interface','dump',34,'success')
  recordRpcTrace('bad?token=secret','get pass!',2,'error')
  const serialized=JSON.stringify(getRpcTrace())
  assert.equal(getRpcTrace().length,2)
  assert.equal(serialized.includes('token=secret'),false)
  assert.equal(serialized.includes('pass!'),false)
  enableRpcTrace(false)
  assert.deepEqual(getRpcTrace(),[])
})

test('only HTTPS or private IPv4 HTTP backup origin can be saved',()=>{
  assert.equal(normalizeTrustedAlternative('http://192.168.100.1'),'http://192.168.100.1')
  assert.equal(normalizeTrustedAlternative('https://router.example.com'),'https://router.example.com')
  assert.throws(()=>normalizeTrustedAlternative('http://router.example.com'),/HTTPS/)
  assert.throws(()=>normalizeTrustedAlternative('http://8.8.8.8'),/HTTPS/)
  assert.throws(()=>normalizeTrustedAlternative('https://root:secret@router.example.com'),/账号密码/)
  assert.throws(()=>normalizeTrustedAlternative('https://router.example.com/path'),/路径/)
  assert.throws(()=>normalizeTrustedAlternative('https://router.example.com/?x=1'),/参数/)
})

test('paired router identity requires same hardware marker, model and target',()=>{
  const id={marker:'mac:aa:bb:cc:dd:ee:ff',model:'test-router',target:'x86/64'}
  assert.equal(sameRouterIdentity(id,{...id}),true)
  assert.equal(sameRouterIdentity(id,{...id,marker:'mac:aa:bb:cc:dd:ee:00'}),false)
  assert.equal(sameRouterIdentity(id,{...id,target:'arm/64'}),false)
  assert.equal(sameRouterIdentity(id,{...id,marker:''}),false)
})

test('passive checks do not turn unknown evidence into healthy state',()=>{
  const unknown=passiveNetworkHealth({interfaces:[],gateway:'--',dns:'--',detectorAvailable:false})
  assert.equal(unknown.find(x=>x.label==='IPv4 默认网关').status,'unknown')
  assert.equal(unknown.find(x=>x.label==='Internet Detector').status,'unknown')
  const known=passiveNetworkHealth({
    interfaces:[{interface:'wan',up:true},{interface:'wan6',up:false}],
    gateway:'192.168.1.1',dns:'1.1.1.1',detectorAvailable:true,
    checks:[{state:'up'},{state:'down'}]
  })
  assert.equal(known.find(x=>x.label==='WAN 接口').status,'ok')
  assert.equal(known.find(x=>x.label==='WAN6 接口').status,'fail')
  assert.equal(known.find(x=>x.label==='Internet Detector').status,'warn')
})

test('Ping parser distinguishes success, total loss, and unavailable output',()=>{
  assert.equal(parsePingResult(null).status,'unknown')
  const ok=parsePingResult({stdout:'3 packets transmitted, 3 received, 0% packet loss\nrtt min/avg/max/mdev = 2.0/3.5/4.0/0.2 ms'})
  assert.equal(ok.status,'ok')
  assert.match(ok.text,/平均 3.5 ms/)
  assert.equal(parsePingResult({stdout:'3 packets transmitted, 0 received, 100% packet loss'}).status,'fail')
})

test('deep health probes only known configured IPv4 gateway and DNS',async()=>{
  const commands=[]
  const fake={call:async(object,method,args)=>{
    commands.push({object,method,args})
    return {code:0,stdout:'3 packets transmitted, 3 received, 0% packet loss'}
  }}
  const result=await runNetworkHealthProbes(fake,{gateway:'192.168.100.1',dns:'223.5.5.5,8.8.8.8'})
  assert.equal(result.length,2)
  assert.equal(commands.every(x=>x.object==='file'&&x.method==='exec'&&x.args.command==='/bin/ping'),true)
  assert.deepEqual(commands.map(x=>x.args.params.at(-1)),['192.168.100.1','223.5.5.5'])
  assert.deepEqual(await runNetworkHealthProbes(fake,{gateway:'not-an-ip',dns:'--'}),[])
})

test('global reset removes only lab keys for all routers, preserving saved router profiles',()=>{
  const storage=memoryStorage()
  storage.setItem('xxwrt_saved_devices','important-router-config')
  const dirty=saveLabSettings(storage,{profile:'realtime',cardsEnabled:true,rpcDebug:true,smartSwitch:true,healthEnabled:true})
  assert.equal(dirty.smartSwitch,true)
  saveOverviewCards(storage,'router-a',normalizeOverviewCards().reverse())
  saveOverviewCards(storage,'router-b',normalizeOverviewCards().slice(1))
  storage.setItem(LAB_ROUTES_KEY,JSON.stringify({ 'router-a':{address:'https://example.com',identity:{marker:'machine:abc'}} }))
  assert.ok(storage.has(LAB_PREFS_KEY)&&storage.has(LAB_CARDS_KEY)&&storage.has(LAB_ROUTES_KEY))
  assert.equal(resetAllLabPreferences(storage),true)
  assert.equal(storage.has(LAB_PREFS_KEY),false)
  assert.equal(storage.has(LAB_CARDS_KEY),false)
  // Router login endpoints moved out of Laboratory: reset cannot delete them.
  assert.equal(storage.has(LAB_ROUTES_KEY),true)
  assert.equal(loadLabSettings(storage).profile,'balanced')
  assert.equal(loadOverviewCards(storage,'router-a').every(x=>x.visible),true)
  assert.equal(storage.getItem('xxwrt_saved_devices'),'important-router-config')
})

test('storage denial reports reset failure rather than fabricated success',()=>{
  const storage={removeItem(){throw Error('blocked')}}
  assert.equal(resetAllLabPreferences(storage),false)
})
