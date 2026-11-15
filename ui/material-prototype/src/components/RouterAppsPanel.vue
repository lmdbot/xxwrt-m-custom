<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { shortError } from '../services/router.js'
import { CapacitorHttp } from '@capacitor/core'

const props = defineProps({ client: { type: Object, required: true }, kind: { type: String, required: true } })
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref('')
const readyKind = ref('')
const manualRefreshing = ref(false)
const floatingNoticeOpen = ref(false)
const operationWaiting = computed(() => busy.value || ssrProbeBusy.value ||
  ssrComponentBusy.value || carbonChecking.value || manualRefreshing.value)
const floatingNoticeText = computed(() => error.value || notice.value ||
  (manualRefreshing.value ? '正在刷新路由器数据…'
    : ssrProbeBusy.value ? '正在通过 QWRT 探测节点…'
    : ssrComponentBusy.value ? '正在读取 SSR 组件版本或执行更新…'
    : carbonChecking.value ? (carbonCheckText.value || '正在检查 Carbon 更新…')
    : busy.value ? '正在提交配置，请稍候…' : ''))
const floatingNoticeColor = computed(() => error.value ? 'error' : notice.value ? 'success' : 'primary')
function dismissFloatingNotice() {
  if (operationWaiting.value) return
  floatingNoticeOpen.value = false
  error.value = ''
  notice.value = ''
}
const ssrTab = ref('nodes')
const ssrProbeBusy = ref(false)
const ssrProbes = ref({})
const ssrProbeUnavailable = ref('')
const ssrProbeMode = ref('')
const ssrComponent = ref('xray')
const ssrComponentResult = ref(null)
const ssrComponentChecked = ref(false)
const ssrComponentBusy = ref(false)
const ssrComponentDialog = ref(false)
const ssrStatusDetail = ref(null)
const ssrComponents = [
  { title: 'SSR Plus+ 主程序', value: 'mainprogram' },
  { title: 'Xray 核心', value: 'xray' },
  { title: 'Mihomo 核心', value: 'mihomo' },
  { title: 'Country MMDB', value: 'country_mmdb' },
  { title: 'GeoSite', value: 'geosite' },
  { title: 'V2Ray GeoIP', value: 'v2ray_geoip' },
  { title: 'V2Ray GeoSite', value: 'v2ray_geosite' }
]
const carbonChecking = ref(false)
const carbonCheckText = ref('')
watch([floatingNoticeText, operationWaiting], () => {
  floatingNoticeOpen.value = Boolean(floatingNoticeText.value)
})
const ssr = ref({ available: false, section: '', global: {}, nodes: [], service: null })
const ssrNode = ref('nil')
const wechat = ref({ available: false, section: '', service: null })
const DIY_FILE = '/usr/share/wechatpush/api/diy.json'
const DEVICES_FILE = '/tmp/wechatpush/devices.json'
const wechatTab = ref('settings')
const wechatDevices = ref([])
const wechatDevicesAvailable = ref(false)
const wechatDevicesError = ref('')
const wechatDiy = ref('')
const wechatDiyOriginal = ref('')
const wechatDiyError = ref('')
const wechatDiyLoaded = ref(false)
const wechatDiyDirty = computed(() => wechatDiyLoaded.value && wechatDiy.value !== wechatDiyOriginal.value)
const wechatForm = reactive({
  enable: '0', jsonpath: '', sleeptime: '60', device_name: '', debuglevel: '0',
  reset_regularly: '0', prefer_client_page: '1', passive_mode: '0',
  up_timeout: '2', down_timeout: '10', timeout_retry_count: '2', thread_num: '3',
  only_timeout_push: '0', miwifi_ip: '', miwifi_password: '',
  crontab_mode: '', crontab_interval_time: '', do_not_disturb_mode: '',
  sckey: '', sc3key: '', sc3uid: '', sc3tags: '', pushplus_token: '',
  wxpusher_apptoken: '', wxpusher_uids: '', wxpusher_topicIds: '', wpush_apikey: '',
  tg_token: '', tg_chat_id: '', tg_thread_id: '', tg_api_server: '', 
  corpid: '', userid: '', agentid: '', corpsecret: '', proxy_address: ''
})
const wechatMulti = reactive({
  device_notification: [], cpu_notification: [], login_notification: [],
  lite_enable: [], send_notification: [], device_info_helper: []
})
const wechatMultiOptions = {
  device_notification: [{ value: 'online', title: '设备上线通知' }, { value: 'offline', title: '设备离线通知' }],
  cpu_notification: [{ value: 'load', title: 'CPU 负载告警' }, { value: 'temp', title: '温度告警' }],
  login_notification: [
    { value: 'web_logged', title: '网页登录提醒' }, { value: 'ssh_logged', title: 'SSH 登录提醒' },
    { value: 'web_login_failed', title: '网页登录失败提醒' },
    { value: 'ssh_login_failed', title: 'SSH 登录失败提醒' }
  ],
  lite_enable: [
    { value: 'device', title: '精简设备列表' }, { value: 'nowtime', title: '精简时间' },
    { value: 'content', title: '仅推送标题' }
  ],
  send_notification: [
    { value: 'router_status', title: '系统运行状态' }, { value: 'router_temp', title: '路由器温度' },
    { value: 'wan_info', title: 'WAN 信息' }, { value: 'client_list', title: '在线终端列表' }
  ]
}
const wechatDevicesShown = computed(() => wechatDevices.value
  .filter(item => item.status === 'online' || item.status === 'unknown')
  .sort((a, b) => String(a.ip || '').localeCompare(String(b.ip || ''), undefined, { numeric: true })))
const wechatOnlineCount = computed(() => wechatDevicesShown.value.filter(d => d.status === 'online').length)
const wechatDeviceSearch = ref('')
const filteredWechatDevices = computed(() => {
  const keyword = String(wechatDeviceSearch.value || '').trim().toLowerCase()
  if (!keyword) return wechatDevicesShown.value
  return wechatDevicesShown.value.filter(item => [
    item.name, item.ip, item.mac, item.interface, item.parent
  ].some(v => String(v || '').toLowerCase().includes(keyword)))
})
function multiValues(raw) {
  const values = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,]+/)
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))]
}
function toggleWechatMulti(key, value, enabled) {
  const current = new Set(wechatMulti[key] || [])
  if (enabled) current.add(value)
  else current.delete(value)
  wechatMulti[key] = [...current]
}
const wechatMiwifiEnabled = computed(() => wechatMulti.device_info_helper.includes('miwifi_info'))
function toggleWechatMiwifi(enabled) { toggleWechatMulti('device_info_helper', 'miwifi_info', enabled) }
const openclash = ref({ available: false, section: '', config: {}, service: null })
const oc = reactive({ enable: '0', en_mode: 'fake-ip', proxy_mode: 'rule', ipv6_enable: '0', enable_udp_proxy: '1', router_self_proxy: '1' })
const detector = ref({ available: false, instances: [], service: null })
const carbon = ref({ available: false, section: '', current: '', themes: [], updater: null })
const carbonMirror = ref('')
const zt = ref({ available: false, section: '', networks: [], service: null, runtime: [], node: null, runtimeUnavailable: false, virtualDevices: [] })
const ztEnabled = ref(false), ztNewId = ref(''), ztDelete = ref(null), ztDeleteDialog = ref(false)
const fw = ref({ available: false, zones: [], redirects: [], rules: [], service: null })
const fwRuleSearch = ref('')
const fwRuleFilter = ref('all')
const fwRuleConfirm = ref(false)
const fwRulePending = ref(null)
const fwRulePendingEnabled = ref(false)
const fwRuleEnabledCount = computed(() => fw.value.rules.filter(rule => rule.enabled).length)
const fwRulesShown = computed(() => {
  const term = fwRuleSearch.value.trim().toLowerCase()
  return fw.value.rules.filter(rule => {
    if (fwRuleFilter.value === 'enabled' && !rule.enabled) return false
    if (fwRuleFilter.value === 'disabled' && rule.enabled) return false
    if (!term) return true
    return [rule.name, rule.section, rule.src, rule.dest, rule.proto, rule.src_ip,
      rule.dest_ip, rule.src_port, rule.dest_port, rule.target, rule.comment]
      .some(value => String(value || '').toLowerCase().includes(term))
  })
})
const fwRuleActionColor = action => action === 'ACCEPT' ? 'success'
  : action === 'REJECT' || action === 'DROP' ? 'error' : 'info'
const fwDelete = ref(null), fwDeleteDialog = ref(false)
const pf = reactive({ name: '', srcPort: '', destIp: '', destPort: '', proto: 'tcp' })
const carbonUpgradeDialog = ref(false)

const providers = [
  { title: '关闭推送', value: '' },
  { title: 'Server酱', value: '/usr/share/wechatpush/api/serverchan.json' },
  { title: 'Server酱 3', value: '/usr/share/wechatpush/api/serverchan3.json' },
  { title: '企业微信 Markdown', value: '/usr/share/wechatpush/api/qywx_markdown.json' },
  { title: 'WxPusher', value: '/usr/share/wechatpush/api/wxpusher.json' },
  { title: 'PushPlus', value: '/usr/share/wechatpush/api/pushplus.json' },
  { title: 'WPUSH', value: '/usr/share/wechatpush/api/wpush.json' },
  { title: 'Telegram', value: '/usr/share/wechatpush/api/telegram.json' },
  { title: '企业微信图文', value: '/usr/share/wechatpush/api/qywx_mpnews.json' },
  { title: '邮件 msmtp', value: '/usr/share/wechatpush/api/msmtp.json' },
  { title: 'DIY 自定义推送', value: DIY_FILE }
]
const wechatProviderItems = computed(() => providers.some(x => x.value === wechatForm.jsonpath)
  ? providers : [...providers, { title: '其他现有渠道', value: wechatForm.jsonpath }])
const providerFields = computed(() => ({
  '/usr/share/wechatpush/api/serverchan.json': ['sckey'],
  '/usr/share/wechatpush/api/serverchan3.json': ['sc3key', 'sc3uid', 'sc3tags'],
  '/usr/share/wechatpush/api/qywx_markdown.json': ['corpid', 'userid', 'agentid', 'corpsecret', 'proxy_address'],
  '/usr/share/wechatpush/api/qywx_mpnews.json': ['corpid', 'userid', 'agentid', 'corpsecret'],
  '/usr/share/wechatpush/api/wxpusher.json': ['wxpusher_apptoken', 'wxpusher_uids', 'wxpusher_topicIds'],
  '/usr/share/wechatpush/api/pushplus.json': ['pushplus_token'],
  '/usr/share/wechatpush/api/wpush.json': ['wpush_apikey'],
  '/usr/share/wechatpush/api/telegram.json': ['tg_token', 'tg_chat_id', 'tg_thread_id', 'tg_api_server'],
  '/usr/share/wechatpush/api/msmtp.json': ['proxy_address']
}[wechatForm.jsonpath] || []))
const providerLabels = {
  sckey: 'Server酱 SendKey', sc3key: 'Server酱 3 SendKey', sc3uid: 'Server酱 3 UID',
  corpid: '企业 ID', userid: '接收用户（@all 表示全部）', agentid: '应用 AgentID', corpsecret: '企业微信 Secret',
  sc3tags: 'Server酱 3 标签', wxpusher_topicIds: 'WxPusher 群发 Topic IDs',
  tg_thread_id: 'Telegram 话题 ID', tg_api_server: 'Telegram API 服务地址', proxy_address: '代理服务器地址',
  wxpusher_apptoken: 'WxPusher AppToken', wxpusher_uids: 'WxPusher 用户 UID',
  pushplus_token: 'PushPlus Token', wpush_apikey: 'WPUSH API Key', tg_token: 'Telegram Bot Token', tg_chat_id: 'Telegram Chat ID'
}
const secretKey = key => /key|token|secret/i.test(key)
const statusText = item => {
  if (!item) return '运行状态待确认'
  if (item.running === true) return '运行中'
  if (item.enabled === false) return '已停用'
  return item.enabled === true ? '已启用，运行状态待确认' : '运行状态待确认'
}
const firewallStatusText = computed(() => {
  if (fw.value.service?.running === true) return '规则服务运行中'
  if (fw.value.service?.enabled === false) return '启动服务已停用'
  if (fw.value.available) return '已配置（运行待确认）'
  return '无法读取配置'
})
const firewallKernel = ref({
  nat: '待检测', natDetail: '正在读取规则', congestion: '待检测', congestionDetail: ''
})

function sections(data) {
  return Object.entries(data?.values || {}).map(([id, options]) => ({ id: String(options?.['.name'] || id), type: String(options?.['.type'] || ''), options: options || {} }))
}
function sectionOf(list, name, type) { return list.find(x => x.id === name) || list.find(x => x.type === type) || null }
async function getUci(config) { return props.client.call('uci', 'get', { config }, true) }
async function setUci(config, section, values) {
  if (!section) throw new Error('找不到对应 UCI 配置段')
  if (Object.keys(values).length) {
    await props.client.call('uci', 'set', { config, section, values })
    await props.client.call('uci', 'commit', { config })
  }
}
async function addUci(config, type, values) {
  await props.client.call('uci', 'add', { config, type, values })
  await props.client.call('uci', 'commit', { config })
}
async function delUci(config, section) {
  await props.client.call('uci', 'delete', { config, section })
  await props.client.call('uci', 'commit', { config })
}
async function services() { return props.client.call('rc', 'list', {}, true) }
const servicePaths = {
  ssr: '/etc/init.d/shadowsocksr', wechat: '/etc/init.d/wechatpush',
  openclash: '/etc/init.d/openclash', detector: '/etc/init.d/internet-detector',
  zerotier: '/etc/init.d/zerotier', firewall: '/etc/init.d/firewall'
}
async function command(path, params = []) {
  const result = await props.client.call('file', 'exec', { command: path, params, env: null }, true)
  if (!result) throw new Error('路由器未开放该命令的 RPC 权限')
  if (Number(result.code ?? 0) !== 0) throw new Error(String(result.stderr || result.stdout || '命令执行失败'))
  return result
}
async function service(key, action = 'restart') {
  if (!['start', 'stop', 'restart', 'reload'].includes(action) || !servicePaths[key]) throw new Error('不支持的服务操作')
  return command(servicePaths[key], [action])
}
async function run(action, success, reload = true) {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await action()
    if (reload) await refresh()
    if (success) notice.value = success
  } catch (e) { error.value = shortError(e) }
  finally { busy.value = false }
}

async function loadSsr() {
  const [cfg, rc, procd, processList] = await Promise.all([
    getUci('shadowsocksr'), services(),
    props.client.call('service', 'list', { name: 'shadowsocksr' }, true),
    props.client.call('luci', 'getProcessList', {}, true)
  ])
  const list = sections(cfg), global = sectionOf(list, 'global', 'global')
  ssr.value = {
    available: !!cfg?.values && !!global, section: global?.id || '', global: global?.options || {},
    nodes: list.filter(x => x.type === 'servers').map(x => ({
      id: x.id, title: String(x.options.alias || x.options.remarks || x.options.server || x.id),
      host: String(x.options.server || ''), port: String(x.options.server_port || ''),
      type: String(x.options.type || ''),
      detail: [x.options.type, x.options.server, x.options.server_port].filter(Boolean).join(' · ')
    })),
    service: (() => {
      const current = rc?.shadowsocksr || null
      const instances = procd?.shadowsocksr?.instances || {}
      const managed = Object.values(instances).some(instance => instance?.running === true)
      const processes = processList?.result || processList?.processes || []
      const runningProxy = Array.isArray(processes) && processes.some(process =>
        /(?:ssr-redir|ss-redir|ssr-plus|ssr-local|\/usr\/share\/shadowsocksr)/i.test(
          String(process.COMMAND || process.command || process.cmd || '')))
      return {
        enabled: current?.enabled === true || String(global?.options.global_server || 'nil') !== 'nil',
        running: current?.running === true || managed || runningProxy
      }
    })()
  }
  ssrStatusDetail.value = procd?.shadowsocksr || null
  ssrNode.value = String(global?.options.global_server || 'nil')
  // The optional LuCI status CGI may be unavailable or slow on custom QWRT
  // builds. Never hold the entire SSR page behind an optional GET timeout.
  void props.client.luciGet('/cgi-bin/luci/admin/services/shadowsocksr/run')
    .then(state => {
      if (props.kind === 'ssr' && state && typeof state.running === 'boolean') {
        ssr.value = { ...ssr.value,
          service: { ...ssr.value.service, running: state.running }
        }
      }
    }).catch(() => {})
}
async function applySsrNode() {
  await run(async () => {
    if (!ssr.value.available) throw new Error('未检测到 ShadowSocksR Plus+ 配置')
    if (ssrNode.value !== 'nil' && !ssr.value.nodes.some(x => x.id === ssrNode.value)) throw new Error('所选节点不存在')
    await setUci('shadowsocksr', ssr.value.section, { global_server: ssrNode.value })
    await service('ssr')
  }, '节点已切换，ShadowSocksR Plus+ 已重启')
}
async function probeSsrViaLuci(node) {
  // New SSR Plus+ supports sid; older versions rely on domain/port/type.
  // Both paths perform the actual probe on QWRT, never on the phone.
  const response = await props.client.luciGetDetailed(
    '/cgi-bin/luci/admin/services/shadowsocksr/ping', {
      sid: node.id, domain: node.host, port: node.port, type: node.type || ''
    })
  const data = response.data
  if (!data) return { result: null, reason: response.reason || 'SSR Plus+ 探测接口无响应' }
  if (!Object.hasOwn(data, 'socket'))
    return { result: null, reason: 'SSR Plus+ 探测接口未返回 socket 状态（插件接口版本不兼容）' }
  const ping = Number(data.ping)
  const connected = data.socket === true || data.socket === 1 || data.socket === '1'
  return { result: {
    status: connected ? 'ok' : 'failed',
    text: connected
      ? ('路由器插件检测可达' + (Number.isFinite(ping) && ping > 0 ? ' · ' + Math.round(ping) + 'ms' : ''))
      : '路由器插件检测不可连接'
  }, reason: '' }
}
async function probeSsrViaExec(node) {
  const start = Date.now()
  try {
    let result = await props.client.call('file', 'exec', {
      command: '/bin/nc', params: ['-z', '-w', '2', node.host, node.port], env: null
    }, true)
    if (!result || [126, 127].includes(Number(result.code))) {
      result = await props.client.call('file', 'exec', {
        command: '/usr/bin/nping',
        params: ['--tcp-connect', '-q', '-c', '1', '-p', node.port, node.host], env: null
      }, true)
    }
    if (!result) return { result: null, reason: '路由器未授权 nc/nping 探测命令，或命令不存在' }
    const output = String(result.stdout || '')
    const failed = /Successful connections:\s*0\b|Failed:\s*[1-9]\d*\b|0 connections? succeeded|0 successful|rcvd:\s*0/i.test(output)
    const ok = Number(result.code ?? 1) === 0 && !failed
    return { result: { status: ok ? 'ok' : 'failed',
      text: ok ? ('TCP 可连接 · ' + (Date.now() - start) + 'ms（含 RPC 开销）')
        : 'TCP 端口不可连接' }, reason: '' }
  } catch (error) {
    return { result: null, reason: '备用 TCP 探测失败：' + shortError(error) }
  }
}
async function probeSsrNode(node) {
  if (!node.host || !/^\d+$/.test(node.port) || Number(node.port) < 1 || Number(node.port) > 65535) {
    ssrProbes.value = { ...ssrProbes.value, [node.id]: { status: 'unknown', text: '该节点没有可探测的服务器端口' } }
    return
  }
  ssrProbes.value = { ...ssrProbes.value, [node.id]: { status: 'testing', text: '探测中' } }
  let probe = { result: null, reason: '' }
  let luciReason = ''
  if (ssrProbeMode.value !== 'exec') {
    probe = await probeSsrViaLuci(node)
    luciReason = probe.reason
  }
  if (probe.result) ssrProbeMode.value = 'luci'
  else if (ssrProbeMode.value !== 'luci') {
    const fallback = await probeSsrViaExec(node)
    if (fallback.result) {
      probe = fallback
      ssrProbeMode.value = 'exec'
    } else {
      probe = { result: null, reason: [luciReason, fallback.reason].filter(Boolean).join('；') }
    }
  }
  if (!probe.result) {
    // One actionable diagnostic, not the same error repeated 30 times.
    const states = { ...ssrProbes.value }
    delete states[node.id]
    ssrProbes.value = states
    ssrProbeMode.value = ''
    ssrProbeUnavailable.value = '路由器侧 SSR Plus+ 探测接口不可用：' +
      (probe.reason || '当前插件未返回有效探测结果') + '。请先确认原版 LuCI 节点检测能否正常使用。'
    return
  }
  ssrProbeUnavailable.value = ''
  ssrProbes.value = { ...ssrProbes.value, [node.id]: probe.result }
}
async function probeAllSsr() {
  if (ssrProbeBusy.value || !ssr.value.nodes.length) return
  ssrProbeBusy.value = true
  ssrProbeUnavailable.value = ''
  ssrProbes.value = {}
  try {
    const nodes = ssr.value.nodes.slice(0, 32)
    // Capability detection first: stop early instead of filling the screen
    // with the same RPC denied result for every configured node.
    await probeSsrNode(nodes[0])
    if (ssrProbeUnavailable.value) return
    let cursor = 1
    await Promise.all(Array.from({ length: Math.min(Math.max(nodes.length - 1, 0), 3) }, async () => {
      while (cursor < nodes.length) await probeSsrNode(nodes[cursor++])
    }))
    if (ssr.value.nodes.length > nodes.length && !ssrProbeUnavailable.value) {
      notice.value = '已探测前 32 个节点，以控制路由器负载'
    }
  } finally { ssrProbeBusy.value = false }
}
const SSR_GEO_COMPONENTS = new Set(['country_mmdb', 'geosite', 'v2ray_geoip', 'v2ray_geosite'])
async function luciSsrComponent(component, action) {
  const geo = SSR_GEO_COMPONENTS.has(component)
  const name = geo
    ? { local: 'geo_local_status', info: 'geo_status', upgrade: 'geo_upgrade' }[action]
    : { local: 'component_local_status', info: 'component_status', upgrade: 'component_upgrade' }[action]
  if (!name) return { data: null, reason: '不支持的组件操作' }
  const response = await props.client.luciGetDetailed(
    '/cgi-bin/luci/admin/services/shadowsocksr/' + name, { component })
  const data = response.data
  if (data && (Object.hasOwn(data, 'component') || Object.hasOwn(data, 'current_version') ||
    Object.hasOwn(data, 'error'))) return { data, reason: '' }
  return { data: null, indeterminate: response.indeterminate === true,
    reason: response.reason || 'SSR Plus+ 接口未返回有效组件信息' }
}
async function execSsrComponent(action) {
  const script = '/usr/share/shadowsocksr/update_components.sh'
  let result = await props.client.call('file', 'exec', {
    command: script, params: [action], env: null
  }, true)
  // Upstream packages may install this helper with mode 0644. In that case
  // run its explicit fixed-argument script via /bin/sh, only when authorized.
  if (!result || [126, 127].includes(Number(result.code))) {
    const fallback = await props.client.call('file', 'exec', {
      command: '/bin/sh', params: [script, action], env: null
    }, true)
    if (fallback) result = fallback
  }
  return result
}
function parseSsrComponent(text) {
  return Object.fromEntries(String(text || '').split(/\r?\n/)
    .filter(line => /^[a-z_]+\s*=/.test(line))
    .map(line => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)] }))
}
async function querySsrComponent(remote = false) {
  if (ssrComponentBusy.value) return
  ssrComponentBusy.value = true; error.value = ''; notice.value = ''
  ssrComponentChecked.value = false
  ssrComponentResult.value = null
  const component = ssrComponent.value
  if (!ssrComponents.some(x => x.value === component)) { ssrComponentBusy.value = false; return }
  try {
    const api = await luciSsrComponent(component, remote ? 'info' : 'local')
    let script = null
    let scriptReason = ''
    if (!api.data) {
      try { script = await execSsrComponent(component + (remote ? '_info' : '_local_info')) }
      catch (e) { scriptReason = shortError(e) }
    }
    if (!api.data && !script) {
      throw new Error('无法检查 SSR Plus+ 组件。LuCI：' + api.reason +
        '；备用脚本：' + (scriptReason || '无 RPC 授权或更新脚本不存在') +
        '。可在 QWRT 原版 LuCI 的组件更新页验证。')
    }
    if (script && Number(script.code ?? 0) !== 0)
      throw new Error('SSR 组件脚本执行失败（退出码 ' + script.code + '）')
    const output = api.data || parseSsrComponent(script.stdout)
    if (!output || !Object.keys(output).length)
      throw new Error('SSR 组件检测未返回版本数据，请检查路由器所安装的 SSR Plus+ 插件及更新脚本版本')
    if (output.error) throw new Error('SSR 组件检查失败：' + output.error)
    ssrComponentResult.value = {
      ...output, component, can_upgrade: output.can_upgrade === true || output.can_upgrade === '1' ? '1' : '0',
      installed: output.installed === true || output.installed === '1'
    }
    ssrComponentChecked.value = remote
  } catch (e) { error.value = shortError(e) }
  finally { ssrComponentBusy.value = false }
}
async function upgradeSsrComponent() {
  ssrComponentDialog.value = false
  if (!ssrComponentChecked.value || ssrComponentResult.value?.component !== ssrComponent.value ||
      ssrComponentResult.value.can_upgrade !== '1') return
  const component = ssrComponent.value
  ssrComponentBusy.value = true; error.value = ''; notice.value = ''
  try {
    const api = await luciSsrComponent(component, 'upgrade')
    // Never run the fallback script if LuCI timed out or disconnected:
    // the same update may still be downloading/installing on the router.
    if (api.indeterminate) {
      ssrComponentChecked.value = false
      notice.value = '安装请求未收到最终结果：' + api.reason +
        '。请稍后点击“查看本地版本”确认，不要立即重复安装。'
      return
    }
    const r = api.data ? null : await execSsrComponent(component + '_upgrade')
    if (!api.data && !r) throw new Error('无法访问 SSR Plus+ 组件安装接口：' + api.reason)
    const result = api.data || parseSsrComponent(r.stdout)
    if ((r && Number(r.code ?? 0) !== 0) || !(result.success === true || result.success === '1')) {
      throw new Error('SSR 组件更新未成功：' + (result.message || result.error || '请到 LuCI 组件更新页查看'))
    }
    ssrComponentResult.value = { ...result, component, can_upgrade: '0' }
    ssrComponentChecked.value = false
    notice.value = '组件更新命令已执行，请刷新确认已安装版本'
  } catch (e) { error.value = shortError(e) }
  finally { ssrComponentBusy.value = false }
}
watch(ssrComponent, () => { ssrComponentResult.value = null; ssrComponentChecked.value = false })

async function loadWechat() {
  const [cfg, rc, detail] = await Promise.all([
    getUci('wechatpush'), services(), props.client.call('service', 'list', { name: 'wechatpush' }, true)
  ])
  const section = sectionOf(sections(cfg), 'config', 'wechatpush'), o = section?.options || {}
  wechat.value = {
    available: !!section, section: section?.id || '',
    service: { ...(rc?.wechatpush || {}), running: !!detail?.wechatpush?.instances?.instance1?.running || !!rc?.wechatpush?.running }
  }
  for (const key of Object.keys(wechatForm)) {
    const fallback = { sleeptime: '60', prefer_client_page: '1', up_timeout: '2',
      down_timeout: '10', timeout_retry_count: '2', thread_num: '3' }[key] || ''
    wechatForm[key] = String(o[key] ?? fallback)
  }
  for (const key of Object.keys(wechatMulti)) wechatMulti[key] = multiValues(o[key])
  if (wechatTab.value === 'online') await loadWechatDevices()
  if (wechatForm.jsonpath === DIY_FILE && !wechatDiyDirty.value) await loadWechatDiy()
}
async function loadWechatDevices() {
  wechatDevicesError.value = ''
  const result = await props.client.call('file', 'read', { path: DEVICES_FILE }, true)
  if (typeof result?.data !== 'string') {
    wechatDevicesAvailable.value = false
    wechatDevices.value = []
    wechatDevicesError.value = '无法读取微信推送设备缓存。请先确认插件服务已运行，并允许读取 /tmp/wechatpush/devices.json。'
    return
  }
  try {
    const parsed = JSON.parse(result.data)
    if (!Array.isArray(parsed.devices)) throw new Error('缺少 devices 数组')
    wechatDevices.value = parsed.devices.slice(0, 512).map(item => ({
      name: String(item.name || '未知设备'), ip: String(item.ip || '--'),
      mac: String(item.mac || '--'), status: String(item.status || 'unknown'),
      interface: String(item.type || item.interface || 'LAN'),
      parent: String(item.parent || ''), uptime: String(item.uptime ?? '')
    }))
    wechatDevicesAvailable.value = true
  } catch (_) {
    wechatDevicesAvailable.value = false
    wechatDevices.value = []
    wechatDevicesError.value = '微信推送设备缓存不是有效的 devices.json 格式'
  }
}
async function loadWechatDiy() {
  wechatDiyError.value = ''
  const result = await props.client.call('file', 'read', { path: DIY_FILE }, true)
  if (typeof result?.data !== 'string') {
    wechatDiyLoaded.value = false
    wechatDiyError.value = '无法读取 DIY 配置文件，请检查 luci-app-wechatpush 文件读取权限'
    return
  }
  wechatDiy.value = result.data
  wechatDiyOriginal.value = result.data
  wechatDiyLoaded.value = true
}
async function saveWechatDiy() {
  await run(async () => {
    if (!wechatDiyLoaded.value) throw new Error('DIY 文件未成功读取，禁止覆盖')
    if (wechatDiy.value.length > 65536) throw new Error('DIY 文件不能超过 64 KB')
    let parsed
    try { parsed = JSON.parse(wechatDiy.value) } catch (e) { throw new Error('JSON 格式无效：' + e.message) }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('DIY 配置必须是 JSON 对象')
    }
    if (!wechatDiyDirty.value) return
    await props.client.call('file', 'write', {
      path: DIY_FILE, data: wechatDiy.value.replace(/\r\n/g, '\n').trimEnd() + '\n'
    })
    await loadWechatDiy()
  }, 'DIY JSON 内容已保存到路由器文件', false)
}
async function saveWechat() {
  await run(async () => {
    if (!wechat.value.available) throw new Error('未检测到 /etc/config/wechatpush')
    if (!/^\d+$/.test(wechatForm.sleeptime) || Number(wechatForm.sleeptime) < 10) {
      throw new Error('检测间隔必须是至少 10 秒的整数')
    }
    const values = Object.fromEntries(Object.entries(wechatForm).filter(([key]) =>
      !['miwifi_password'].includes(key)))
    // Only update MiWiFi credentials when the integration is enabled or already
    // configured. Do not silently erase an existing password.
    if (wechatForm.miwifi_password) values.miwifi_password = wechatForm.miwifi_password
    for (const key of Object.keys(wechatMulti)) values[key] = wechatMulti[key].join(' ')
    await setUci('wechatpush', wechat.value.section, values)
    await service('wechat')
  }, '微信推送配置已保存，服务已重启')
}
async function testWechat() {
  await run(async () => {
    // The script may print the full outgoing payload, including webhook URLs
    // and API tokens. Never surface raw stdout/stderr in the notification.
    const result = await props.client.call('file', 'exec', {
      command: '/usr/share/wechatpush/wechatpush',
      params: ['test'], env: null
    }, true)
    if (!result) throw new Error('无法执行测试推送，请检查微信推送脚本的 RPC 权限')
    const exitCode = Number(result.code ?? 0)
    if (exitCode !== 0) {
      throw new Error('测试推送命令执行失败（退出码 ' +
        (Number.isInteger(exitCode) ? exitCode : '未知') + '），请在 QWRT 微信推送日志中查看原因')
    }
  }, '测试推送命令已执行，请检查接收端是否收到消息', false)
}
watch(wechatTab, next => {
  if (props.kind !== 'wechatpush') return
  if (next === 'online') void loadWechatDevices().catch(e => { wechatDevicesError.value = shortError(e) })
  if (next === 'settings' && wechatForm.jsonpath === DIY_FILE && !wechatDiyLoaded.value) {
    void loadWechatDiy().catch(e => { wechatDiyError.value = shortError(e) })
  }
})
watch(() => wechatForm.jsonpath, next => {
  if (props.kind === 'wechatpush' && next === DIY_FILE && !wechatDiyLoaded.value) {
    void loadWechatDiy().catch(e => { wechatDiyError.value = shortError(e) })
  }
})

async function loadOpenClash() {
  const [cfg, rc] = await Promise.all([getUci('openclash'), services()])
  const section = sectionOf(sections(cfg), 'config', 'openclash'), o = section?.options || {}
  openclash.value = { available: !!section, section: section?.id || '', config: o, service: rc?.openclash || null }
  for (const key of Object.keys(oc)) oc[key] = String(o[key] ?? ({ enable: '0', en_mode: 'fake-ip', proxy_mode: 'rule', ipv6_enable: '0', enable_udp_proxy: '1', router_self_proxy: '1' })[key])
}
async function saveOpenClash() {
  await run(async () => {
    if (!openclash.value.available) throw new Error('未检测到 /etc/config/openclash')
    await setUci('openclash', openclash.value.section, Object.fromEntries(Object.entries(oc)))
    await service('openclash')
  }, 'OpenClash 配置已保存，服务已重启')
}

async function loadDetector() {
  const [data, rc] = await Promise.all([props.client.call('luci.internet-detector', 'UIPoll', {}, true), services()])
  detector.value = {
    available: Array.isArray(data?.instances),
    instances: (data?.instances || []).map((x, i) => ({
      id: String(x.instance || i), name: String(x.instance || '监测项 ' + (i + 1)),
      state: Number(x.inet) === 0 ? 'up' : Number(x.inet) === -1 ? 'pending' : 'down'
    })),
    service: rc?.['internet-detector'] || rc?.internet_detector || null
  }
}

async function loadCarbon() {
  const [cfg, updater] = await Promise.all([getUci('luci'), props.client.call('luci.carbon_update', 'status', {}, true)])
  const list = sections(cfg), main = sectionOf(list, 'main', 'core')
  const themes = sectionOf(list, 'themes', 'internal')
  const options = Object.entries(themes?.options || {}).filter(([k, v]) => !k.startsWith('.') && typeof v === 'string' && v.startsWith('/'))
    .map(([title, value]) => ({ title, value }))
  const current = String(main?.options.mediaurlbase || '')
  if (current && !options.some(x => x.value === current)) options.push({ title: '当前主题', value: current })
  carbon.value = { available: !!cfg?.values, section: main?.id || '', current, themes: options, updater }
  carbonMirror.value = String(updater?.mirror || '')
}
async function saveCarbonTheme() {
  await run(async () => {
    if (!carbon.value.section || !carbon.value.themes.some(x => x.value === carbon.value.current)) throw new Error('主题配置不可用')
    await setUci('luci', carbon.value.section, { mediaurlbase: carbon.value.current })
  }, 'LuCI 主题已切换，刷新 LuCI 页面后生效')
}
async function pollCarbonJob(kind) {
  for (let attempt = 0; attempt < 18; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1200))
    const status = await props.client.call('luci.carbon_update', 'status', {}, true)
    if (!status) throw new Error('无法读取 Carbon 更新状态')
    carbon.value = { ...carbon.value, updater: status }
    carbonCheckText.value = status.state === 'checking' ? '正在检查远程版本'
      : status.state === 'downloading' ? '正在下载安装文件'
      : status.state === 'verifying' ? '正在校验文件完整性'
      : status.state === 'installing' ? '正在安装更新' : ''
    if (status.state === 'failed') throw new Error('Carbon 操作失败：' + (status.error || '请查看路由器更新日志'))
    if (status.state === 'idle' || status.state === 'success') {
      notice.value = kind === 'check'
        ? status.can_upgrade ? '检测到可安装的 Carbon 新版本' : 'Carbon 更新检测已完成，暂无可安装更新'
        : 'Carbon 更新操作完成，请确认当前版本'
      return
    }
  }
  notice.value = 'Carbon 任务仍在执行，请稍后刷新更新状态'
}
async function checkCarbon() {
  if (carbonChecking.value) return
  carbonChecking.value = true; error.value = ''; notice.value = ''
  try {
    const r = await props.client.call('luci.carbon_update', 'check', {}, true)
    if (!r || r.error || r.started !== true) throw new Error(r?.error || 'Carbon 更新器未接受检测请求')
    await pollCarbonJob('check')
  } catch (e) { error.value = shortError(e) }
  finally { carbonChecking.value = false; carbonCheckText.value = '' }
}
async function saveCarbonMirror() {
  await run(async () => {
    const r = await props.client.call('luci.carbon_update', 'configure', { mirror: carbonMirror.value.trim() }, true)
    if (!r || r.error) throw new Error(r?.error || 'Carbon 更新器不支持镜像设置')
  }, 'Carbon 下载镜像已保存')
}
async function upgradeCarbon() {
  carbonUpgradeDialog.value = false
  if (carbonChecking.value) return
  carbonChecking.value = true; error.value = ''; notice.value = ''
  try {
    const version = String(carbon.value.updater?.latest || '')
    if (!version || !carbon.value.updater?.can_upgrade) throw new Error('当前没有可安装的已验证更新')
    const r = await props.client.call('luci.carbon_update', 'upgrade', { version }, true)
    if (!r || r.error || r.started !== true) throw new Error(r?.error || 'Carbon 更新请求失败')
    await pollCarbonJob('upgrade')
  } catch (e) { error.value = shortError(e) }
  finally { carbonChecking.value = false; carbonCheckText.value = '' }
}

function parseZt(stdout) {
  return String(stdout || '').split(/\r?\n/).filter(Boolean).map(line => {
    const normalized = line.trim().replace(/^200\s+listnetworks\s+/, '')
    const p = normalized.split(/\s+/)
    return {
      id: p[0] || '', name: p[1] || '', mac: p[2] || '',
      status: p[3] || '', type: p[4] || '', portDeviceName: p[5] || '',
      addresses: p.slice(6).join(' ')
    }
  }).filter(x => /^[a-f0-9]{16}$/i.test(x.id))
}
function parseZtJson(stdout) {
  try {
    const data = typeof stdout === 'string' ? JSON.parse(stdout || '[]') : stdout
    const raw = Array.isArray(data) ? data : (Array.isArray(data?.networks) ? data.networks : [])
    return raw.filter(x => /^[a-f0-9]{16}$/i.test(String(x.id || ''))).map(x => ({
      id: String(x.id), name: String(x.name || ''), status: String(x.status || ''),
      mac: String(x.mac || ''), type: String(x.type || ''),
      portDeviceName: String(x.portDeviceName || ''),
      addresses: Array.isArray(x.assignedAddresses) ? x.assignedAddresses.join(', ') : String(x.assignedAddresses || ''),
      allowManaged: x.allowManaged, allowDefault: x.allowDefault, allowDNS: x.allowDNS
    }))
  } catch (_) { return [] }
}
async function loadZeroTier() {
  // Modern LuCI ZeroTier extensions expose a scoped read-only RPC. Prefer it
  // over file.exec, which standard OpenWrt ACLs intentionally restrict.
  const [cfg, rc, rpcNetworks, rpcStatus] = await Promise.all([
    getUci('zerotier'), services(),
    props.client.call('luci-zerotier', 'get_networks_peers', {}, true),
    props.client.call('luci-zerotier', 'status', {}, true)
  ])
  const list = sections(cfg), global = sectionOf(list, 'global', 'zerotier')
  const networks = list.filter(x => x.type === 'network').map(x => ({
    section: x.id, id: String(x.options.id || ''), name: String(x.options.name || x.options.network_name || x.id || ''), enabled: String(x.options.enabled ?? '1') !== '0'
  }))
  let runtime = [], node = null, runtimeUnavailable = false, runtimeSource = ''
  if (rpcNetworks && Number(rpcNetworks.code ?? 0) === 0) {
    runtime = parseZtJson(rpcNetworks.networks)
    if (runtime.length) runtimeSource = 'luci-zerotier'
  }
  if (rpcStatus && typeof rpcStatus.identity === 'string' && rpcStatus.identity) {
    node = { address: rpcStatus.identity, online: null, version: '' }
  }
  if (!runtime.length || !node) {
    const cli = async params => props.client.call('file', 'exec', {
      command: '/usr/bin/zerotier-cli', params, env: null
    }, true)
    try {
      const [networkResult, infoResult] = await Promise.all([
        !runtime.length ? cli(['-j', 'listnetworks']) : Promise.resolve(null),
        !node ? cli(['-j', 'info']) : Promise.resolve(null)
      ])
      if (networkResult && Number(networkResult.code ?? 1) === 0) {
        runtime = parseZtJson(networkResult.stdout)
        if (runtime.length) runtimeSource = 'zerotier-cli'
      }
      if (infoResult && Number(infoResult.code ?? 1) === 0) {
        try {
          const info = JSON.parse(String(infoResult.stdout || '{}'))
          node = {
            address: String(info.address || info.id || ''),
            version: String(info.version || ''),
            online: info.online === true || String(info.status || '').toUpperCase() === 'ONLINE'
          }
        } catch (_) {}
      }
      if (!runtime.length) {
        const plain = await cli(['listnetworks'])
        if (plain && Number(plain.code ?? 1) === 0) {
          runtime = parseZt(plain.stdout)
          if (runtime.length) runtimeSource = 'zerotier-cli'
        }
      }
      if (!node) {
        const plain = await cli(['info'])
        const fields = String(plain?.stdout || '').trim().replace(/^200\s+info\s+/, '').split(/\s+/)
        if (plain && Number(plain.code ?? 1) === 0 && /^[a-f0-9]{10}$/i.test(fields[0] || '')) {
          node = { address: fields[0], version: fields[1] || '', online: fields[2] === 'ONLINE' }
        }
      }
    } catch (_) { /* Denied CLI execution is not proof that the daemon is down. */ }
  }
  // Find ZeroTier virtual devices in standard OpenWrt RPC structures, even
  // when no ZeroTier-specific RPC or zerotier-cli permission is available.
  const addressList = source => {
    const values = Array.isArray(source) ? source : source == null ? [] : [source]
    return values.flatMap(x => {
      if (typeof x === 'string') return x ? [x] : []
      if (!x || typeof x !== 'object') return []
      const address = x.address || x.addr || x.ipaddr || x.ip
      return address ? [String(address) + (x.mask == null ? '' : '/' + x.mask)] : []
    })
  }
  let virtualDevices = []
  try {
    const [luciDevices, status, dump] = await Promise.all([
      props.client.call('luci-rpc', 'getNetworkDevices', {}, true),
      props.client.call('network.device', 'status', {}, true),
      props.client.call('network.interface', 'dump', {}, true)
    ])
    const interfaceList = Array.isArray(dump?.interface) ? dump.interface : []
    const sources = [luciDevices?.devices || luciDevices, status?.devices || status]
    const names = new Set()
    for (const candidate of sources) {
      if (Array.isArray(candidate)) {
        for (const item of candidate) if (/^zt[a-z0-9]{5,}$/i.test(item?.name || '')) names.add(item.name)
      } else if (candidate && typeof candidate === 'object') {
        for (const key of Object.keys(candidate)) if (/^zt[a-z0-9]{5,}$/i.test(key)) names.add(key)
      }
    }
    for (const iface of interfaceList) {
      const deviceName = iface.l3_device || iface.device
      if (/^zt[a-z0-9]{5,}$/i.test(String(deviceName || ''))) names.add(deviceName)
    }
    for (const net of runtime) {
      if (/^zt[a-z0-9]{5,}$/i.test(net.portDeviceName || '')) names.add(net.portDeviceName)
    }
    virtualDevices = await Promise.all([...names].slice(0, 24).map(async name => {
      const fromLuci = Array.isArray(luciDevices) ? luciDevices.find(x => x.name === name)
        : (luciDevices?.devices || luciDevices || {})[name]
      const fromStatus = Array.isArray(status) ? status.find(x => x.name === name)
        : (status?.devices || status || {})[name]
      const direct = await props.client.call('network.device', 'status', { name }, true)
      const detail = { ...(fromLuci || {}), ...(fromStatus || {}), ...(direct || {}) }
      const related = interfaceList.filter(x => x.device === name || x.l3_device === name)
      const addresses = [
        ...addressList(detail['ipv4-address']), ...addressList(detail['ipv6-address']),
        ...addressList(detail.ipaddrs), ...addressList(detail.ip4addrs),
        ...addressList(detail.ip6addrs), ...addressList(detail.addresses),
        ...related.flatMap(x => [
          ...addressList(x['ipv4-address']), ...addressList(x['ipv6-address'])
        ])
      ]
      // ZeroTier creates its own TUN interface, so netifd often knows the
      // device and MAC but not the assigned IPv4/IPv6 addresses. Ask iproute2
      // on the router for that exact interface, if the RPC ACL permits it.
      if (!addresses.length) {
        for (const command of ['/sbin/ip', '/usr/sbin/ip']) {
          const ipResult = await props.client.call('file', 'exec', {
            command, params: ['-j', 'address', 'show', 'dev', name], env: null
          }, true)
          if (!ipResult || Number(ipResult.code ?? 1) !== 0) continue
          try {
            const ipData = JSON.parse(String(ipResult.stdout || '[]'))
            for (const entry of ipData) {
              for (const addr of entry.addr_info || []) {
                if (addr.local && addr.family !== 'link') {
                  addresses.push(addr.local + (addr.prefixlen == null ? '' : '/' + addr.prefixlen))
                }
              }
            }
          } catch (_) {}
          if (addresses.length) break
        }
      }
      return {
        name, mac: String(detail.macaddr || detail.mac || detail.mac_address || ''),
        up: detail.up === true || detail.link === true,
        addresses: [...new Set(addresses)].join(', ')
      }
    }))
  } catch (_) { /* Permission denial is unknown, not proof of a missing IP. */ }
  // If there is exactly one configured ZeroTier network and one virtual NIC,
  // there is a safe one-to-one association for its assigned addresses.
  if (runtime.length === 1 && virtualDevices.length === 1) {
    const device = virtualDevices[0]
    runtime = runtime.map(network => ({
      ...network, portDeviceName: network.portDeviceName || device.name,
      mac: network.mac || device.mac,
      addresses: network.addresses || device.addresses, interfaceUp: device.up
    }))
  }
  // UCI may contain a local display name even when CLI permission is denied.
  runtime = runtime.map(network => ({
    ...network,
    name: network.name || networks.find(x => x.id === network.id)?.name || network.id.slice(0, 8)
  }))
  // Even without a runtime RPC, show networks we can safely read from UCI,
  // with explicit unknown status rather than an alarming, misleading error.
  if (!runtime.length && networks.length) {
    runtimeUnavailable = true
    runtimeSource = 'config'
    runtime = networks.map(item => ({
      id: item.id, name: item.name || item.id.slice(0, 8), mac: '', status: '未确认',
      type: '', portDeviceName: networks.length === 1 && virtualDevices.length === 1 ? virtualDevices[0].name : '',
      addresses: networks.length === 1 && virtualDevices.length === 1 ? virtualDevices[0].addresses : '',
      interfaceUp: networks.length === 1 && virtualDevices.length === 1 ? virtualDevices[0].up : null,
      enabled: item.enabled
    }))
  } else if (!runtime.length) {
    runtimeUnavailable = true
  }
  zt.value = {
    available: !!global, section: global?.id || '', networks,
    service: rc?.zerotier || null, runtime, node, runtimeUnavailable, runtimeSource, virtualDevices
  }
  ztEnabled.value = String(global?.options.enabled || '0') === '1'
}
async function toggleZtEnabled(enabled) {
  if (busy.value || loading.value || enabled === ztEnabled.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    if (!zt.value.section) throw new Error('未检测到 ZeroTier 全局配置')
    // UCI set + commit happen together, followed by an immediate service restart.
    await setUci('zerotier', zt.value.section, { enabled: enabled ? '1' : '0' })
    // This is now the persisted setting, even if the subsequent restart fails.
    ztEnabled.value = enabled
    await service('zerotier')
    await refresh()
    if (!error.value) notice.value = enabled ? 'ZeroTier 已启用，服务已重启' : 'ZeroTier 已停用，服务已重启'
  } catch (e) {
    const message = shortError(e)
    // On a partial failure (e.g. restart denied after UCI commit), show the
    // router's real saved state instead of pretending the switch was reverted.
    try {
      const cfg = await getUci('zerotier')
      const global = sectionOf(sections(cfg), 'global', 'zerotier')
      if (global) ztEnabled.value = String(global.options.enabled ?? '0') === '1'
    } catch (_) { /* Keep last known confirmed state if readback is unavailable. */ }
    error.value = message
  } finally {
    busy.value = false
  }
}
async function addZt() {
  await run(async () => {
    const id = ztNewId.value.trim().toLowerCase()
    if (!/^[a-f0-9]{16}$/.test(id)) throw new Error('Network ID 必须是 16 位十六进制字符')
    if (zt.value.networks.some(x => x.id === id)) throw new Error('该网络已存在')
    await addUci('zerotier', 'network', { id, enabled: '1', allow_managed: '1', allow_global: '0', allow_default: '0', allow_dns: '0' })
    await service('zerotier')
    ztNewId.value = ''
  }, 'ZeroTier 网络已添加，服务已重启')
}
async function toggleZt(item, enabled) {
  await run(async () => {
    await setUci('zerotier', item.section, { enabled: enabled ? '1' : '0' })
    await service('zerotier')
  }, 'ZeroTier 网络状态已更新')
}
async function deleteZt() {
  const item = ztDelete.value
  ztDeleteDialog.value = false; ztDelete.value = null
  if (!item) return
  await run(async () => { await delUci('zerotier', item.section); await service('zerotier') }, 'ZeroTier 网络配置已删除')
}

async function loadFirewallKernel(cfg) {
  const next = { nat: '待确认', natDetail: '未取得运行规则', congestion: '待确认', congestionDetail: '内核参数不可读取' }
  try {
    const [tcp, rules] = await Promise.all([
      props.client.call('file', 'read', { path: '/proc/sys/net/ipv4/tcp_congestion_control' }, true),
      props.client.call('file', 'exec', {
        command: '/usr/sbin/nft', params: ['list', 'table', 'inet', 'fw4'], env: null
      }, true)
    ])
    const algorithm = String(tcp?.data || '').trim()
    if (/^[a-z0-9_-]{2,32}$/i.test(algorithm)) {
      next.congestion = algorithm.toUpperCase()
      next.congestionDetail = '内核当前算法'
    }
    const rulesText = Number(rules?.code) === 0 ? String(rules?.stdout || '') : ''
    if (rulesText) {
      const hasFullcone = /\bfullcone(?:nat)?\b/i.test(rulesText)
      const hasMasquerade = /\bmasquerade\b/i.test(rulesText)
      next.nat = hasFullcone ? 'Full Cone NAT' : hasMasquerade ? '普通源地址转换' : '未检测到 NAT 规则'
      next.natDetail = '内核 nftables 规则'
    } else {
      const values = Object.values(cfg?.values || {})
      const configFullcone = values.some(v => String(v?.fullcone ?? v?.fullcone4 ?? '') === '1')
      next.nat = configFullcone ? 'Full Cone NAT' : '运行状态待确认'
      next.natDetail = configFullcone ? '防火墙配置已启用，内核未核实' : '路由器未开放规则读取'
    }
  } catch (_) { /* An ACL denial must never be treated as NAT being disabled. */ }
  firewallKernel.value = next
}

async function loadFirewall() {
  const [cfg, rc] = await Promise.all([getUci('firewall'), services()])
  const list = sections(cfg)
  await loadFirewallKernel(cfg)
  fw.value = {
    available: !!cfg?.values,
    zones: list.filter(x => x.type === 'zone').map(x => ({
      section: x.id, name: String(x.options.name || x.id),
      input: String(x.options.input || 'REJECT').toUpperCase(),
      output: String(x.options.output || 'ACCEPT').toUpperCase(),
      forward: String(x.options.forward || 'REJECT').toUpperCase(),
      masq: String(x.options.masq || '0') === '1',
      savedPolicy: { input: String(x.options.input || 'REJECT').toUpperCase(), output: String(x.options.output || 'ACCEPT').toUpperCase(), forward: String(x.options.forward || 'REJECT').toUpperCase() },
      network: Array.isArray(x.options.network) ? x.options.network.join(', ') : String(x.options.network || '')
    })),
    redirects: list.filter(x => x.type === 'redirect').map(x => ({ section: x.id, ...x.options })),
    rules: list.filter(x => x.type === 'rule').map(x => ({ ...x.options, section: x.id, enabled: String(x.options.enabled ?? '1') !== '0' })),
    service: rc?.firewall || null
  }
}
async function reloadFirewall() {
  // OpenWrt's rc.init RPC is designed for restricted service actions and is
  // normally granted by LuCI's system init ACL. Avoid arbitrary file.exec.
  const viaRc = await props.client.call('rc', 'init', {
    name: 'firewall', action: 'reload'
  }, true)
  if (viaRc != null) return
  // LuCI firewall status ACL traditionally permits *restart*, not reload.
  const viaFile = await props.client.call('file', 'exec', {
    command: '/etc/init.d/firewall', params: ['restart'], env: null
  }, true)
  if (viaFile != null && Number(viaFile.code ?? 1) === 0) return
  throw new Error('防火墙配置已保存，但路由器未授权 APP 重新加载防火墙。请在原版 LuCI「网络 → 防火墙」点击“保存并应用”，完成后返回 APP 刷新。')
}
function requestFirewallRuleToggle(rule, enabled) {
  if (busy.value || rule.enabled === enabled) return
  fwRulePending.value = rule
  fwRulePendingEnabled.value = enabled
  fwRuleConfirm.value = true
}
async function confirmFirewallRuleToggle() {
  const rule = fwRulePending.value
  const enabled = fwRulePendingEnabled.value
  fwRuleConfirm.value = false
  fwRulePending.value = null
  if (!rule || rule.enabled === enabled) return
  await run(async () => {
    await setUci('firewall', rule.section, { enabled: enabled ? '1' : '0' })
    await reloadFirewall()
    // Confirm the new UCI value, then update the visible row immediately.
    // This avoids a stale switch while the next full refresh is in flight.
    const cfg = await getUci('firewall')
    const saved = sections(cfg).find(item => item.id === rule.section)
    if (!saved) throw new Error('规则已提交，但无法读取保存后的规则状态')
    const actual = String(saved.options.enabled ?? '1') !== '0'
    fw.value = { ...fw.value, rules: fw.value.rules.map(item =>
      item.section === rule.section ? { ...item, enabled: actual } : item) }
    if (actual !== enabled) throw new Error('规则状态与保存结果不一致，请检查路由器防火墙配置')
  }, '防火墙规则“' + (rule.name || rule.section) + '”已保存为' + (enabled ? '启用' : '停用') + '，已向防火墙发送重载请求')
}
async function saveZone(zone) {
  await run(async () => {
    await setUci('firewall', zone.section, { input: zone.input, output: zone.output, forward: zone.forward, masq: zone.masq ? '1' : '0' })
    await reloadFirewall()
  }, '防火墙区域策略已保存并重载')
}
async function addForward() {
  await run(async () => {
    const src = Number(pf.srcPort), dst = Number(pf.destPort || pf.srcPort), ip = pf.destIp.trim()
    if (!pf.name.trim() || pf.name.trim().length > 48) throw new Error('请输入不超过 48 个字符的规则名称')
    if (!Number.isInteger(src) || src < 1 || src > 65535 || !Number.isInteger(dst) || dst < 1 || dst > 65535) throw new Error('端口范围必须为 1–65535')
    const octets = ip.split('.')
    if (octets.length !== 4 || octets.some(x => !/^\d{1,3}$/.test(x) || Number(x) > 255)) throw new Error('请输入有效的 IPv4 内网地址')
    await addUci('firewall', 'redirect', {
      name: pf.name.trim(), src: 'wan', dest: 'lan', proto: pf.proto,
      src_dport: String(src), dest_ip: ip, dest_port: String(dst), target: 'DNAT', enabled: '1'
    })
    await reloadFirewall()
    Object.assign(pf, { name: '', srcPort: '', destIp: '', destPort: '', proto: 'tcp' })
  }, '端口转发规则已添加并重载防火墙')
}
async function deleteForward() {
  const item = fwDelete.value
  fwDeleteDialog.value = false; fwDelete.value = null
  if (!item) return
  await run(async () => { await delUci('firewall', item.section); await reloadFirewall() }, '端口转发规则已删除并重载防火墙')
}

async function refresh() {
  if (!props.client || loading.value) return
  const kind = props.kind
  loading.value = true; error.value = ''; notice.value = ''
  try {
    if (kind === 'ssr') await loadSsr()
    else if (kind === 'wechatpush') await loadWechat()
    else if (kind === 'openclash') await loadOpenClash()
    else if (kind === 'detector') await loadDetector()
    else if (kind === 'carbon') await loadCarbon()
    else if (kind === 'zerotier') await loadZeroTier()
    else if (kind === 'firewall') await loadFirewall()
    else throw new Error('未知应用模块')
  } catch (e) { error.value = shortError(e) }
  finally {
    readyKind.value = kind
    loading.value = false
    if (props.kind !== kind) void refresh()
  }
}
watch(() => props.kind, () => { readyKind.value = ''; void refresh() })
onMounted(() => { void refresh() })
async function refreshAction() {
  if (manualRefreshing.value || loading.value) return
  manualRefreshing.value = true
  try {
    await refresh()
    if (!error.value) notice.value = '最新状态已刷新'
  } finally {
    manualRefreshing.value = false
  }
}
defineExpose({ refresh, refreshAction })
</script>

<template>
  <div class="router-app-panel">
    <v-snackbar v-model="floatingNoticeOpen" :timeout="operationWaiting ? -1 : 5200"
      :color="floatingNoticeColor" location="bottom" :style="{ bottom: '77px' }"
      role="status" aria-live="polite" class="router-app-floating-feedback">
      <div class="d-flex align-center ga-3">
        <v-progress-circular v-if="operationWaiting" indeterminate size="18" width="2"/>
        <span>{{ floatingNoticeText }}</span>
      </div>
      <template #actions>
        <v-btn v-if="!operationWaiting" variant="text" size="small" @click="dismissFloatingNotice">关闭</v-btn>
      </template>
    </v-snackbar>
    <v-progress-linear v-if="loading && readyKind !== kind" indeterminate color="primary" class="mb-3"/>
    <template v-if="readyKind !== kind">
      <v-skeleton-loader aria-label="正在加载应用配置" type="article,article" class="mb-3"/>
      <p class="muted-hint">正在读取 QWRT 应用配置与运行状态…</p>
    </template>
    <template v-else>
    <template v-if="kind === 'ssr'">
      <v-alert v-if="!ssr.available" type="warning" variant="tonal">未检测到 ShadowSocksR Plus+ 配置，或当前 RPC 账号无权读取。</v-alert>
      <template v-else>
        <div class="router-app-summary"><div><span>服务状态</span><strong>{{ statusText(ssr.service) }}</strong></div><div><span>运行模式</span><strong>{{ ssr.global.run_mode || '--' }}</strong></div><div><span>节点数量</span><strong>{{ ssr.nodes.length }}</strong></div></div>
        <v-btn-toggle v-model="ssrTab" mandatory color="primary" variant="outlined" density="comfortable" class="d-flex my-4" style="width:100%">
          <v-btn class="flex-grow-1" value="nodes">代理节点</v-btn>
          <v-btn class="flex-grow-1" value="status">运行状态</v-btn>
          <v-btn class="flex-grow-1" value="components">组件更新</v-btn>
        </v-btn-toggle>
        <template v-if="ssrTab === 'nodes'">
          <h3 class="router-app-section-title">代理节点</h3>
          <v-select v-model="ssrNode" label="当前节点" density="comfortable" variant="outlined" :items="[{title:'停用透明代理',value:'nil'}, ...ssr.nodes.map(x => ({title:x.title + (x.detail ? ' · ' + x.detail : ''),value:x.id}))]"/>
          <div class="d-flex flex-wrap ga-2">
            <v-btn color="primary" variant="tonal" :disabled="busy" @click="applySsrNode">应用节点并重启</v-btn>
            <v-btn variant="outlined" :disabled="busy || ssrProbeBusy || !ssr.nodes.length" :loading="ssrProbeBusy" @click="probeAllSsr">批量探测节点</v-btn>
          </div>
          <p class="muted-hint mt-2">仅从 QWRT 路由器侧进行节点探测，优先使用 SSR Plus+ 原生探测接口，必要时尝试路由器已授权的 TCP 工具；不使用手机网络检测。</p>
          <v-alert v-if="ssrProbeUnavailable" type="info" variant="tonal" density="compact" class="mt-3">{{ ssrProbeUnavailable }}</v-alert>
          <div v-if="ssr.nodes.length" class="app-compact-table ssr-node-table mt-3" role="list" aria-label="SSR 节点列表">
            <div v-for="node in ssr.nodes" :key="node.id" role="listitem" class="app-compact-row ssr-node-row">
              <div class="app-compact-body">
                <div class="app-compact-name">{{ node.title }}</div>
                <div class="app-compact-sub ssr-node-address">{{ node.host || '未配置服务器' }}<span v-if="node.port">:{{ node.port }}</span></div>
                <div class="app-compact-foot"><v-chip size="x-small" variant="tonal" color="secondary">{{ node.type || '未知协议' }}</v-chip></div>
                <div v-if="ssrProbes[node.id]" class="app-compact-sub ssr-node-probe"
                  :class="{ 'is-success': ssrProbes[node.id].status === 'ok' }">
                  {{ ssrProbes[node.id].text }}
                </div>
              </div>
              <div class="app-compact-end">
                <v-chip v-if="node.id === ssr.global.global_server" size="x-small" variant="tonal" color="success">当前</v-chip>
                <v-btn icon="mdi-lan-check" variant="tonal" color="primary" size="small"
                  :disabled="busy || ssrProbeBusy" :aria-label="'探测节点 ' + node.title"
                  @click="probeSsrNode(node)"/>
              </div>
            </div>
          </div>
          <v-alert v-else type="info" variant="tonal" density="compact" class="mt-3">尚未配置代理节点，请先添加节点或订阅。</v-alert>
        </template>
        <template v-else-if="ssrTab === 'status'">
          <h3 class="router-app-section-title">SSR Plus+ 运行状态</h3>
          <div class="router-app-summary"><div><span>代理服务</span><strong>{{ statusText(ssr.service) }}</strong></div><div><span>当前节点</span><strong>{{ ssr.nodes.find(x => x.id === ssr.global.global_server)?.title || '未启用' }}</strong></div></div>
          <div class="ssr-status-grid mt-3">
            <div><span>全局代理模式</span><strong>{{ ssr.global.run_mode || '--' }}</strong></div>
            <div><span>TCP 代理节点</span><strong>{{ ssr.nodes.find(x => x.id === ssr.global.global_server)?.title || '未指定' }}</strong></div>
            <div><span>UDP 代理节点</span><strong>{{ ssr.nodes.find(x => x.id === ssr.global.udp_relay_server)?.title || (ssr.global.udp_relay_server === 'same' ? '与 TCP 相同' : '未指定') }}</strong></div>
            <div><span>DNS 代理配置</span><strong>{{ String(ssr.global.pdnsd_enable ?? '--') === '1' ? '启用' : String(ssr.global.pdnsd_enable ?? '--') === '0' ? '停用' : '未确认' }}</strong></div>
            <div v-if="ssrStatusDetail?.instances"><span>procd 实例</span><strong>{{ Object.keys(ssrStatusDetail.instances).join('、') || '暂无' }}</strong></div>
          </div>
          <div class="d-flex flex-wrap ga-2 mt-3">
            <v-btn color="primary" variant="tonal" :disabled="loading || busy" @click="refreshAction">刷新服务状态</v-btn>
            <v-btn variant="outlined" :disabled="busy" @click="run(() => service('ssr','start'),'SSR Plus+ 已启动')">启动</v-btn>
            <v-btn variant="outlined" :disabled="busy" @click="run(() => service('ssr','stop'),'SSR Plus+ 已停止')">停止</v-btn>
            <v-btn variant="outlined" :disabled="busy" @click="run(() => service('ssr','restart'),'SSR Plus+ 已重启')">重启</v-btn>
          </div>
          <p class="muted-hint mt-3">此页显示 QWRT UCI、rc、procd 可读取的状态；内部 TCP/UDP 进程状态需额外开放监控接口才能细分。</p>
        </template>
        <template v-else-if="ssrTab === 'components'">
          <h3 class="router-app-section-title">SSR Plus+ 组件更新</h3>
          <v-select v-model="ssrComponent" label="选择组件" :items="ssrComponents" density="comfortable" variant="outlined"/>
          <div class="d-flex flex-wrap ga-2 mt-2">
            <v-btn variant="outlined" :disabled="ssrComponentBusy" :loading="ssrComponentBusy" @click="querySsrComponent(false)">查看本地版本</v-btn>
            <v-btn color="primary" variant="tonal" :disabled="ssrComponentBusy" @click="querySsrComponent(true)">检测更新</v-btn>
          </div>
          <div v-if="ssrComponentResult" class="router-app-summary mt-4">
            <div><span>当前版本</span><strong>{{ ssrComponentResult.current_version || '--' }}</strong></div>
            <div><span>最新版本</span><strong>{{ ssrComponentResult.latest_version || '尚未检查' }}</strong></div>
            <div><span>包管理器</span><strong>{{ ssrComponentResult.package_manager || '--' }}</strong></div>
          </div>
          <v-alert v-if="ssrComponentResult && ssrComponentChecked" :type="ssrComponentResult.can_upgrade === '1' ? 'success' : 'info'" variant="tonal" density="compact" class="mt-3">{{ ssrComponentResult.can_upgrade === '1' ? '检测到可安装更新' : '未检测到可安装更新' }}</v-alert>
          <v-btn class="mt-3" color="success" variant="tonal" :disabled="ssrComponentBusy || !ssrComponentChecked || ssrComponentResult?.can_upgrade !== '1'" @click="ssrComponentDialog = true">安装组件更新</v-btn>
          <p class="muted-hint mt-3">优先使用 SSR Plus+ 原版 LuCI 接口。安装可能持续数分钟，APP 最长等待 10 分钟；遇到超时或断线时，请先查看本地版本，不要重复安装。</p>
        </template>
      </template>
      <v-dialog v-model="ssrComponentDialog" max-width="420"><v-card rounded="xl">
        <v-card-title>确认安装 SSR Plus+ 更新？</v-card-title>
        <v-card-text>组件：{{ ssrComponents.find(x => x.value === ssrComponent)?.title }}。更新可能导致代理服务短暂中断。</v-card-text>
        <v-card-actions><v-spacer/><v-btn variant="text" @click="ssrComponentDialog = false">取消</v-btn><v-btn color="success" @click="upgradeSsrComponent">确认安装</v-btn></v-card-actions>
      </v-card></v-dialog>
    </template>
    <template v-else-if="kind === 'wechatpush'">
      <v-alert v-if="!wechat.available" type="warning" variant="tonal">未检测到 /etc/config/wechatpush，请先安装 luci-app-wechatpush。</v-alert>
      <template v-else>
        <div class="router-app-summary"><div><span>服务状态</span><strong>{{ statusText(wechat.service) }}</strong></div><div><span>推送功能</span><strong>{{ wechatForm.enable === '1' ? '已启用' : '未启用' }}</strong></div></div>
        <v-btn-toggle v-model="wechatTab" mandatory variant="outlined" color="primary" class="d-flex mt-3 mb-4" style="width:100%" density="comfortable">
          <v-btn value="settings" class="flex-grow-1">基本配置</v-btn>
          <v-btn value="content" class="flex-grow-1">推送内容</v-btn>
          <v-btn value="online" class="flex-grow-1">在线设备</v-btn>
          <v-btn value="advanced" class="flex-grow-1">高级</v-btn>
        </v-btn-toggle>
        <template v-if="wechatTab === 'settings'">
          <v-switch density="compact" inset :model-value="wechatForm.enable === '1'" label="启用微信推送" color="primary" hide-details @update:model-value="wechatForm.enable = $event ? '1' : '0'"/>
          <v-select v-model="wechatForm.jsonpath" label="推送渠道" :items="wechatProviderItems" item-title="title" item-value="value" density="comfortable" variant="outlined" class="mt-3"/>
          <v-text-field v-model="wechatForm.device_name" label="消息中的设备名称（可选）" density="comfortable" variant="outlined"/>
          <v-text-field v-model="wechatForm.sleeptime" label="检测间隔（秒）" type="number" min="10" density="comfortable" variant="outlined"/>
          <v-text-field v-for="key in providerFields" :key="key" v-model="wechatForm[key]" :label="providerLabels[key]" :type="secretKey(key) ? 'password' : 'text'" autocomplete="off" density="comfortable" variant="outlined"/>
          <template v-if="wechatForm.jsonpath === DIY_FILE">
            <h3 class="router-app-section-title mt-3">DIY 推送 JSON 文件内容</h3>
            <p class="muted-hint">直接编辑 {{ DIY_FILE }}，不是输入文件路径。保存前会校验 JSON 格式。</p>
            <v-alert v-if="wechatDiyError" type="warning" variant="tonal" density="compact" class="my-2">{{ wechatDiyError }}</v-alert>
            <v-textarea v-model="wechatDiy" label="DIY JSON 内容" aria-label="DIY JSON 内容" variant="outlined" rows="4" class="wechat-json-editor" :disabled="!wechatDiyLoaded" spellcheck="false"/>
            <div class="d-flex flex-wrap ga-2 mb-3">
              <v-btn color="primary" variant="tonal" :disabled="busy || !wechatDiyLoaded || !wechatDiyDirty" @click="saveWechatDiy">保存 DIY 文件内容</v-btn>
              <v-btn variant="text" :disabled="busy" @click="loadWechatDiy">重新读取文件</v-btn>
            </div>
          </template>
          <v-switch density="compact" inset :model-value="wechatForm.reset_regularly === '1'" label="每天零点重置流量统计" color="primary" hide-details @update:model-value="wechatForm.reset_regularly = $event ? '1' : '0'"/>
          <v-switch density="compact" inset :model-value="wechatForm.prefer_client_page === '1'" label="优先显示在线设备页面" color="primary" hide-details @update:model-value="wechatForm.prefer_client_page = $event ? '1' : '0'"/>
          <v-switch density="compact" inset :model-value="wechatForm.debuglevel === '1'" label="记录运行日志" color="primary" hide-details @update:model-value="wechatForm.debuglevel = $event ? '1' : '0'"/>
          <div class="d-flex flex-wrap ga-2 mt-3"><v-btn color="primary" variant="tonal" :disabled="busy" @click="saveWechat">保存配置并重启</v-btn><v-btn variant="outlined" :disabled="busy || wechatForm.enable !== '1'" @click="testWechat">发送测试推送</v-btn></div>
          <p class="muted-hint mt-2">推送凭据通过 QWRT UCI 配置保存；DIY 内容单独写入 JSON 文件。测试推送会真实发送消息。</p>
        </template>
        <template v-else-if="wechatTab === 'content'">
          <h3 class="router-app-section-title">设备上下线通知</h3>
          <v-switch density="compact" inset v-for="item in wechatMultiOptions.device_notification" :key="item.value" :model-value="wechatMulti.device_notification.includes(item.value)" :label="item.title" color="primary" hide-details @update:model-value="toggleWechatMulti('device_notification',item.value,$event)"/>
          <h3 class="router-app-section-title mt-4">系统监测告警</h3>
          <v-switch density="compact" inset v-for="item in wechatMultiOptions.cpu_notification" :key="item.value" :model-value="wechatMulti.cpu_notification.includes(item.value)" :label="item.title" color="primary" hide-details @update:model-value="toggleWechatMulti('cpu_notification',item.value,$event)"/>
          <h3 class="router-app-section-title mt-4">管理登录提醒</h3>
          <v-switch density="compact" inset v-for="item in wechatMultiOptions.login_notification" :key="item.value" :model-value="wechatMulti.login_notification.includes(item.value)" :label="item.title" color="primary" hide-details @update:model-value="toggleWechatMulti('login_notification',item.value,$event)"/>
          <h3 class="router-app-section-title mt-4">简化推送内容</h3>
          <v-switch density="compact" inset v-for="item in wechatMultiOptions.lite_enable" :key="item.value" :model-value="wechatMulti.lite_enable.includes(item.value)" :label="item.title" color="primary" hide-details @update:model-value="toggleWechatMulti('lite_enable',item.value,$event)"/>
          <v-divider class="my-4"/><h3 class="router-app-section-title">定时推送</h3>
          <v-select v-model="wechatForm.crontab_mode" label="定时任务模式" variant="outlined" density="comfortable" :items="[{title:'关闭',value:''},{title:'固定时间发送',value:'1'},{title:'按间隔发送',value:'2'}]"/>
          <v-select v-if="wechatForm.crontab_mode === '2'" v-model="wechatForm.crontab_interval_time" label="发送间隔（小时）" variant="outlined" density="comfortable" :items="['1','2','3','4','6','8','12','24']"/>
          <p v-if="wechatForm.crontab_mode === '1'" class="muted-hint">固定发送时间请到 QWRT 原版微信推送页面配置，APP 暂不修改已有时间列表。</p>
          <v-switch density="compact" inset v-for="item in wechatMultiOptions.send_notification" :key="item.value" :model-value="wechatMulti.send_notification.includes(item.value)" :label="item.title" color="primary" hide-details @update:model-value="toggleWechatMulti('send_notification',item.value,$event)"/>
          <v-btn color="primary" variant="tonal" class="mt-4" :disabled="busy" @click="saveWechat">保存推送策略并重启</v-btn>
        </template>
        <template v-else-if="wechatTab === 'online'">
          <div class="d-flex align-center justify-space-between mb-3">
            <div><strong>微信推送检测设备</strong><p class="muted-hint">确认在线 {{ wechatOnlineCount }} · 未确认 {{ wechatDevicesShown.length - wechatOnlineCount }}</p></div>
            <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :disabled="loading || busy" @click="loadWechatDevices">刷新列表</v-btn>
          </div>
          <v-alert v-if="wechatDevicesError" type="info" variant="tonal" density="compact">{{ wechatDevicesError }}</v-alert>
          <template v-else-if="wechatDevicesShown.length">
            <v-text-field v-model="wechatDeviceSearch" class="wechat-devices-search mb-3"
              label="搜索在线设备" aria-label="搜索在线设备" placeholder="主机名、IP、MAC 或接入信息"
              prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" hide-details clearable/>
            <div v-if="filteredWechatDevices.length" class="app-compact-table wechat-device-table" role="list" aria-label="微信推送在线设备">
              <div v-for="item in filteredWechatDevices" :key="item.mac + '-' + item.ip"
                class="app-compact-row wechat-online-row" role="listitem">
                <div class="app-compact-body">
                  <div class="app-compact-name">{{ item.name || '未命名设备' }}</div>
                  <div class="app-compact-sub wechat-device-address"><span>IP</span> {{ item.ip || '暂无 IP' }}</div>
                  <div class="app-compact-sub wechat-device-address"><span>MAC</span> {{ item.mac || '暂无 MAC' }}</div>
                  <div v-if="item.interface || item.parent || item.uptime" class="app-compact-foot">
                    <span>{{ item.interface || '接入未知' }}{{ item.parent && item.parent !== 'Local' ? ' · ' + item.parent : '' }}</span>
                    <span v-if="item.uptime">在线 {{ item.uptime }}</span>
                  </div>
                </div>
                <v-chip size="x-small" :color="item.status === 'online' ? 'success' : 'secondary'"
                  variant="tonal" class="app-compact-status">
                  {{ item.status === 'online' ? '在线' : '待确认' }}
                </v-chip>
              </div>
            </div>
            <v-alert v-else type="info" variant="tonal" density="compact">
              没有匹配的在线设备，请调整搜索条件。
            </v-alert>
          </template>
          <v-alert v-else-if="wechatDevicesAvailable" type="info" variant="tonal" density="compact">微信推送缓存中暂无在线或待确认的设备。</v-alert>
        </template>
        <template v-else-if="wechatTab === 'advanced'">
          <h3 class="router-app-section-title">设备探测</h3>
          <v-switch density="compact" inset :model-value="wechatForm.passive_mode === '1'" label="停用主动探测" color="primary" hide-details @update:model-value="wechatForm.passive_mode = $event ? '1' : '0'"/>
          <v-alert v-if="wechatForm.passive_mode === '1'" type="warning" variant="tonal" density="compact">停用主动探测后，设备上下线通知和在线列表可能不准确。</v-alert>
          <template v-else>
            <v-text-field v-model="wechatForm.up_timeout" label="上线检测超时（秒）" type="number" min="1" variant="outlined" density="comfortable"/>
            <v-text-field v-model="wechatForm.down_timeout" label="离线检测超时（秒）" type="number" min="1" variant="outlined" density="comfortable"/>
            <v-text-field v-model="wechatForm.timeout_retry_count" label="离线重试次数" type="number" min="1" variant="outlined" density="comfortable"/>
            <v-switch density="compact" inset :model-value="wechatForm.only_timeout_push === '1'" label="离线超时仅对已订阅通知的设备生效" color="primary" hide-details @update:model-value="wechatForm.only_timeout_push = $event ? '1' : '0'"/>
          </template>
          <v-text-field v-model="wechatForm.thread_num" label="最大探测并发数" type="number" min="1" max="16" variant="outlined" density="comfortable" class="mt-3"/>
          <v-divider class="my-4"/><h3 class="router-app-section-title">小米 AP 设备信息辅助</h3>
          <v-switch density="compact" inset :model-value="wechatMiwifiEnabled" label="从小米路由器读取终端名称及无线接入信息" color="primary" hide-details @update:model-value="toggleWechatMiwifi($event)"/>
          <template v-if="wechatMiwifiEnabled">
            <v-text-field v-model.trim="wechatForm.miwifi_ip" label="小米主 AP IP 地址" variant="outlined" density="comfortable" placeholder="192.168.100.x"/>
            <v-text-field v-model="wechatForm.miwifi_password" label="小米路由器管理密码" type="password" autocomplete="new-password" variant="outlined" density="comfortable"/>
          </template>
          <v-btn color="primary" variant="tonal" class="mt-3" :disabled="busy" @click="saveWechat">保存高级设置并重启</v-btn>
        </template>
      </template>
    </template>
    <template v-else-if="kind === 'openclash'">
      <v-alert v-if="!openclash.available" type="warning" variant="tonal">未检测到 /etc/config/openclash，请先安装 OpenClash。</v-alert>
      <template v-else>
        <div class="router-app-summary"><div><span>服务状态</span><strong>{{ statusText(openclash.service) }}</strong></div><div><span>插件开关</span><strong>{{ oc.enable === '1' ? '已启用' : '未启用' }}</strong></div><div><span>代理模式</span><strong>{{ oc.proxy_mode }}</strong></div></div>
        <v-switch density="compact" inset :model-value="oc.enable === '1'" label="启用 OpenClash" color="primary" hide-details @update:model-value="oc.enable = $event ? '1' : '0'"/>
        <v-select v-model="oc.en_mode" label="运行模式" density="comfortable" variant="outlined" class="mt-3" :items="['fake-ip','fake-ip-tun','fake-ip-mix','redir-host','redir-host-tun','redir-host-mix']"/>
        <v-select v-model="oc.proxy_mode" label="代理模式" density="comfortable" variant="outlined" :items="[{title:'规则模式',value:'rule'},{title:'全局模式',value:'global'},{title:'直连模式',value:'direct'}]"/>
        <v-switch density="compact" inset :model-value="oc.ipv6_enable === '1'" label="IPv6 代理" color="primary" hide-details @update:model-value="oc.ipv6_enable = $event ? '1' : '0'"/>
        <v-switch density="compact" inset :model-value="oc.enable_udp_proxy === '1'" label="UDP 代理" color="primary" hide-details @update:model-value="oc.enable_udp_proxy = $event ? '1' : '0'"/>
        <v-switch density="compact" inset :model-value="oc.router_self_proxy === '1'" label="路由器自身流量代理" color="primary" hide-details @update:model-value="oc.router_self_proxy = $event ? '1' : '0'"/>
        <div class="d-flex flex-wrap ga-2 mt-3"><v-btn color="primary" variant="tonal" :disabled="busy" @click="saveOpenClash">保存配置并重启</v-btn><v-btn variant="outlined" :disabled="busy" @click="run(() => service('openclash','start'),'OpenClash 已启动')">启动</v-btn><v-btn variant="outlined" :disabled="busy" @click="run(() => service('openclash','stop'),'OpenClash 已停止')">停止</v-btn><v-btn variant="outlined" :disabled="busy" @click="run(() => service('openclash','restart'),'OpenClash 已重启')">重启</v-btn></div>
        <p class="muted-hint mt-2">这里只修改 OpenClash 全局 UCI 选项，不改写 YAML 订阅、节点、规则集和自定义覆写。</p>
      </template>
    </template>
    <template v-else-if="kind === 'detector'">
      <div class="router-app-summary"><div><span>监测接口</span><strong>{{ detector.available ? '可用' : '不可用' }}</strong></div><div><span>监测项目</span><strong>{{ detector.instances.length }}</strong></div><div><span>服务状态</span><strong>{{ statusText(detector.service) }}</strong></div></div>
      <v-alert v-if="!detector.available" type="warning" variant="tonal">无法读取 luci.internet-detector.UIPoll，请检查插件和 RPC 权限。</v-alert>
      <div v-else class="app-compact-table detector-list" role="list" aria-label="联网检测列表">
        <div v-for="x in detector.instances" :key="x.id" class="app-compact-row detector-row" role="listitem">
          <div class="app-compact-body">
            <div class="app-compact-name">{{ x.name }}</div>
            <div v-if="x.id !== x.name" class="app-compact-sub">{{ x.id }}</div>
          </div>
          <v-chip size="small" variant="tonal" class="app-compact-status" :color="x.state === 'up' ? 'success' : x.state === 'pending' ? 'warning' : 'error'">
            <v-icon :icon="x.state === 'up' ? 'mdi-check-circle' : x.state === 'pending' ? 'mdi-timer-sand' : 'mdi-alert-circle'" start size="14"/>
            {{ x.state === 'up' ? '正常' : x.state === 'pending' ? '检测中' : '异常' }}
          </v-chip>
        </div>
      </div>
      <div class="d-flex flex-wrap ga-2 mt-3"><v-btn color="primary" variant="tonal" :disabled="loading" @click="refreshAction">刷新监测结果</v-btn><v-btn v-if="detector.service" variant="outlined" :disabled="busy" @click="run(() => service('detector'),'Internet Detector 已重启')">重启监测服务</v-btn></div>
      <p class="muted-hint mt-2">监测结果直接读取 QWRT 的 Internet Detector ubus 接口；此页不修改现有监测实例。</p>
    </template>
    <template v-else-if="kind === 'carbon'">
      <v-alert v-if="!carbon.available" type="warning" variant="tonal">无法读取 LuCI 主题配置，请检查 uci.get luci 权限。</v-alert>
      <template v-else>
        <h3 class="router-app-section-title">LuCI 主题</h3>
        <v-select v-model="carbon.current" label="当前主题" :items="carbon.themes" item-title="title" item-value="value" density="comfortable" variant="outlined"/>
        <v-btn color="primary" variant="tonal" :disabled="busy || !carbon.themes.length" @click="saveCarbonTheme">应用主题</v-btn>
        <v-divider class="my-4"/><h3 class="router-app-section-title">Carbon 主题更新</h3>
        <div v-if="carbon.updater" class="router-app-summary"><div><span>当前版本</span><strong>{{ carbon.updater.current || '--' }}</strong></div><div><span>最新版本</span><strong>{{ carbon.updater.latest || '--' }}</strong></div><div><span>包管理器</span><strong>{{ carbon.updater.manager || '--' }}</strong></div></div>
        <v-alert v-else type="info" variant="tonal" density="compact">未检测到 Carbon 更新器 RPC。主题切换仍可用；在线更新需新版 Carbon 更新器和 ACL。</v-alert>
        <v-text-field v-model="carbonMirror" label="HTTPS 下载镜像前缀（可留空）" placeholder="https://mirror.example.com/" density="comfortable" variant="outlined"/>
        <div class="d-flex flex-wrap ga-2"><v-btn variant="outlined" :disabled="busy || !carbon.updater" @click="saveCarbonMirror">保存镜像</v-btn><v-btn color="primary" variant="tonal" :loading="carbonChecking" :disabled="busy || carbonChecking || !carbon.updater" @click="checkCarbon">检查更新</v-btn><v-btn color="success" variant="tonal" :disabled="busy || carbonChecking || !carbon.updater?.can_upgrade" @click="carbonUpgradeDialog = true">安装已验证更新</v-btn></div>
        <v-alert v-if="carbonChecking" type="info" variant="tonal" density="compact" class="mt-3">{{ carbonCheckText || '正在检查 Carbon 更新状态…' }}</v-alert>
        <v-alert v-if="carbon.updater?.can_upgrade && !carbonChecking" type="success" variant="tonal" density="compact" class="mt-3">检测到可安装版本 {{ carbon.updater.latest }}，可以点击“安装已验证更新”。</v-alert>
        <v-alert v-if="carbon.updater?.reason" type="info" variant="tonal" density="compact" class="mt-3">{{ carbon.updater.reason }}</v-alert>
        <v-alert v-if="carbon.updater?.state && carbon.updater.state !== 'idle'" type="info" variant="tonal" density="compact" class="mt-3">更新状态：{{ carbon.updater.state }} {{ carbon.updater.error || '' }}</v-alert>
      </template>
      <v-dialog v-model="carbonUpgradeDialog" max-width="420"><v-card rounded="xl"><v-card-title>确认更新 Carbon 主题</v-card-title><v-card-text>将通过 Carbon 官方更新器安装已校验版本 {{ carbon.updater?.latest }}。</v-card-text><v-card-actions><v-spacer/><v-btn variant="text" @click="carbonUpgradeDialog = false">取消</v-btn><v-btn color="primary" @click="upgradeCarbon">确认更新</v-btn></v-card-actions></v-card></v-dialog>
    </template>
    <template v-else-if="kind === 'zerotier'">
      <v-alert v-if="!zt.available" type="warning" variant="tonal">未检测到 ZeroTier 配置，请先安装 zerotier 并初始化 /etc/config/zerotier。</v-alert>
      <template v-else>
        <div class="router-app-summary"><div><span>服务状态</span><strong>{{ statusText(zt.service) }}</strong></div><div><span>全局开关</span><strong>{{ ztEnabled ? '已启用' : '未启用' }}</strong></div><div><span>网络数量</span><strong>{{ zt.networks.length }}</strong></div></div>
        <v-switch density="compact" inset :model-value="ztEnabled" label="启用 ZeroTier" color="primary" hide-details :disabled="busy || loading" @update:model-value="toggleZtEnabled($event)"/>
        <h3 class="router-app-section-title mt-4">已加入的网络</h3>
        <v-list v-if="zt.networks.length" density="compact"><v-list-item v-for="x in zt.networks" :key="x.section" :title="x.name || x.id" :subtitle="x.id"><template #append><v-switch inset :model-value="x.enabled" density="compact" color="primary" hide-details :disabled="busy" @update:model-value="toggleZt(x,$event)"/><v-btn icon="mdi-delete-outline" color="error" variant="text" size="small" aria-label="删除 ZeroTier 网络" @click="ztDelete=x;ztDeleteDialog=true"/></template></v-list-item></v-list>
        <v-alert v-else type="info" variant="tonal" density="compact">尚未配置 ZeroTier 网络。</v-alert>
        <h3 class="router-app-section-title mt-4">当前运行网络信息</h3>
        <div v-if="zt.node" class="router-app-summary">
          <div><span>节点 ID</span><strong>{{ zt.node.address || '--' }}</strong></div>
          <div><span>节点状态</span><strong>{{ zt.node.online == null ? '未确认' : zt.node.online ? 'ONLINE' : 'OFFLINE' }}</strong></div>
          <div><span>ZeroTier 版本</span><strong>{{ zt.node.version || '--' }}</strong></div>
        </div>
        <p v-if="zt.runtimeUnavailable" class="muted-hint mt-2">当前路由器未开放实时 ZeroTier 状态读取接口；以下展示已保存的网络配置，运行状态待确认。</p>
        <p v-else class="muted-hint mt-2">运行信息来源：{{ zt.runtimeSource === 'luci-zerotier' ? 'ZeroTier 专用 RPC' : 'ZeroTier CLI' }}</p>
        <v-card v-for="x in zt.runtime" :key="x.id" variant="outlined" rounded="lg" class="zt-network-card mt-3" style="padding:12px">
          <div class="d-flex align-center justify-space-between ga-2"><strong>{{ x.name || x.id.slice(0, 8) }}</strong>
            <v-chip size="x-small" :color="x.status === 'OK' ? 'success' : x.interfaceUp ? 'info' : 'secondary'" variant="tonal">{{ x.status === 'OK' ? '网络已连接' : x.interfaceUp ? '虚拟网卡已启用' : '网络状态待确认' }}</v-chip>
          </div>
          <div class="muted-hint mt-2">网络 ID：{{ x.id }}</div>
          <div class="muted-hint">虚拟网卡：{{ x.portDeviceName || '--' }}</div>
          <div class="muted-hint">虚拟 MAC：{{ x.mac || '--' }}</div>
          <div class="muted-hint">分配 IP：{{ x.addresses || '暂无' }}</div>
          <div class="muted-hint">网络类型：{{ x.type || '--' }}</div>
        </v-card>
        <div v-if="zt.virtualDevices?.length" class="mt-3">
          <h3 class="router-app-section-title">ZeroTier 虚拟网卡（来自系统网络接口）</h3>
          <v-card v-for="device in zt.virtualDevices" :key="device.name" rounded="lg" variant="outlined" class="zt-network-card mb-2" style="padding:12px">
            <div class="d-flex align-center justify-space-between ga-2">
              <strong>{{ device.name }}</strong>
              <v-chip size="x-small" :color="device.up ? 'success' : 'secondary'" variant="tonal">{{ device.up ? '接口已启用' : '链路未确认' }}</v-chip>
            </div>
            <div class="muted-hint mt-2">MAC：{{ device.mac || '--' }}</div>
            <div class="muted-hint">地址：{{ device.addresses || '未从 netifd 获取' }}</div>
          </v-card>
        </div>
        <v-alert v-if="!zt.runtime.length" type="info" variant="tonal" density="compact">当前没有已配置或可读取的 ZeroTier 网络。</v-alert>
        <h3 class="router-app-section-title mt-4">加入新网络</h3><v-text-field v-model.trim="ztNewId" label="Network ID" placeholder="16 位十六进制字符" density="comfortable" variant="outlined" maxlength="16"/><v-btn color="primary" variant="tonal" :disabled="busy" @click="addZt">加入网络并重启服务</v-btn>
        <p class="muted-hint mt-2">加入后仍需在 ZeroTier Central 中授权此设备。默认启用 allowManaged，关闭 allowDefault 和 allowDNS。</p>
      </template>
      <v-dialog v-model="ztDeleteDialog" max-width="400"><v-card rounded="xl"><v-card-title>删除 ZeroTier 网络？</v-card-title><v-card-text>将移除网络 {{ ztDelete?.id }} 并重启服务。</v-card-text><v-card-actions><v-spacer/><v-btn variant="text" @click="ztDeleteDialog=false">取消</v-btn><v-btn color="error" @click="deleteZt">删除</v-btn></v-card-actions></v-card></v-dialog>
    </template>
    <template v-else-if="kind === 'firewall'">
      <v-alert v-if="!fw.available" type="warning" variant="tonal">无法读取 /etc/config/firewall，请检查 UCI 读取权限。</v-alert>
      <template v-else>
        <div class="router-app-summary"><div><span>防火墙状态</span><strong>{{ firewallStatusText }}</strong></div><div><span>防火墙区域</span><strong>{{ fw.zones.length }}</strong></div><div><span>端口转发</span><strong>{{ fw.redirects.length }}</strong></div></div>
        <div class="firewall-kernel-cards mt-3" aria-label="防火墙内核信息">
          <div class="firewall-kernel-item"><span>NAT 模式</span><strong>{{ firewallKernel.nat }}</strong><small>{{ firewallKernel.natDetail }}</small></div>
          <div class="firewall-kernel-item"><span>TCP 拥塞控制</span><strong>{{ firewallKernel.congestion }}</strong><small>{{ firewallKernel.congestionDetail }}</small></div>
        </div>
        <h3 class="router-app-section-title">区域策略</h3>
        <v-expansion-panels variant="accordion" class="firewall-policy-expansion">
          <v-expansion-panel v-for="zone in fw.zones" :key="zone.section">
            <v-expansion-panel-title>
              <div class="firewall-zone-title">
                <strong>{{ zone.name }}</strong>
                <small>{{ zone.network || '未绑定网络' }}</small>
                <div class="firewall-policy-preview-label">当前区域策略</div>
                <div class="firewall-policy-preview" :aria-label="'当前策略：入站 ' + zone.savedPolicy.input + '，出站 ' + zone.savedPolicy.output + '，转发 ' + zone.savedPolicy.forward">
                  <v-chip size="x-small" variant="tonal" :color="zone.savedPolicy.input === 'ACCEPT' ? 'success' : zone.savedPolicy.input === 'DROP' ? 'error' : 'warning'">入站 {{ zone.savedPolicy.input }}</v-chip>
                  <v-chip size="x-small" variant="tonal" :color="zone.savedPolicy.output === 'ACCEPT' ? 'success' : zone.savedPolicy.output === 'DROP' ? 'error' : 'warning'">出站 {{ zone.savedPolicy.output }}</v-chip>
                  <v-chip size="x-small" variant="tonal" :color="zone.savedPolicy.forward === 'ACCEPT' ? 'success' : zone.savedPolicy.forward === 'DROP' ? 'error' : 'warning'">转发 {{ zone.savedPolicy.forward }}</v-chip>
                </div>
                <small v-if="zone.input !== zone.savedPolicy.input || zone.output !== zone.savedPolicy.output || zone.forward !== zone.savedPolicy.forward" class="firewall-pending-label">有未保存的策略修改</small>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
          <v-row dense><v-col cols="12" sm="4"><v-select v-model="zone.input" label="入站 INPUT" :items="['ACCEPT','REJECT','DROP']" density="compact" variant="outlined"/></v-col><v-col cols="12" sm="4"><v-select v-model="zone.output" label="出站 OUTPUT" :items="['ACCEPT','REJECT','DROP']" density="compact" variant="outlined"/></v-col><v-col cols="12" sm="4"><v-select v-model="zone.forward" label="转发 FORWARD" :items="['ACCEPT','REJECT','DROP']" density="compact" variant="outlined"/></v-col></v-row>
          <v-switch density="compact" inset v-model="zone.masq" label="启用 IPv4 地址伪装（Masquerading）" color="primary" hide-details/><v-btn size="small" color="primary" variant="tonal" class="mt-2" :disabled="busy" @click="saveZone(zone)">保存区域策略</v-btn>
        </v-expansion-panel-text></v-expansion-panel></v-expansion-panels>
        <h3 class="router-app-section-title mt-4">端口转发</h3>
        <v-list v-if="fw.redirects.length" density="compact"><v-list-item v-for="x in fw.redirects" :key="x.section" :title="String(x.name || x.section)" :subtitle="String(x.src || 'wan') + ':' + String(x.src_dport || '--') + ' → ' + String(x.dest_ip || '--') + ':' + String(x.dest_port || x.src_dport || '--') + ' · ' + String(x.proto || 'tcp')"><template #append><v-btn icon="mdi-delete-outline" color="error" variant="text" size="small" aria-label="删除端口转发" @click="fwDelete=x;fwDeleteDialog=true"/></template></v-list-item></v-list>
        <v-alert v-else type="info" variant="tonal" density="compact">当前没有端口转发规则。</v-alert>
        <v-expansion-panels variant="accordion" class="mt-3"><v-expansion-panel><v-expansion-panel-title>添加端口转发</v-expansion-panel-title><v-expansion-panel-text>
          <v-text-field v-model="pf.name" label="规则名称" density="compact" variant="outlined"/><v-text-field v-model="pf.srcPort" label="WAN 外部端口" type="number" min="1" max="65535" density="compact" variant="outlined"/><v-text-field v-model="pf.destIp" label="LAN 目标 IPv4 地址" placeholder="192.168.100.10" density="compact" variant="outlined"/><v-text-field v-model="pf.destPort" label="LAN 目标端口（留空则与外部端口相同）" type="number" min="1" max="65535" density="compact" variant="outlined"/><v-select v-model="pf.proto" label="协议" :items="[{title:'TCP',value:'tcp'},{title:'UDP',value:'udp'},{title:'TCP + UDP',value:'tcp udp'}]" density="compact" variant="outlined"/><v-btn color="primary" variant="tonal" :disabled="busy" @click="addForward">添加并应用规则</v-btn>
        </v-expansion-panel-text></v-expansion-panel></v-expansion-panels>
        <div class="firewall-rule-toolbar mt-4">
          <div class="d-flex justify-space-between align-center ga-2">
            <h3 class="router-app-section-title ma-0">其他规则</h3>
            <span class="muted-hint">共 {{ fw.rules.length }} 条 · 已启用 {{ fwRuleEnabledCount }} 条</span>
          </div>
          <v-text-field v-model="fwRuleSearch" class="mt-3" label="搜索防火墙规则" aria-label="搜索防火墙规则"
            prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable hide-details/>
          <v-btn-toggle v-model="fwRuleFilter" mandatory density="comfortable" variant="outlined" color="primary" class="firewall-rule-filter mt-3">
            <v-btn value="all" :aria-label="'全部规则 ' + fw.rules.length">全部 {{ fw.rules.length }}</v-btn>
            <v-btn value="enabled" :aria-label="'已启用规则 ' + fwRuleEnabledCount">已启用 {{ fwRuleEnabledCount }}</v-btn>
            <v-btn value="disabled" :aria-label="'已停用规则 ' + (fw.rules.length - fwRuleEnabledCount)">已停用 {{ fw.rules.length - fwRuleEnabledCount }}</v-btn>
          </v-btn-toggle>
        </div>
        <div v-if="fwRulesShown.length" class="firewall-rule-table mt-3" role="list" aria-label="防火墙其他规则">
          <div v-for="rule in fwRulesShown" :key="rule.section + ':' + rule.enabled" class="firewall-rule-entry"
            :class="{ 'is-disabled': !rule.enabled }" role="listitem">
            <div class="firewall-rule-entry__head">
              <div class="firewall-rule-entry__name">
                <strong>{{ rule.name || rule.section }}</strong>
                <small>{{ rule.section }}</small>
              </div>
              <v-chip :color="fwRuleActionColor(String(rule.target || '').toUpperCase())" variant="tonal" size="small">
                {{ rule.target || '未指定动作' }}
              </v-chip>
              <div class="firewall-rule-entry__control">
                <v-switch :model-value="rule.enabled" :disabled="busy" color="primary"
                  hide-details density="compact" inset class="firewall-rule-entry__switch"
                  :aria-label="'启用规则 ' + (rule.name || rule.section)"
                  @update:model-value="requestFirewallRuleToggle(rule, $event)"/>
                <span class="firewall-rule-entry__state" :class="{ 'is-enabled': rule.enabled }">{{ rule.enabled ? '已启用' : '已停用' }}</span>
              </div>
            </div>
            <div class="firewall-rule-entry__fields">
              <div><span>来源区域</span><strong>{{ rule.src || '任意' }}</strong></div>
              <div><span>目标区域</span><strong>{{ rule.dest || '路由器本机' }}</strong></div>
              <div><span>协议</span><strong>{{ rule.proto || '任意' }}</strong></div>
              <div><span>目标端口</span><strong>{{ rule.dest_port || '不限' }}</strong></div>
              <div v-if="rule.src_ip"><span>源地址</span><strong>{{ rule.src_ip }}</strong></div>
              <div v-if="rule.dest_ip"><span>目标地址</span><strong>{{ rule.dest_ip }}</strong></div>
              <div v-if="rule.src_port"><span>源端口</span><strong>{{ rule.src_port }}</strong></div>
              <div v-if="rule.family"><span>地址族</span><strong>{{ rule.family }}</strong></div>
            </div>
            <div class="firewall-rule-entry__foot">
              <v-chip size="small" variant="tonal" :color="rule.enabled ? 'success' : 'secondary'"
                :aria-label="'规则状态：' + (rule.enabled ? '已启用' : '已停用')">
                <v-icon start :icon="rule.enabled ? 'mdi-check-circle-outline' : 'mdi-pause-circle-outline'" size="small"/>
                {{ rule.enabled ? '已启用' : '已停用' }}
              </v-chip>
              <span v-if="rule.comment">{{ rule.comment }}</span>
            </div>
          </div>
        </div>
        <v-alert v-else type="info" variant="tonal" density="compact" class="mt-3">
          {{ fw.rules.length ? '没有符合筛选条件的防火墙规则。' : '当前没有普通防火墙规则。' }}
        </v-alert>
        <v-btn class="mt-3" variant="outlined" :disabled="busy" @click="run(reloadFirewall,'防火墙已重载')">重载防火墙</v-btn><p class="muted-hint mt-2">修改区域策略或端口转发会提交 UCI 并重载防火墙。请谨慎修改 WAN 区域 INPUT / FORWARD，错误配置可能导致远程管理中断。</p>
      </template>
      <v-dialog v-model="fwRuleConfirm" max-width="420">
        <v-card rounded="xl">
          <v-card-title>{{ fwRulePendingEnabled ? '启用' : '停用' }}防火墙规则？</v-card-title>
          <v-card-text>
            将{{ fwRulePendingEnabled ? '启用' : '停用' }}“{{ fwRulePending?.name || fwRulePending?.section }}”并重载防火墙。
            修改可能影响远程管理、网络访问或已有连接。
          </v-card-text>
          <v-card-actions><v-spacer/>
            <v-btn variant="text" @click="fwRuleConfirm = false; fwRulePending = null">取消</v-btn>
            <v-btn color="primary" :disabled="busy" @click="confirmFirewallRuleToggle">确认应用</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <v-dialog v-model="fwDeleteDialog" max-width="400"><v-card rounded="xl"><v-card-title>删除端口转发规则？</v-card-title><v-card-text>将删除 {{ fwDelete?.name || fwDelete?.section }} 并重载防火墙。</v-card-text><v-card-actions><v-spacer/><v-btn variant="text" @click="fwDeleteDialog=false">取消</v-btn><v-btn color="error" @click="deleteForward">删除</v-btn></v-card-actions></v-card></v-dialog>
    </template>
    </template>
  </div>
</template>
