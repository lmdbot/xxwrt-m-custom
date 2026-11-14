<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { shortError } from '../services/router.js'

const props = defineProps({ client: { type: Object, required: true }, kind: { type: String, required: true } })
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref('')
const ssr = ref({ available: false, section: '', global: {}, nodes: [], service: null })
const ssrNode = ref('nil')
const wechat = ref({ available: false, section: '', service: null })
const wechatForm = reactive({ enable: '0', jsonpath: '', sleeptime: '60', sckey: '', pushplus_token: '', wxpusher_apptoken: '', wxpusher_uids: '', wpush_apikey: '', tg_token: '', tg_chat_id: '', corpid: '', userid: '', agentid: '', corpsecret: '' })
const openclash = ref({ available: false, section: '', config: {}, service: null })
const oc = reactive({ enable: '0', en_mode: 'fake-ip', proxy_mode: 'rule', ipv6_enable: '0', enable_udp_proxy: '1', router_self_proxy: '1' })
const detector = ref({ available: false, instances: [], service: null })
const carbon = ref({ available: false, section: '', current: '', themes: [], updater: null })
const carbonMirror = ref('')
const zt = ref({ available: false, section: '', networks: [], service: null, runtime: [] })
const ztEnabled = ref(false), ztNewId = ref(''), ztDelete = ref(null), ztDeleteDialog = ref(false)
const fw = ref({ available: false, zones: [], redirects: [], rules: [], service: null })
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
  { title: 'Telegram', value: '/usr/share/wechatpush/api/telegram.json' }
]
const providerFields = computed(() => ({
  '/usr/share/wechatpush/api/serverchan.json': ['sckey'],
  '/usr/share/wechatpush/api/serverchan3.json': ['sc3key', 'sc3uid'],
  '/usr/share/wechatpush/api/qywx_markdown.json': ['corpid', 'userid', 'agentid', 'corpsecret'],
  '/usr/share/wechatpush/api/wxpusher.json': ['wxpusher_apptoken', 'wxpusher_uids'],
  '/usr/share/wechatpush/api/pushplus.json': ['pushplus_token'],
  '/usr/share/wechatpush/api/wpush.json': ['wpush_apikey'],
  '/usr/share/wechatpush/api/telegram.json': ['tg_token', 'tg_chat_id']
}[wechatForm.jsonpath] || []))
const providerLabels = {
  sckey: 'Server酱 SendKey', sc3key: 'Server酱 3 SendKey', sc3uid: 'Server酱 3 UID',
  corpid: '企业 ID', userid: '接收用户（@all 表示全部）', agentid: '应用 AgentID', corpsecret: '企业微信 Secret',
  wxpusher_apptoken: 'WxPusher AppToken', wxpusher_uids: 'WxPusher 用户 UID',
  pushplus_token: 'PushPlus Token', wpush_apikey: 'WPUSH API Key', tg_token: 'Telegram Bot Token', tg_chat_id: 'Telegram Chat ID'
}
const secretKey = key => /key|token|secret/i.test(key)
const statusText = item => !item ? '状态未知' : item.running ? '运行中' : item.enabled ? '已启用，未运行' : '未运行'

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
  const [cfg, rc] = await Promise.all([getUci('shadowsocksr'), services()])
  const list = sections(cfg), global = sectionOf(list, 'global', 'global')
  ssr.value = {
    available: !!cfg?.values && !!global, section: global?.id || '', global: global?.options || {},
    nodes: list.filter(x => x.type === 'servers').map(x => ({
      id: x.id, title: String(x.options.alias || x.options.remarks || x.options.server || x.id),
      detail: [x.options.type, x.options.server, x.options.server_port].filter(Boolean).join(' · ')
    })),
    service: rc?.shadowsocksr || null
  }
  ssrNode.value = String(global?.options.global_server || 'nil')
}
async function applySsrNode() {
  await run(async () => {
    if (!ssr.value.available) throw new Error('未检测到 ShadowSocksR Plus+ 配置')
    if (ssrNode.value !== 'nil' && !ssr.value.nodes.some(x => x.id === ssrNode.value)) throw new Error('所选节点不存在')
    await setUci('shadowsocksr', ssr.value.section, { global_server: ssrNode.value })
    await service('ssr')
  }, '节点已切换，ShadowSocksR Plus+ 已重启')
}

async function loadWechat() {
  const [cfg, rc, detail] = await Promise.all([
    getUci('wechatpush'), services(), props.client.call('service', 'list', { name: 'wechatpush' }, true)
  ])
  const section = sectionOf(sections(cfg), 'config', 'wechatpush'), o = section?.options || {}
  wechat.value = {
    available: !!section, section: section?.id || '',
    service: { ...(rc?.wechatpush || {}), running: !!detail?.wechatpush?.instances?.instance1?.running || !!rc?.wechatpush?.running }
  }
  for (const key of Object.keys(wechatForm)) wechatForm[key] = String(o[key] ?? (key === 'sleeptime' ? '60' : ''))
}
async function saveWechat() {
  await run(async () => {
    if (!wechat.value.available) throw new Error('未检测到 /etc/config/wechatpush')
    const values = { enable: wechatForm.enable, jsonpath: wechatForm.jsonpath, sleeptime: wechatForm.sleeptime }
    for (const key of providerFields.value) values[key] = wechatForm[key] || ''
    await setUci('wechatpush', wechat.value.section, values)
    await service('wechat')
  }, '微信推送配置已保存，服务已重启')
}
async function testWechat() {
  await run(async () => {
    const result = await command('/bin/bash', ['/usr/share/wechatpush/wechatpush', 't1'])
    notice.value = String(result.stdout || '').trim().slice(0, 260) || '测试推送命令已执行，请检查手机是否收到消息'
  }, '', false)
}

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
async function checkCarbon() {
  await run(async () => {
    const r = await props.client.call('luci.carbon_update', 'check', {}, true)
    if (!r) throw new Error('Carbon 更新器 RPC 不可用，请检查主题版本和 ACL')
  }, '已提交 Carbon 更新检查')
}
async function saveCarbonMirror() {
  await run(async () => {
    const r = await props.client.call('luci.carbon_update', 'configure', { mirror: carbonMirror.value.trim() }, true)
    if (!r || r.error) throw new Error(r?.error || 'Carbon 更新器不支持镜像设置')
  }, 'Carbon 下载镜像已保存')
}
async function upgradeCarbon() {
  carbonUpgradeDialog.value = false
  await run(async () => {
    const version = String(carbon.value.updater?.latest || '')
    if (!version || !carbon.value.updater?.can_upgrade) throw new Error('当前没有可安装的已验证更新')
    const r = await props.client.call('luci.carbon_update', 'upgrade', { version }, true)
    if (!r || r.error) throw new Error(r?.error || 'Carbon 更新请求失败')
  }, '已启动 Carbon 更新，请等待路由器完成安装')
}

function parseZt(stdout) {
  return String(stdout || '').split(/\r?\n/).filter(Boolean).slice(1).map(line => {
    const p = line.trim().split(/\s+/)
    return { id: p[0] || '', name: p[1] || '', status: p[3] || '', addresses: p.slice(6).join(' ') }
  }).filter(x => /^[a-f0-9]{16}$/i.test(x.id))
}
async function loadZeroTier() {
  const [cfg, rc] = await Promise.all([getUci('zerotier'), services()])
  const list = sections(cfg), global = sectionOf(list, 'global', 'zerotier')
  let runtime = []
  try { runtime = parseZt((await command('/usr/bin/zerotier-cli', ['listnetworks'])).stdout) } catch (_) {}
  zt.value = {
    available: !!global, section: global?.id || '',
    networks: list.filter(x => x.type === 'network').map(x => ({
      section: x.id, id: String(x.options.id || ''), enabled: String(x.options.enabled ?? '1') !== '0'
    })),
    service: rc?.zerotier || null, runtime
  }
  ztEnabled.value = String(global?.options.enabled || '0') === '1'
}
async function saveZt() {
  await run(async () => {
    if (!zt.value.section) throw new Error('未检测到 ZeroTier 全局配置')
    await setUci('zerotier', zt.value.section, { enabled: ztEnabled.value ? '1' : '0' })
    await service('zerotier')
  }, 'ZeroTier 全局配置已保存，服务已重启')
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

async function loadFirewall() {
  const [cfg, rc] = await Promise.all([getUci('firewall'), services()])
  const list = sections(cfg)
  fw.value = {
    available: !!cfg?.values,
    zones: list.filter(x => x.type === 'zone').map(x => ({
      section: x.id, name: String(x.options.name || x.id),
      input: String(x.options.input || 'REJECT').toUpperCase(),
      output: String(x.options.output || 'ACCEPT').toUpperCase(),
      forward: String(x.options.forward || 'REJECT').toUpperCase(),
      masq: String(x.options.masq || '0') === '1',
      network: Array.isArray(x.options.network) ? x.options.network.join(', ') : String(x.options.network || '')
    })),
    redirects: list.filter(x => x.type === 'redirect').map(x => ({ section: x.id, ...x.options })),
    rules: list.filter(x => x.type === 'rule').map(x => ({ section: x.id, ...x.options })),
    service: rc?.firewall || null
  }
}
async function reloadFirewall() { await service('firewall', 'reload') }
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
  loading.value = true; error.value = ''; notice.value = ''
  try {
    if (props.kind === 'ssr') await loadSsr()
    else if (props.kind === 'wechatpush') await loadWechat()
    else if (props.kind === 'openclash') await loadOpenClash()
    else if (props.kind === 'detector') await loadDetector()
    else if (props.kind === 'carbon') await loadCarbon()
    else if (props.kind === 'zerotier') await loadZeroTier()
    else if (props.kind === 'firewall') await loadFirewall()
    else throw new Error('未知应用模块')
  } catch (e) { error.value = shortError(e) }
  finally { loading.value = false }
}
watch(() => props.kind, () => { void refresh() })
onMounted(() => { void refresh() })
defineExpose({ refresh })
</script>

<template>
  <div class="router-app-panel">
    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{ error }}</v-alert>
    <v-alert v-if="notice" type="success" variant="tonal" density="compact" class="mb-3">{{ notice }}</v-alert>
    <v-progress-linear v-if="loading || busy" indeterminate color="primary" class="mb-3"/>
    <template v-if="kind === 'ssr'">
      <v-alert v-if="!ssr.available" type="warning" variant="tonal">未检测到 ShadowSocksR Plus+ 配置，或当前 RPC 账号无权读取 shadowsocksr。</v-alert>
      <template v-else>
        <div class="router-app-summary"><div><span>服务状态</span><strong>{{ statusText(ssr.service) }}</strong></div><div><span>运行模式</span><strong>{{ ssr.global.run_mode || '--' }}</strong></div><div><span>节点数量</span><strong>{{ ssr.nodes.length }}</strong></div></div>
        <v-select v-model="ssrNode" label="当前节点" density="comfortable" variant="outlined" :items="[{title:'停用透明代理',value:'nil'}, ...ssr.nodes.map(x => ({title:x.title + (x.detail ? ' · ' + x.detail : ''),value:x.id}))]"/>
        <div class="d-flex flex-wrap ga-2">
          <v-btn color="primary" variant="tonal" :disabled="busy" @click="applySsrNode">应用节点并重启</v-btn>
          <v-btn variant="outlined" :disabled="busy" @click="run(() => service('ssr','start'),'ShadowSocksR Plus+ 已启动')">启动</v-btn>
          <v-btn variant="outlined" :disabled="busy" @click="run(() => service('ssr','stop'),'ShadowSocksR Plus+ 已停止')">停止</v-btn>
          <v-btn variant="outlined" :disabled="busy" @click="run(() => service('ssr','restart'),'ShadowSocksR Plus+ 已重启')">重启</v-btn>
        </div>
        <v-list v-if="ssr.nodes.length" density="compact" class="mt-3"><v-list-item v-for="x in ssr.nodes" :key="x.id" :title="x.title" :subtitle="x.detail || x.id"><template #append><v-chip size="x-small" variant="tonal" :color="x.id === ssr.global.global_server ? 'success' : 'default'">{{ x.id === ssr.global.global_server ? '当前节点' : '备用节点' }}</v-chip></template></v-list-item></v-list>
        <v-alert v-else type="info" variant="tonal" density="compact" class="mt-3">尚未配置代理节点，请先添加节点或订阅。</v-alert>
      </template>
    </template>
    <template v-else-if="kind === 'wechatpush'">
      <v-alert v-if="!wechat.available" type="warning" variant="tonal">未检测到 /etc/config/wechatpush，请先安装 luci-app-wechatpush。</v-alert>
      <template v-else>
        <div class="router-app-summary"><div><span>服务状态</span><strong>{{ statusText(wechat.service) }}</strong></div><div><span>推送功能</span><strong>{{ wechatForm.enable === '1' ? '已启用' : '未启用' }}</strong></div></div>
        <v-switch :model-value="wechatForm.enable === '1'" label="启用微信推送" color="primary" hide-details @update:model-value="wechatForm.enable = $event ? '1' : '0'"/>
        <v-select v-model="wechatForm.jsonpath" label="推送渠道" :items="providers" item-title="title" item-value="value" density="comfortable" variant="outlined" class="mt-3"/>
        <v-text-field v-model="wechatForm.sleeptime" label="检测间隔（秒）" type="number" min="10" density="comfortable" variant="outlined"/>
        <v-text-field v-for="key in providerFields" :key="key" v-model="wechatForm[key]" :label="providerLabels[key]" :type="secretKey(key) ? 'password' : 'text'" autocomplete="off" density="comfortable" variant="outlined"/>
        <div class="d-flex flex-wrap ga-2"><v-btn color="primary" variant="tonal" :disabled="busy" @click="saveWechat">保存配置并重启</v-btn><v-btn variant="outlined" :disabled="busy || wechatForm.enable !== '1'" @click="testWechat">发送测试推送</v-btn></div>
        <p class="muted-hint mt-2">凭据通过路由器 UCI 接口写入。测试推送会真实发送一条测试消息。</p>
      </template>
    </template>
    <template v-else-if="kind === 'openclash'">
      <v-alert v-if="!openclash.available" type="warning" variant="tonal">未检测到 /etc/config/openclash，请先安装 OpenClash。</v-alert>
      <template v-else>
        <div class="router-app-summary"><div><span>服务状态</span><strong>{{ statusText(openclash.service) }}</strong></div><div><span>插件开关</span><strong>{{ oc.enable === '1' ? '已启用' : '未启用' }}</strong></div><div><span>代理模式</span><strong>{{ oc.proxy_mode }}</strong></div></div>
        <v-switch :model-value="oc.enable === '1'" label="启用 OpenClash" color="primary" hide-details @update:model-value="oc.enable = $event ? '1' : '0'"/>
        <v-select v-model="oc.en_mode" label="运行模式" density="comfortable" variant="outlined" class="mt-3" :items="['fake-ip','fake-ip-tun','fake-ip-mix','redir-host','redir-host-tun','redir-host-mix']"/>
        <v-select v-model="oc.proxy_mode" label="代理模式" density="comfortable" variant="outlined" :items="[{title:'规则模式',value:'rule'},{title:'全局模式',value:'global'},{title:'直连模式',value:'direct'}]"/>
        <v-switch :model-value="oc.ipv6_enable === '1'" label="IPv6 代理" color="primary" hide-details @update:model-value="oc.ipv6_enable = $event ? '1' : '0'"/>
        <v-switch :model-value="oc.enable_udp_proxy === '1'" label="UDP 代理" color="primary" hide-details @update:model-value="oc.enable_udp_proxy = $event ? '1' : '0'"/>
        <v-switch :model-value="oc.router_self_proxy === '1'" label="路由器自身流量代理" color="primary" hide-details @update:model-value="oc.router_self_proxy = $event ? '1' : '0'"/>
        <div class="d-flex flex-wrap ga-2 mt-3"><v-btn color="primary" variant="tonal" :disabled="busy" @click="saveOpenClash">保存配置并重启</v-btn><v-btn variant="outlined" :disabled="busy" @click="run(() => service('openclash','start'),'OpenClash 已启动')">启动</v-btn><v-btn variant="outlined" :disabled="busy" @click="run(() => service('openclash','stop'),'OpenClash 已停止')">停止</v-btn><v-btn variant="outlined" :disabled="busy" @click="run(() => service('openclash','restart'),'OpenClash 已重启')">重启</v-btn></div>
        <p class="muted-hint mt-2">这里只修改 OpenClash 全局 UCI 选项，不改写 YAML 订阅、节点、规则集和自定义覆写。</p>
      </template>
    </template>
    <template v-else-if="kind === 'detector'">
      <div class="router-app-summary"><div><span>监测接口</span><strong>{{ detector.available ? '可用' : '不可用' }}</strong></div><div><span>监测项目</span><strong>{{ detector.instances.length }}</strong></div><div><span>服务状态</span><strong>{{ statusText(detector.service) }}</strong></div></div>
      <v-alert v-if="!detector.available" type="warning" variant="tonal">无法读取 luci.internet-detector.UIPoll，请检查插件和 RPC 权限。</v-alert>
      <v-list v-else density="compact"><v-list-item v-for="x in detector.instances" :key="x.id" :title="x.name" :subtitle="x.id"><template #append><v-chip size="small" variant="tonal" :color="x.state === 'up' ? 'success' : x.state === 'pending' ? 'warning' : 'error'">{{ x.state === 'up' ? '连接正常' : x.state === 'pending' ? '检测中' : '连接异常' }}</v-chip></template></v-list-item></v-list>
      <div class="d-flex flex-wrap ga-2 mt-3"><v-btn color="primary" variant="tonal" :disabled="loading" @click="refresh">刷新监测结果</v-btn><v-btn v-if="detector.service" variant="outlined" :disabled="busy" @click="run(() => service('detector'),'Internet Detector 已重启')">重启监测服务</v-btn></div>
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
        <div class="d-flex flex-wrap ga-2"><v-btn variant="outlined" :disabled="busy || !carbon.updater" @click="saveCarbonMirror">保存镜像</v-btn><v-btn color="primary" variant="tonal" :disabled="busy || !carbon.updater" @click="checkCarbon">检查更新</v-btn><v-btn color="success" variant="tonal" :disabled="busy || !carbon.updater?.can_upgrade" @click="carbonUpgradeDialog = true">安装已验证更新</v-btn></div>
        <v-alert v-if="carbon.updater?.reason" type="info" variant="tonal" density="compact" class="mt-3">{{ carbon.updater.reason }}</v-alert>
        <v-alert v-if="carbon.updater?.state && carbon.updater.state !== 'idle'" type="info" variant="tonal" density="compact" class="mt-3">更新状态：{{ carbon.updater.state }} {{ carbon.updater.error || '' }}</v-alert>
      </template>
      <v-dialog v-model="carbonUpgradeDialog" max-width="420"><v-card rounded="xl"><v-card-title>确认更新 Carbon 主题</v-card-title><v-card-text>将通过 Carbon 官方更新器安装已校验版本 {{ carbon.updater?.latest }}。</v-card-text><v-card-actions><v-spacer/><v-btn variant="text" @click="carbonUpgradeDialog = false">取消</v-btn><v-btn color="primary" @click="upgradeCarbon">确认更新</v-btn></v-card-actions></v-card></v-dialog>
    </template>
    <template v-else-if="kind === 'zerotier'">
      <v-alert v-if="!zt.available" type="warning" variant="tonal">未检测到 ZeroTier 配置，请先安装 zerotier 并初始化 /etc/config/zerotier。</v-alert>
      <template v-else>
        <div class="router-app-summary"><div><span>服务状态</span><strong>{{ statusText(zt.service) }}</strong></div><div><span>全局开关</span><strong>{{ ztEnabled ? '已启用' : '未启用' }}</strong></div><div><span>网络数量</span><strong>{{ zt.networks.length }}</strong></div></div>
        <v-switch v-model="ztEnabled" label="启用 ZeroTier" color="primary" hide-details/><v-btn color="primary" variant="tonal" class="mt-2" :disabled="busy" @click="saveZt">保存并重启服务</v-btn>
        <h3 class="router-app-section-title mt-4">已加入的网络</h3>
        <v-list v-if="zt.networks.length" density="compact"><v-list-item v-for="x in zt.networks" :key="x.section" :title="x.id" :subtitle="x.section"><template #append><v-switch :model-value="x.enabled" density="compact" color="primary" hide-details :disabled="busy" @update:model-value="toggleZt(x,$event)"/><v-btn icon="mdi-delete-outline" color="error" variant="text" size="small" aria-label="删除 ZeroTier 网络" @click="ztDelete=x;ztDeleteDialog=true"/></template></v-list-item></v-list>
        <v-alert v-else type="info" variant="tonal" density="compact">尚未配置 ZeroTier 网络。</v-alert>
        <v-alert v-if="zt.runtime.length" type="success" variant="tonal" density="compact" class="mt-2"><div v-for="x in zt.runtime" :key="x.id" class="zt-runtime-row"><strong>{{ x.id }}</strong><span>{{ x.status }}</span><small>{{ x.addresses }}</small></div></v-alert>
        <h3 class="router-app-section-title mt-4">加入新网络</h3><v-text-field v-model.trim="ztNewId" label="Network ID" placeholder="16 位十六进制字符" density="comfortable" variant="outlined" maxlength="16"/><v-btn color="primary" variant="tonal" :disabled="busy" @click="addZt">加入网络并重启服务</v-btn>
        <p class="muted-hint mt-2">加入后仍需在 ZeroTier Central 中授权此设备。默认启用 allowManaged，关闭 allowDefault 和 allowDNS。</p>
      </template>
      <v-dialog v-model="ztDeleteDialog" max-width="400"><v-card rounded="xl"><v-card-title>删除 ZeroTier 网络？</v-card-title><v-card-text>将移除网络 {{ ztDelete?.id }} 并重启服务。</v-card-text><v-card-actions><v-spacer/><v-btn variant="text" @click="ztDeleteDialog=false">取消</v-btn><v-btn color="error" @click="deleteZt">删除</v-btn></v-card-actions></v-card></v-dialog>
    </template>
    <template v-else-if="kind === 'firewall'">
      <v-alert v-if="!fw.available" type="warning" variant="tonal">无法读取 /etc/config/firewall，请检查 UCI 读取权限。</v-alert>
      <template v-else>
        <div class="router-app-summary"><div><span>服务状态</span><strong>{{ statusText(fw.service) }}</strong></div><div><span>防火墙区域</span><strong>{{ fw.zones.length }}</strong></div><div><span>端口转发</span><strong>{{ fw.redirects.length }}</strong></div></div>
        <h3 class="router-app-section-title">区域策略</h3>
        <v-expansion-panels variant="accordion"><v-expansion-panel v-for="zone in fw.zones" :key="zone.section"><v-expansion-panel-title><div class="firewall-zone-title"><strong>{{ zone.name }}</strong><small>{{ zone.network || '未绑定网络' }}</small></div></v-expansion-panel-title><v-expansion-panel-text>
          <v-row dense><v-col cols="12" sm="4"><v-select v-model="zone.input" label="入站 INPUT" :items="['ACCEPT','REJECT','DROP']" density="compact" variant="outlined"/></v-col><v-col cols="12" sm="4"><v-select v-model="zone.output" label="出站 OUTPUT" :items="['ACCEPT','REJECT','DROP']" density="compact" variant="outlined"/></v-col><v-col cols="12" sm="4"><v-select v-model="zone.forward" label="转发 FORWARD" :items="['ACCEPT','REJECT','DROP']" density="compact" variant="outlined"/></v-col></v-row>
          <v-switch v-model="zone.masq" label="启用 IPv4 地址伪装（Masquerading）" color="primary" hide-details/><v-btn size="small" color="primary" variant="tonal" class="mt-2" :disabled="busy" @click="saveZone(zone)">保存区域策略</v-btn>
        </v-expansion-panel-text></v-expansion-panel></v-expansion-panels>
        <h3 class="router-app-section-title mt-4">端口转发</h3>
        <v-list v-if="fw.redirects.length" density="compact"><v-list-item v-for="x in fw.redirects" :key="x.section" :title="String(x.name || x.section)" :subtitle="String(x.src || 'wan') + ':' + String(x.src_dport || '--') + ' → ' + String(x.dest_ip || '--') + ':' + String(x.dest_port || x.src_dport || '--') + ' · ' + String(x.proto || 'tcp')"><template #append><v-btn icon="mdi-delete-outline" color="error" variant="text" size="small" aria-label="删除端口转发" @click="fwDelete=x;fwDeleteDialog=true"/></template></v-list-item></v-list>
        <v-alert v-else type="info" variant="tonal" density="compact">当前没有端口转发规则。</v-alert>
        <v-expansion-panels variant="accordion" class="mt-3"><v-expansion-panel><v-expansion-panel-title>添加端口转发</v-expansion-panel-title><v-expansion-panel-text>
          <v-text-field v-model="pf.name" label="规则名称" density="compact" variant="outlined"/><v-text-field v-model="pf.srcPort" label="WAN 外部端口" type="number" min="1" max="65535" density="compact" variant="outlined"/><v-text-field v-model="pf.destIp" label="LAN 目标 IPv4 地址" placeholder="192.168.100.10" density="compact" variant="outlined"/><v-text-field v-model="pf.destPort" label="LAN 目标端口（留空则与外部端口相同）" type="number" min="1" max="65535" density="compact" variant="outlined"/><v-select v-model="pf.proto" label="协议" :items="[{title:'TCP',value:'tcp'},{title:'UDP',value:'udp'},{title:'TCP + UDP',value:'tcp udp'}]" density="compact" variant="outlined"/><v-btn color="primary" variant="tonal" :disabled="busy" @click="addForward">添加并应用规则</v-btn>
        </v-expansion-panel-text></v-expansion-panel></v-expansion-panels>
        <h3 class="router-app-section-title mt-4">其他规则</h3><v-list v-if="fw.rules.length" density="compact"><v-list-item v-for="x in fw.rules" :key="x.section" :title="String(x.name || x.section)" :subtitle="[x.src,x.dest,x.proto,x.dest_port,x.target].filter(Boolean).join(' · ')"/></v-list><p v-else class="muted-hint">当前没有普通防火墙规则。</p>
        <v-btn class="mt-3" variant="outlined" :disabled="busy" @click="run(reloadFirewall,'防火墙已重载')">重载防火墙</v-btn><p class="muted-hint mt-2">修改区域策略或端口转发会提交 UCI 并重载防火墙。请谨慎修改 WAN 区域 INPUT / FORWARD，错误配置可能导致远程管理中断。</p>
      </template>
      <v-dialog v-model="fwDeleteDialog" max-width="400"><v-card rounded="xl"><v-card-title>删除端口转发规则？</v-card-title><v-card-text>将删除 {{ fwDelete?.name || fwDelete?.section }} 并重载防火墙。</v-card-text><v-card-actions><v-spacer/><v-btn variant="text" @click="fwDeleteDialog=false">取消</v-btn><v-btn color="error" @click="deleteForward">删除</v-btn></v-card-actions></v-card></v-dialog>
    </template>
  </div>
</template>
