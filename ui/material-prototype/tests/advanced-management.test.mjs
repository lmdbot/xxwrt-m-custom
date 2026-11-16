import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateDdNsUpdate, readDdNsConfig, validateOpenClashConfigName,
  readOpenClashDetails, validateNewFirewallRule, readAdvancedFirewall,
  validateCronSchedule, parseCrontab, makeCrontabChange, applyCrontabChange
} from '../src/services/advancedManagement.js'

test('DDNS edits validate domain and interface and omit credentials',()=>{
  const values=validateDdNsUpdate('home',{
    enabled:true,domain:'example.com',lookupHost:'home.example.com',
    interface:'wan6',useIpv6:true,password:'must-not-copy'
  })
  assert.deepEqual(values,{
    enabled:'1',domain:'example.com',lookup_host:'home.example.com',interface:'wan6',use_ipv6:'1'
  })
  assert.equal(JSON.stringify(values).includes('must-not-copy'),false)
  assert.throws(()=>validateDdNsUpdate('home;bad',{interface:'wan'}))
  assert.throws(()=>validateDdNsUpdate('home',{interface:'wan;reboot'}))
})
test('DDNS discovers ddns-go without pretending it has UCI service records',async()=>{
  const result=await readDdNsConfig({call:async(object,method,args)=>
    object==='rc'?{'ddns-go':{running:true}}:null})
  assert.equal(result.ddnsGo.state,'运行中')
  assert.equal(result.sections.length,0)
})
test('OpenClash lists known configs and redacts subscription URLs',async()=>{
  const result=await readOpenClashDetails({call:async(object,method,args)=>{
    if(object==='uci')return {values:{
      config:{'.type':'openclash',config_path:'/etc/openclash/config/home.yaml'},
      sub1:{'.type':'config_subscribe',name:'SubA',address:'https://private?token=DO_NOT_LEAK',enabled:'1'}
    }}
    if(object==='file'&&method==='list')return {entries:[{name:'home.yaml'},{name:'ignore.sh'}]}
    if(object==='file')return {data:'started'}
    return {openclash:{running:true}}
  }})
  assert.deepEqual(result.configs,['home.yaml'])
  assert.equal(result.subscriptions.length,1)
  assert.equal(JSON.stringify(result).includes('DO_NOT_LEAK'),false)
  assert.equal(validateOpenClashConfigName('home.yaml',result.configs),
    '/etc/openclash/config/home.yaml')
  assert.throws(()=>validateOpenClashConfigName('../etc/passwd',result.configs))
})
test('Firewall rule builder enforces existing zones, IP family and bounded ports',()=>{
  const zones=[{name:'wan'},{name:'lan'}]
  const rule=validateNewFirewallRule({
    name:'Block-v6',src:'wan',family:'ipv6',proto:'tcp',
    port:'443',target:'DROP',srcIp:'2001:db8::/64'
  },zones)
  assert.equal(rule.family,'ipv6')
  assert.equal(rule.src_ip,'2001:db8::/64')
  assert.throws(()=>validateNewFirewallRule({name:'bad',src:'wan',
    family:'ipv4',srcIp:'2001:db8::1'},zones))
  assert.throws(()=>validateNewFirewallRule({name:'bad',src:'wan',
    proto:'tcp',port:'22;reboot'},zones))
  assert.throws(()=>validateNewFirewallRule({name:'bad',src:'unknown'},zones))
})
test('Firewall config lists current zone names with no fake rule counts',async()=>{
  const result=await readAdvancedFirewall({call:async()=>({values:{
    zone1:{'.type':'zone',name:'wan'},
    rule1:{'.type':'rule',name:'Accept-DNS',target:'ACCEPT',enabled:'1'}
  }})})
  assert.deepEqual(result.zones,[{id:'zone1',name:'wan'}])
  assert.equal(result.rules.length,1)
})
test('Cron parser handles disabled tasks and preserves unknown entries',()=>{
  const cron='# comment\n0 4 * * * /etc/init.d/ddns restart\n# 5 2 * * 0 /sbin/task\n@reboot /usr/bin/custom\n'
  const entries=parseCrontab(cron)
  assert.equal(entries.length,2)
  assert.equal(entries[0].enabled,true)
  assert.equal(entries[1].disabled,true)
  const toggled=makeCrontabChange(cron,'toggle',{index:1,enabled:false})
  assert.match(toggled,/# 0 4 \* \* \* \/etc\/init.d\/ddns restart/)
  assert.match(toggled,/@reboot \/usr\/bin\/custom/)
  assert.equal(validateCronSchedule('0 4 * * 0'),'0 4 * * 0')
  assert.throws(()=>validateCronSchedule('* * * * *; reboot'))
  assert.throws(()=>validateCronSchedule('60 4 * * *'))
  assert.throws(()=>makeCrontabChange(cron,'preset',{preset:'custom',schedule:'0 4 * * *'}))
})
test('Cron file changes have compare-and-swap preflight and confirmed readback',async()=>{
  let value='0 4 * * * /sbin/task\n'
  const calls=[]
  const client={call:async(obj,method,args)=>{
    calls.push([obj,method,args])
    if(obj==='file'&&method==='read')return {data:value}
    if(obj==='file'&&method==='write'){value=args.data;return {}}
    if(obj==='rc')return {}
    throw new Error('unexpected operation')
  }}
  const next=makeCrontabChange(value,'toggle',{index:0,enabled:false})
  await applyCrontabChange(client,value,next)
  assert.equal(value,next)
  assert.equal(calls.some(x=>x[0]==='rc'&&x[1]==='init'),true)
  await assert.rejects(()=>applyCrontabChange(client,'a stale copy',next),/已被其他管理端修改/)
})
