/**
 * View-only topology presentation. These functions never promote a DHCP lease,
 * hostname or historic neighbour hint into evidence of a live physical link.
 */
export const TOPOLOGY_CATEGORIES=Object.freeze([
  {id:'computer',label:'电脑 / NAS',icon:'mdi-desktop-classic'},
  {id:'mobile',label:'手机 / 平板',icon:'mdi-cellphone'},
  {id:'iot',label:'智能设备',icon:'mdi-lightbulb-outline'},
  {id:'other',label:'其他已命名',icon:'mdi-devices'},
  {id:'unknown',label:'未知设备',icon:'mdi-help-circle-outline'}
])
const UNKNOWN=/^(?:未知设备|unknown(?: device)?|--|n\/a|\?)$/i
const MAC=/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i
export function topologyFriendlyName(input) {
  const raw=String(input||'').trim().slice(0,100)
  if (!raw || UNKNOWN.test(raw) || MAC.test(raw)) return '未知设备'
  const base=raw.replace(/\.lan$/i,'')
  if (/^nas-fn-nec8$/i.test(base)) return '飞牛 NAS（NEC8）'
  if (/^vivo[-_]?x100s$/i.test(base)) return 'vivo X100s'
  if (/^zimi[-_]powerstrip\b/i.test(base)) return '紫米插线板'
  if (/^yeelink[-_]light\b/i.test(base)) return '米家智能灯'
  if (/^roborock[-_]vacuum\b/i.test(base)) return '石头扫地机器人'
  return base.replace(/_/g,' ').slice(0,80)||'未知设备'
}
export function topologyNodeCategory(input) {
  const name=String(input||'').toLowerCase()
  if (!name || UNKNOWN.test(name) || MAC.test(name)) return 'unknown'
  if (/(?:^|[-_. ])(?:nas|fn|synology|qnap|freenas|truenas|pc|desktop|laptop|thinkpad|alienware|macbook|imac|workstation)(?:$|[-_. ])/i.test(name)) return 'computer'
  if (/(?:iphone|ipad|ipod|vivo|redmi|oppo|oneplus|honor|huawei|pixel|galaxy|samsung|xiaomi.*phone|android|tablet)/i.test(name)) return 'mobile'
  if (/(?:yeelink|zimi|miio|miwifi|chuangmi|roborock|robo[-_]?vac|vacuum|camera|webcam|iot|sensor|light|lamp|powerstrip|plug|speaker|soundbox|printer|tuya|esp32|esp8266)/i.test(name)) return 'iot'
  return 'other'
}
export function topologyViewNodes(nodes=[]) {
  return (Array.isArray(nodes)?nodes:[]).map(raw=>{
    const name=topologyFriendlyName(raw.name)
    const category=topologyNodeCategory(raw.name)
    const sources=Array.isArray(raw.sources)?raw.sources:[]
    const direct=raw.confirmed===true && (raw.linkType==='wifi'||raw.linkType==='lldp'||
      sources.includes('wifi')||sources.includes('lldp'))
    const linkType=direct?(raw.linkType==='lldp'?'lldp':'wifi'):'inferred'
    const ip=String(raw.ip||'').trim().slice(0,64)
    const mac=MAC.test(String(raw.mac||''))?String(raw.mac).toUpperCase():''
    return {
      ...raw,name,category,ip,mac,sources,confirmed:direct,linkType,
      // Never equate an address hint or an unexpired lease with being online.
      observation:direct?(linkType==='wifi'?'当前 Wi-Fi 关联':'LLDP 邻接'):'在线状态未知',
      identityKnown:category!=='unknown',
      displaySource:linkType==='wifi'?'无线关联':linkType==='lldp'?'LLDP':
        sources.includes('dhcp')?'DHCP 租约 / 地址提示':'Host 提示 / 历史邻居',
      icon:TOPOLOGY_CATEGORIES.find(x=>x.id===category)?.icon||'mdi-devices'
    }
  })
}
export function topologyOverview(nodes=[],sources={}) {
  const direct=nodes.filter(node=>node.confirmed).length
  const total=nodes.length
  const wifi=nodes.filter(node=>node.linkType==='wifi'&&node.confirmed).length
  const lldp=nodes.filter(node=>node.linkType==='lldp'&&node.confirmed).length
  const named=nodes.filter(node=>node.identityKnown).length
  // Coverage is an observation ratio, NOT a claim about complete topology.
  const ratio=total?direct/total:0
  const coverage=direct===0?'low':ratio>=0.8&&lldp>0?'high':'medium'
  return {total,direct,inferred:total-direct,wifi,lldp,named,unknown:total-named,
    coverage,coverageLabel:coverage==='low'?'低':coverage==='high'?'较高':'部分',
    sourceState:{
      hints:!!sources.hints,dhcp:!!sources.dhcp,
      wifi:!!sources.wifi,lldp:!!sources.lldp
    }}
}
export function topologyGroups(nodes=[]) {
  return TOPOLOGY_CATEGORIES.map(group=>({
    ...group,nodes:nodes.filter(node=>node.category===group.id)
  })).filter(group=>group.nodes.length)
}
export function filterTopologyNodes(nodes=[],{search='',category='all',source='all',
  identity='all',observedOnly=false}={}) {
  const q=String(search||'').trim().toLowerCase()
  return nodes.filter(node=>
    (category==='all'||node.category===category) &&
    (identity==='all'||(identity==='named'?node.identityKnown:!node.identityKnown)) &&
    (!observedOnly||node.confirmed) &&
    (source==='all'||node.sources.includes(source)) &&
    (!q||[node.name,node.ip,node.mac,node.displaySource, String(node.detail||'')]
      .some(value=>String(value).toLowerCase().includes(q)))
  )
}
