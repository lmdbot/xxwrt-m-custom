import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FIREWALL_NFT_COMMAND, FIREWALL_LEGACY_COMMAND,
  parseNftFirewall, parseLegacyFirewall, probeFirewallRuntime,
  firewallStatusPresentation
} from '../src/services/firewallRuntime.js'

const nftRules = (loaded = true, nat = true) => ({
  code: 0, stdout: JSON.stringify({ nftables: loaded ? [
    { metainfo: { version: '1.0.9' } },
    { table: { family: 'inet', name: 'fw4' } },
    { chain: { family: 'inet', table: 'fw4', name: 'input', hook: 'input', type: 'filter' } },
    { chain: { family: 'inet', table: 'fw4', name: 'forward', hook: 'forward', type: 'filter' } },
    ...(nat ? [{ rule: { family: 'inet', table: 'fw4', chain: 'srcnat',
      expr: [{ masquerade: null }] } }] : [])
  ] : [{ table: { family: 'inet', name: 'not_fw4' } }] })
})
const fw3 = { code: 0, stdout: '*filter\n:INPUT ACCEPT [0:0]\n:zone_lan_input - [0:0]\n:zone_wan_forward - [0:0]\nCOMMIT\n*nat\n-A zone_wan_postrouting -j MASQUERADE\nCOMMIT\n' }
const emptyLegacy = { code:0, stdout:'*filter\n:INPUT ACCEPT [0:0]\n:FORWARD ACCEPT [0:0]\nCOMMIT\n' }
const client = responses => ({ call: async (obj, method, args) => {
  assert.equal(obj, 'file')
  assert.equal(method, 'exec')
  return responses[args.command] ?? null
} })

test('fw4 runtime is based on kernel nftables base hooks, not procd.running', async () => {
  assert.deepEqual(FIREWALL_NFT_COMMAND.params, ['--terse','--json','list','ruleset'])
  const runtime = await probeFirewallRuntime(client({
    '/usr/sbin/nft': nftRules()
  }))
  assert.equal(runtime.state, 'loaded')
  assert.equal(runtime.backend, 'fw4')
  assert.equal(runtime.nat, '普通源地址转换')
  const status = firewallStatusPresentation(runtime, true, { enabled:true, running:false })
  assert.equal(status.label, '规则已加载')
  assert.equal(status.color, 'success')
  assert.match(status.text, /fw4 \/ nftables/)
})
test('loaded kernel rules override disabled boot service, but show it', () => {
  const text = firewallStatusPresentation({ state:'loaded', backend:'fw4' },
    true, { enabled:false, running:false }).text
  assert.match(text, /开机启动已禁用/)
  assert.match(text, /已在内核检测到/)
})
test('fw4 table without hooked chains is not treated as proof of running firewall', () => {
  const data = { code:0, stdout: JSON.stringify({ nftables:[
    {table:{family:'inet',name:'fw4'}},
    {chain:{family:'inet',table:'fw4',name:'custom'}}
  ]})}
  assert.equal(parseNftFirewall(data).loaded, false)
  assert.equal(parseNftFirewall({code:0,stdout:'{not-json'}), null)
  assert.equal(parseNftFirewall({code:1,stderr:'Permission denied'}), null)
})
test('legacy fw3 firewall is detected with iptables-save, never any empty filter table', async () => {
  assert.equal(FIREWALL_LEGACY_COMMAND.command, '/usr/sbin/iptables-save')
  const runtime = await probeFirewallRuntime(client({
    '/usr/sbin/nft': nftRules(false),
    '/usr/sbin/iptables-save': fw3
  }))
  assert.equal(runtime.state,'loaded')
  assert.equal(runtime.backend,'fw3')
  assert.equal(runtime.nat,'普通源地址转换')
  assert.equal(parseLegacyFirewall(emptyLegacy).loaded,false)
})
test('explicitly no fw4 and no fw3 rules is different from inaccessible runtime', async () => {
  const missing = await probeFirewallRuntime(client({
    '/usr/sbin/nft': nftRules(false),
    '/usr/sbin/iptables-save': emptyLegacy
  }))
  assert.equal(missing.state,'not-loaded')
  assert.equal(firewallStatusPresentation(missing,true).label,'未检测到规则')
  const noAcl = await probeFirewallRuntime(client({}))
  assert.equal(noAcl.state,'unknown')
  assert.equal(firewallStatusPresentation(noAcl,true,{enabled:true}).label,'无法核实')
})
test('partially-readable backend or malformed command output never claims stopped', async () => {
  const cases = [
    { '/usr/sbin/nft': nftRules(false) },
    { '/usr/sbin/iptables-save': fw3, '/usr/sbin/nft': {code:1,stderr:'not found'} },
    { '/usr/sbin/iptables-save': emptyLegacy },
    { '/usr/sbin/nft': {code:0,stdout:'not json'}, '/usr/sbin/iptables-save': emptyLegacy }
  ]
  const results = await Promise.all(cases.map(x=>probeFirewallRuntime(client(x))))
  assert.deepEqual(results.map(x=>x.state),['unknown','loaded','unknown','unknown'])
})
test('fullcone and unrelated nft tables never leak into fw4 NAT classification', () => {
  const input = nftRules()
  const payload = JSON.parse(input.stdout)
  payload.nftables[4].rule.expr=[{fullcone:null}]
  payload.nftables.push({rule:{family:'inet',table:'unrelated',expr:[{masquerade:null}]}})
  assert.equal(parseNftFirewall({code:0,stdout:JSON.stringify(payload)}).nat,'Full Cone NAT')
  assert.equal(parseNftFirewall(nftRules(true,false)).nat,'未检测到 NAT 规则')
})
test('missing UCI config reports permission separately from kernel state',()=>{
  const status=firewallStatusPresentation({state:'loaded',backend:'fw4'},false)
  assert.equal(status.label,'配置不可读')
})
