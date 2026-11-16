import test from 'node:test'
import assert from 'node:assert/strict'
import {buildTopologyGraph} from '../src/services/routerInsights.js'
import {
  topologyFriendlyName, topologyNodeCategory, topologyViewNodes,
  topologyOverview,topologyGroups,filterTopologyNodes
} from '../src/services/topologyPresentation.js'

test('topology does not label historical hints or DHCP leases online',()=>{
  const graph=buildTopologyGraph(
    [{name:'NAS-FN-Nec8.lan',mac:'AA:BB:CC:DD:EE:10',ip:'192.168.100.8'},
     {name:'未知设备',mac:'AA:BB:CC:DD:EE:11',ip:'192.168.100.9'}],
    [],[],{dhcp_leases:[{hostname:'NAS-FN-Nec8.lan',
      macaddr:'AA:BB:CC:DD:EE:10',ipaddr:'192.168.100.8'}]})
  const nodes=topologyViewNodes(graph.nodes)
  assert.equal(graph.confirmed,0)
  assert.equal(nodes.length,2)
  assert.equal(nodes[0].confirmed,false)
  assert.equal(nodes[0].observation,'在线状态未知')
  assert.equal(nodes[0].name,'飞牛 NAS（NEC8）')
  assert.deepEqual(nodes[0].sources,['hints','dhcp'])
  assert.equal(topologyOverview(nodes).coverage,'low')
  assert.equal(topologyOverview(nodes).unknown,1)
  assert.equal(topologyNodeCategory('未知设备'),'unknown')
})
test('only direct Wi-Fi association and LLDP neighbour count as observed',()=>{
  const graph=buildTopologyGraph(
    [{name:'vivo-X100s.lan',mac:'AA:BB:CC:DD:EE:12',ip:'192.168.100.23'},
     {name:'zimi-powerstrip-v2_miio123.lan',mac:'AA:BB:CC:DD:EE:13'}],
    [{mac:'AA:BB:CC:DD:EE:12',device:'wlan0'}],
    [{id:'lldp-lan0-0',name:'Managed switch',detail:'lan0',
      linkType:'lldp',confirmed:true,sources:['lldp']}],
    {dhcp_leases:[]})
  const nodes=topologyViewNodes(graph.nodes)
  const summary=topologyOverview(nodes,{hints:true,dhcp:true,wifi:true,lldp:true})
  assert.equal(summary.total,3)
  assert.equal(summary.direct,2)
  assert.equal(summary.wifi,1)
  assert.equal(summary.lldp,1)
  assert.equal(summary.inferred,1)
  assert.equal(summary.coverage,'medium')
  assert.equal(nodes.find(x=>x.mac==='AA:BB:CC:DD:EE:12').observation,'当前 Wi-Fi 关联')
  assert.equal(nodes.find(x=>x.mac==='AA:BB:CC:DD:EE:13').observation,'在线状态未知')
  assert.equal(nodes.find(x=>x.linkType==='lldp').observation,'LLDP 邻接')
  assert.equal(nodes.find(x=>x.mac==='AA:BB:CC:DD:EE:13').name,'紫米插线板')
  assert.equal(filterTopologyNodes(nodes,{observedOnly:true}).length,2)
  assert.equal(filterTopologyNodes(nodes,{source:'dhcp'}).length,0)
  assert.equal(filterTopologyNodes(nodes,{search:'192.168.100.23'}).length,1)
  assert.equal(filterTopologyNodes(nodes,{identity:'unknown'}).length,0)
})
test('grouped topology summarises unknown devices instead of making 30 links',()=>{
  const raw=Array.from({length:30},(_,i)=>({
    id:'mac-'+i,name:i<13?'Device-'+i:'未知设备',
    mac:'AA:BB:CC:DD:EE:'+i.toString(16).padStart(2,'0').toUpperCase(),
    confirmed:false,source:'历史邻居 / 地址提示',sources:['hints']
  }))
  const nodes=topologyViewNodes(raw)
  const groups=topologyGroups(nodes)
  assert.equal(groups.reduce((count,group)=>count+group.nodes.length,0),30)
  assert.equal(groups.find(x=>x.id==='unknown').nodes.length,17)
  assert.equal(topologyOverview(nodes).named,13)
  assert.equal(filterTopologyNodes(nodes,{identity:'unknown'}).length,17)
  assert.equal(filterTopologyNodes(nodes,{category:'other'}).length,13)
  assert.equal(topologyFriendlyName('MiAiSoundbox.lan'),'MiAiSoundbox')
})
test('an unrecognised network source is not misrepresented as current',()=>{
  const nodes=topologyViewNodes([{id:'hint',name:'some-host',confirmed:true,
    sources:['hints'],source:'历史提示'}])
  assert.equal(nodes[0].confirmed,false)
  assert.equal(topologyOverview(nodes).direct,0)
  assert.equal(filterTopologyNodes(nodes,{observedOnly:true}).length,0)
})
