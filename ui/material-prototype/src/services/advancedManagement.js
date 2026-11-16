import { prepareUciChange } from './managementCore.js'

const SECTION = /^[A-Za-z_][A-Za-z0-9_]*$/
const CRON_PATH = '/etc/crontabs/root'
const CRON_PRESETS = Object.freeze({
  'ddns': { label: '重启 DDNS Scripts', command: '/etc/init.d/ddns restart >/dev/null 2>&1' },
  'openclash': { label: '重启 OpenClash', command: '/etc/init.d/openclash restart >/dev/null 2>&1' }
})
export const CRON_PRESET_OPTIONS = Object.entries(CRON_PRESETS)
  .map(([value, item]) => ({ title: item.label, value }))
export const CRON_SCHEDULE_OPTIONS = Object.freeze([
  { title: '每天凌晨 04:00', value: '0 4 * * *' },
  { title: '每周日 04:00', value: '0 4 * * 0' },
  { title: '每月 1 日 04:00', value: '0 4 1 * *' }
])
function uciRows(response) {
  return Object.entries(response?.values || {}).map(([id, values]) =>
    ({ id, type: String(values?.['.type'] || ''),
      values: values && typeof values === 'object' ? values : {} }))
}
function pickText(raw) {
  if (typeof raw === 'string') return raw
  if (typeof raw?.data === 'string') return raw.data
  if (typeof raw?.stdout === 'string') return raw.stdout
  return ''
}
export async function readDdNsConfig(client) {
  const [uci, services] = await Promise.all([
    client.call('uci','get',{config:'ddns'},true),
    client.call('rc','list',{},true)
  ])
  const sections = uciRows(uci).filter(x => x.type === 'service')
  return {
    supported: Boolean(uci?.values || services?.ddns),
    ddnsGo: services && Object.hasOwn(services, 'ddns-go') ? {
      state: services['ddns-go']?.running === true ? '运行中' :
        services['ddns-go']?.enabled ? '已启用，运行状态待确认' : '已停用'
    } : null,
    serviceState: services?.ddns || null,
    sections: sections.map(x => ({
      id: x.id, enabled: String(x.values.enabled ?? '0') === '1',
      serviceName: String(x.values.service_name || x.values.service_name_v6 || '自定义更新源'),
      domain: String(x.values.domain || ''), lookupHost: String(x.values.lookup_host || ''),
      interface: String(x.values.interface || 'wan'), useIpv6: String(x.values.use_ipv6 || '0') === '1',
      ipSource: String(x.values.ip_source || 'network')
    }))
  }
}
export function validateDdNsUpdate(section, input) {
  if (!SECTION.test(section)) throw new Error('DDNS 配置节无效')
  const domain = String(input.domain || '').trim()
  const host = String(input.lookupHost || '').trim()
  const iface = String(input.interface || '').trim()
  for (const value of [domain,host]) {
    if (value && (!/^[A-Za-z0-9_*.-]{1,253}$/.test(value) ||
      value.includes('..') || value.startsWith('-'))) throw new Error('DDNS 域名格式有误')
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/.test(iface))
    throw new Error('DDNS 网络接口名称无效')
  return { enabled: input.enabled ? '1' : '0',
    domain, lookup_host: host, interface: iface, use_ipv6: input.useIpv6 ? '1' : '0' }
}
export async function planDdNsUpdate(client, section, input) {
  const values = validateDdNsUpdate(section, input)
  return prepareUciChange(client, [{ config:'ddns', section, values }])
}
export async function readDdNsLog(client, section) {
  if (!SECTION.test(section)) throw new Error('非法 DDNS 服务标识')
  const result = await client.call('file','read',
    { path:'/var/log/ddns/' + section + '.log' },true)
  const text = pickText(result)
  if (!text) throw new Error('暂无此 DDNS 服务日志或当前账户无权读取')
  return text.slice(-20000)
}
export async function readOpenClashDetails(client) {
  const [uci, files, activeLog, services] = await Promise.all([
    client.call('uci','get',{config:'openclash'},true),
    client.call('file','list',{path:'/etc/openclash/config'},true),
    client.call('file','read',{path:'/tmp/openclash.log'},true),
    client.call('rc','list',{},true)
  ])
  const entries = Array.isArray(files?.entries) ? files.entries :
    Array.isArray(files?.files) ? files.files :
    Array.isArray(files) ? files : []
  const configs = entries.map(x => typeof x === 'string' ? x : String(x?.name || ''))
    .filter(x => /^[A-Za-z0-9][A-Za-z0-9_. -]{0,100}\.ya?ml$/i.test(x))
    .sort()
  const rows = uciRows(uci)
  const main = rows.find(x => x.id === 'config') || rows.find(x => x.type === 'openclash')
  const subscriptions = rows.filter(x => x.type === 'config_subscribe')
    .map(x => ({
      id: x.id, name: String(x.values.name || x.id),
      enabled: String(x.values.enabled ?? '1') !== '0',
      // Never expose token-bearing subscription URLs in UI/telemetry.
      present: Boolean(x.values.address || x.values.url)
    }))
  return {
    available: Boolean(uci?.values), service: services?.openclash || null,
    subscriptions, configs, activeConfig: String(main?.values?.config_path || ''),
    activeSection: main?.id || '', log: pickText(activeLog).slice(-30000),
    note: !files ? '固件未开放配置目录读取权限' : ''
  }
}
export function validateOpenClashConfigName(name, known) {
  if (typeof name !== 'string' || !known.includes(name) ||
    !/^[A-Za-z0-9][A-Za-z0-9_. -]{0,100}\.ya?ml$/i.test(name))
    throw new Error('只能选择路由器已经存在的 YAML 配置文件')
  return '/etc/openclash/config/' + name
}
export async function planOpenClashConfig(client, selectedName, data) {
  if (!data.activeSection || !SECTION.test(data.activeSection)) throw new Error('OpenClash 主配置节无法识别')
  const path = validateOpenClashConfigName(selectedName, data.configs)
  return prepareUciChange(client,[{ config:'openclash', section:data.activeSection,
    values:{ config_path:path } }])
}
export async function planOpenClashSubscription(client, section, enabled) {
  if (!SECTION.test(section)) throw new Error('订阅配置节无效')
  const response = await client.call('uci','get',{config:'openclash',section})
  const row = response?.values || response
  if (row?.['.type'] !== 'config_subscribe') throw new Error('未找到对应订阅配置')
  return prepareUciChange(client,[{ config:'openclash', section,
    values:{enabled:enabled?'1':'0'} }])
}
const IP4 = value => {
  const p = String(value).split('.')
  return p.length === 4 && p.every(x => /^(0|[1-9]\d{0,2})$/.test(x) && +x <= 255)
}
const IP6 = value => String(value).includes(':') && /^[0-9a-f:]+$/i.test(value) &&
  !String(value).includes(':::') && String(value).split('::').length <= 2
const cidrValid = (input,family) => {
  if (!input) return true
  const pieces = String(input).split('/')
  if (pieces.length > 2) return false
  const is6 = IP6(pieces[0]), is4 = IP4(pieces[0])
  if (family === 'ipv4' && !is4 || family === 'ipv6' && !is6 || !is4 && !is6) return false
  if (pieces.length === 2 && (!/^\d{1,3}$/.test(pieces[1]) ||
    +pieces[1] > (is6 ? 128 : 32))) return false
  return true
}
export async function readAdvancedFirewall(client) {
  const raw=await client.call('uci','get',{config:'firewall'})
  const rows=uciRows(raw)
  return { zones:rows.filter(x=>x.type==='zone').map(x=>({id:x.id,name:String(x.values.name||x.id)})),
    rules:rows.filter(x=>x.type==='rule').map(x=>({
      id:x.id,name:String(x.values.name||x.id),family:String(x.values.family||'any'),
      enabled:String(x.values.enabled??'1')!=='0',
      target:String(x.values.target||''),proto:String(x.values.proto||'')
    })) }
}
export function validateNewFirewallRule(input,zones) {
  const name=String(input.name||'').trim()
  if(!name || name.length>48 || /[<>]/.test(name))throw new Error('请输入不超过 48 字符的规则名称')
  const src=String(input.src||'').trim()
  if(!zones.some(x=>x.name===src))throw new Error('必须选择路由器上已存在的来源区域')
  const family=String(input.family||'ipv4')
  if(!['ipv4','ipv6','any'].includes(family))throw new Error('地址族无效')
  const proto=String(input.proto||'tcp')
  if(!['tcp','udp','tcp udp','icmp','icmpv6'].includes(proto))throw new Error('协议无效')
  const target=String(input.target||'REJECT')
  if(!['ACCEPT','REJECT','DROP'].includes(target))throw new Error('规则动作无效')
  const destPort=String(input.port||'').trim()
  if(destPort && (!['tcp','udp','tcp udp'].includes(proto) ||
    !/^\d{1,5}(?:-\d{1,5})?$/.test(destPort) ||
    destPort.split('-').some(p=>Number(p)<1 || Number(p)>65535)))
    throw new Error('端口必须为 1–65535，并且仅适用 TCP/UDP')
  const srcIp=String(input.srcIp||'').trim()
  if(!cidrValid(srcIp,family))throw new Error('来源 IP/CIDR 与地址族不匹配')
  const values={name,src,proto,target,enabled:'1'}
  if(family!=='any')values.family=family
  if(destPort)values.dest_port=destPort
  if(srcIp)values.src_ip=srcIp
  return values
}
export async function planFirewallRule(client,input,zones) {
  const values=validateNewFirewallRule(input,zones)
  return prepareUciChange(client,[{ config:'firewall',kind:'add',type:'rule',values }])
}
function cronField(value,min,max) {
  const segments=String(value).split(',')
  if(!segments.length)return false
  for(const part of segments) {
    if(part==='*')continue
    const every=part.match(/^\*\/(\d{1,2})$/)
    if(every) {if(+every[1]<1||+every[1]>max-min+1)return false;continue}
    const range=part.match(/^(\d{1,2})(?:-(\d{1,2}))?(?:\/(\d{1,2}))?$/)
    if(!range)return false
    if(+range[1]<min||+range[1]>max)return false
    if(range[2]!==undefined && (+range[2]<+range[1]||+range[2]>max))return false
    if(range[3]!==undefined && +range[3]<1)return false
  }
  return true
}
export function validateCronSchedule(value) {
  const raw=String(value||'').trim()
  const p=raw.split(/\s+/)
  if(p.length!==5 || !p.every((x,i)=>cronField(x,[0,0,1,1,0][i],[59,23,31,12,7][i])))
    throw new Error('Cron 计划必须是合法的五段时间表达式')
  return raw
}
export function parseCrontab(text) {
  return String(text||'').split(/\r?\n/).map((line,index)=>{
    const trimmed=line.trim()
    const disabled=trimmed.startsWith('# ')
    const candidate=disabled?trimmed.slice(2).trim():trimmed
    const match=candidate.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/)
    let valid=false
    if(match)try{validateCronSchedule(match.slice(1,6).join(' '));valid=true}catch(_){}
    return {index,raw:line,editable:valid,schedule:valid?match.slice(1,6).join(' '):'',
      command:valid?match[6]:'',enabled:valid&&!disabled,disabled:valid&&disabled}
  }).filter(x=>x.editable)
}
export async function readCrontab(client) {
  const reply=await client.call('file','read',{path:CRON_PATH})
  const text=pickText(reply)
  if(typeof text!=='string')throw new Error('无法读取 root 的 Cron 配置')
  return {text,entries:parseCrontab(text)}
}
export function makeCrontabChange(current,action,params={}) {
  const lines=String(current).split('\n')
  if(lines.length>600)throw new Error('Cron 行数过多，停止修改')
  if(action==='preset') {
    const preset=CRON_PRESETS[params.preset]
    if(!preset)throw new Error('仅允许预定义的服务维护任务')
    const schedule=validateCronSchedule(params.schedule)
    if(lines.some(x=>x.includes(preset.command)))throw new Error('已有相同服务的维护任务')
    if(lines.at(-1)==='')lines.pop()
    lines.push(schedule+' '+preset.command)
  } else {
    const index=Number(params.index)
    if(!Number.isInteger(index)||index<0||index>=lines.length)throw new Error('任务不存在')
    const row=parseCrontab(lines.join('\n')).find(x=>x.index===index)
    if(!row)throw new Error('只允许编辑普通的五段式 Cron 任务')
    if(action==='toggle') {
      lines[index]=params.enabled?row.schedule+' '+row.command:'# '+row.schedule+' '+row.command
    } else if(action==='schedule'){
      lines[index]=validateCronSchedule(params.schedule)+' '+row.command
      if(!row.enabled)lines[index]='# '+lines[index]
    } else if(action==='delete') {
      lines.splice(index,1)
    } else throw new Error('未知的 Cron 操作')
  }
  return lines.join('\n').replace(/\n*$/,'')+'\n'
}
export async function applyCrontabChange(client, original, next) {
  if(!next||next===original)throw new Error('没有 Cron 变更')
  const check=await readCrontab(client)
  if(check.text!==original)throw new Error('Cron 文件已被其他管理端修改，请刷新')
  let written=false
  try {
    await client.call('file','write',{path:CRON_PATH,data:next})
    written=true
    const verify=await readCrontab(client)
    if(verify.text!==next)throw new Error('Cron 写入后内容校验不一致')
    const rc=await client.call('rc','init',{name:'cron',action:'restart'},true)
    if(rc===null)throw new Error('已写入文件，但路由器拒绝重新加载 Cron')
  } catch(e) {
    if(written) {
      // Restore original contents on any later failure; do not overwrite a
      // concurrent writer if the file no longer equals our own change.
      const state=await readCrontab(client).catch(()=>null)
      if(state?.text===next) {
        await client.call('file','write',{path:CRON_PATH,data:original}).catch(()=>null)
        await client.call('rc','init',{name:'cron',action:'restart'},true).catch(()=>null)
      }
    }
    throw e
  }
  return await readCrontab(client)
}
