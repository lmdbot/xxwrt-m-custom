<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { useTheme } from 'vuetify'
import { VGlass } from '@daisigu/vue-liquid-glass'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import AppFilterPanel from './components/AppFilterPanel.vue'
import {
  loadDevices, saveDevices, newDevice, probeDevice,
  storeDevicePassword, fetchDevicePassword, deleteDevicePassword
} from './services/devices.js'
import {
  RouterClient, readDashboard, readClients, readServices,
  readProcessList, readRouteConfig, readWolDevices, wakeWolDevice,
  saveWolTarget, removeWolTarget, readParentalSettings, saveParentalBase,
  readRuntimeRoutes, readNetworkHardware, shortError
} from './services/router.js'

const theme = useTheme()
const pages = [
  { id: 'home', label: '首页', icon: 'mdi-home-outline' },
  { id: 'statistics', label: '统计', icon: 'mdi-chart-box-outline' },
  { id: 'clients', label: '终端', icon: 'mdi-devices' },
  { id: 'network', label: '网络', icon: 'mdi-lan' },
  { id: 'apps', label: '应用', icon: 'mdi-apps' }
]
const storage = {
  host: 'xxwrt_material_router_url',
  nav: 'xxwrt_material_nav_style',
  theme: 'xxwrt_material_color_mode'
}
const devices = ref(loadDevices())
const viewMode = ref('list')
const selectedDeviceId = ref('')
const loginDialog = ref(false)
const deviceDialog = ref(false)
const editDeviceId = ref('')
const deleteDialog = ref(false)
const deleteDeviceId = ref('')
const loginRemember = ref(true)
const isNative = Capacitor.isNativePlatform()
const listError = ref('')
const deviceStatuses = reactive({})
const deviceSummaries = reactive({})
const deviceForm = reactive({ name: '', address: 'http://192.168.100.1', username: 'root' })
const sessions = new Map()
const selectedDevice = computed(() => devices.value.find(d => d.id === selectedDeviceId.value) || null)
const probeBusy = ref(false)
const form = reactive({
  address: localStorage.getItem(storage.host) || 'http://192.168.100.1',
  username: 'root',
  password: '',
  showPassword: false
})
const navStyle = ref(localStorage.getItem(storage.nav) === 'liquid' ? 'liquid' : 'standard')
const drawerOpen = ref(false)
const drawerSection = ref('appearance')
const clientSearch = ref('')
const filteredClients = computed(() => {
  const term = clientSearch.value.trim().toLowerCase()
  if (!term) return clientData.value.data
  return clientData.value.data.filter(item =>
    [item.name, item.ip, item.mac].some(value => String(value || '').toLowerCase().includes(term)))
})
const colorMode = ref(localStorage.getItem(storage.theme) || 'system')
const activeTab = ref('home')
const systemDark = ref(false)
const dark = computed(() => colorMode.value === 'dark' || (colorMode.value === 'system' && systemDark.value))
const pageTitle = computed(() => pages.find(page => page.id === activeTab.value)?.label || '首页')
const client = shallowRef(null)
const connected = ref(false)
const connecting = ref(false)
const refreshing = ref(false)
const errorMessage = ref('')
const lastUpdated = ref('')
const snapshot = ref(null)
const clientData = ref({ data: [], ipv6: [], leasesAvailable: false })
const serviceData = ref({ services: [], available: false })
const confirmReboot = ref(false)
const factoryDialog = ref(false)
const factoryPhrase = ref('')
const factoryBusy = ref(false)
const factoryError = ref('')
const actionBusy = ref(false)
const selectedClient = ref(null)
const toolPanel = ref('')
const toolLoading = ref(false)
const toolMessage = ref('')
const processData = ref({ available: false, processes: [] })
const routeData = ref({ available: false, routes: [] })
const liveRoutes = ref({ available: false, lines: [] })
const wolData = ref({ available: false, tool: '', targets: [], interfaces: [], known: [] })
const wolForm = reactive({ name: '', mac: '', iface: '', broadcast: false })
const wolBusy = ref(false)
const wolDeleteDialog = ref(false)
const wolDeleteTarget = ref(null)
const parentalData = ref({ available: false, base: {}, status: {}, advanced: {}, selectedRules: [], users: [] })
const parentalForm = reactive({ enable: false, record_enable: false, work_mode: 0 })
const parentalSaving = ref(false)
const networkHardware = ref({ wiredAvailable: false, wirelessAvailable: false, wired: [], wireless: [] })
const legacyTools = [
  { id: 'process', title: '进程管理', subtitle: '只读进程列表', icon: 'mdi-format-list-bulleted' },
  { id: 'startup', title: '启动项', subtitle: '服务及自启动状态', icon: 'mdi-power' },
  { id: 'routes', title: '静态路由', subtitle: '查看 network 配置', icon: 'mdi-routes' },
  { id: 'wol', title: '网络唤醒', subtitle: 'RPC 唤醒及目标管理', icon: 'mdi-power-plug' },
  { id: 'parental', title: '家长控制', subtitle: 'RPC 规则、时间及高级设置', icon: 'mdi-account-child' },
  { id: 'reset', title: '恢复出厂', subtitle: '原版命令及强制二次确认', icon: 'mdi-restore' }
]
const onlineCount = computed(() => snapshot.value?.checks.filter(check => check.state === 'up').length || 0)
const allChecks = computed(() => snapshot.value?.checks || [])
const resourceCards = computed(() => {
  const snap = snapshot.value || {}
  return [
    { label: 'CPU 占用', value: snap.cpuPercent == null ? '--' : snap.cpuPercent + '%', detail: '负载 ' + (snap.load || '--'), icon: 'mdi-chip', progress: snap.cpuPercent || 0 },
    { label: '内存占用', value: snap.memoryPercent == null ? '--' : snap.memoryPercent + '%', detail: snap.memoryDetail || '--', icon: 'mdi-memory', progress: snap.memoryPercent || 0 },
    { label: '内存缓存', value: snap.cachePercent == null ? '--' : snap.cachePercent + '%', detail: snap.cacheDetail || '--', icon: 'mdi-chart-timeline-variant', progress: snap.cachePercent || 0 },
    { label: '连接数', value: snap.connPercent == null ? '--' : snap.connPercent + '%', detail: snap.connDetail || '--', icon: 'mdi-lan-connect', progress: snap.connPercent || 0 }
  ]
})
let mediaQuery, systemListener, refreshTimer, probeTimer

watch(navStyle, v => localStorage.setItem(storage.nav, v))
watch(colorMode, v => localStorage.setItem(storage.theme, v))
watch(dark, v => { theme.global.name.value = v ? 'dark' : 'light' }, { immediate: true })
watch(activeTab, () => { if (connected.value) refreshCurrent() })

function resetSession() {
  const oldId = selectedDeviceId.value
  if (oldId && sessions.has(oldId)) {
    sessions.get(oldId).logout()
    sessions.delete(oldId)
  }
  client.value?.logout()
  client.value = null
  connected.value = false
  snapshot.value = null
  clientData.value = { data: [], ipv6: [], leasesAvailable: false }
  selectedClient.value = null
  toolPanel.value = ''
  toolMessage.value = ''
  serviceData.value = { services: [], available: false }
  form.password = ''
  errorMessage.value = ''
  activeTab.value = 'home'
  viewMode.value = 'list'
  selectedDeviceId.value = ''
  loginDialog.value = false
  drawerOpen.value = false
  void refreshDeviceStatuses()
}

function showDeviceDialog(device = null) {
  listError.value = ''
  editDeviceId.value = device?.id || ''
  Object.assign(deviceForm, device ? {
    name: device.name, address: device.address, username: device.username
  } : { name: '', address: 'http://192.168.100.1', username: 'root' })
  deviceDialog.value = true
}

async function saveDeviceEntry() {
  listError.value = ''
  try {
    const candidate = newDevice(deviceForm) // validates name, address, username
    if (editDeviceId.value) {
      const before = devices.value.find(d => d.id === editDeviceId.value)
      if (!before) throw new Error('未找到需要编辑的路由器')
      const changed = before.address !== candidate.address || before.username !== candidate.username
      devices.value = devices.value.map(d => d.id === before.id
        ? { ...d, name: candidate.name, address: candidate.address, username: candidate.username,
            rememberPassword: changed ? false : d.rememberPassword }
        : d)
      if (changed) {
        sessions.get(before.id)?.logout()
        sessions.delete(before.id)
        delete deviceSummaries[before.id]
        await deleteDevicePassword(before.id)
      }
    } else {
      if (devices.value.some(d => d.address === candidate.address && d.username === candidate.username)) {
        throw new Error('同一地址及用户名的路由器已经添加')
      }
      devices.value = [...devices.value, candidate]
    }
    devices.value = saveDevices(devices.value)
    deviceDialog.value = false
    editDeviceId.value = ''
    await refreshDeviceStatuses()
  } catch (e) {
    listError.value = shortError(e)
  }
}

function askDeleteDevice(device) {
  deleteDeviceId.value = device.id
  deleteDialog.value = true
}

async function confirmDeleteDevice() {
  const id = deleteDeviceId.value
  deleteDialog.value = false
  deleteDeviceId.value = ''
  if (!id) return
  sessions.get(id)?.logout()
  sessions.delete(id)
  try { await deleteDevicePassword(id) } catch (e) { listError.value = '删除本地密码失败：' + shortError(e) }
  devices.value = saveDevices(devices.value.filter(d => d.id !== id))
  delete deviceStatuses[id]
  delete deviceSummaries[id]
  if (id === selectedDeviceId.value) resetSession()
}

async function refreshDeviceStatuses() {
  if (probeBusy.value) return
  probeBusy.value = true
  const entries = [...devices.value]
  let cursor = 0
  try {
    // Bounded concurrency: multiple saved routers must not cause a flood
    // of authentication/RPC traffic after the application starts.
    const worker = async () => {
      while (cursor < entries.length) {
        const d = entries[cursor++]
        deviceStatuses[d.id] = 'checking'
        let api = sessions.get(d.id)
        if (!api?.session && d.rememberPassword && isNative) {
          try {
            const secret = await fetchDevicePassword(d.id)
            if (secret) {
              const session = new RouterClient(d.address)
              await session.login(d.username, secret)
              api = session
              sessions.set(d.id, api)
            }
          } catch (_) { api = null }
        }
        let status = 'offline'
        if (api?.session) {
          try {
            const result = await readDashboard(api)
            deviceSummaries[d.id] = {
              model: result.board.model,
              hostname: result.board.hostname,
              version: result.board.version,
              temperature: result.temperature,
              uptime: result.uptime,
              updatedAt: Date.now()
            }
            status = 'online'
          } catch (_) {
            api.logout()
            sessions.delete(d.id)
          }
        }
        if (status !== 'online') status = await probeDevice(d.address)
        if (devices.value.some(x => x.id === d.id)) deviceStatuses[d.id] = status
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, entries.length) }, () => worker()))
  } finally {
    probeBusy.value = false
  }
}

async function goToDeviceList() {
  drawerOpen.value = false
  viewMode.value = 'list'
  activeTab.value = 'home'
  errorMessage.value = ''
  await refreshDeviceStatuses()
}

async function openDevice(device) {
  selectedDeviceId.value = device.id
  form.address = device.address
  form.username = device.username
  form.password = ''
  listError.value = ''
  errorMessage.value = ''
  loginRemember.value = !!device.rememberPassword
  // Never show snapshot data from another router while switching.
  snapshot.value = null
  const cached = sessions.get(device.id)
  if (cached?.session) {
    client.value = cached
    connected.value = true
    viewMode.value = 'detail'
    activeTab.value = 'home'
    await refreshDashboard()
    return
  }
  if (device.rememberPassword && isNative) {
    try {
      const secret = await fetchDevicePassword(device.id)
      if (secret) {
        form.password = secret
        await connect()
        if (connected.value && viewMode.value === 'detail') return
      }
    } catch (e) {
      listError.value = '读取加密凭据失败：' + shortError(e)
    }
  }
  form.password = ''
  loginDialog.value = true
}

async function connect() {
  if (connecting.value) return
  connecting.value = true
  errorMessage.value = ''
  try {
    const device = selectedDevice.value
    if (!device) throw new Error('请先从设备列表选择路由器')
    const api = new RouterClient(device.address)
    const password = form.password
    await api.login(device.username, password)
    client.value = api
    sessions.set(device.id, api)
    connected.value = true
    viewMode.value = 'detail'
    loginDialog.value = false
    activeTab.value = 'home'
    deviceStatuses[device.id] = 'reachable'
    localStorage.setItem(storage.host, api.baseUrl)
    if (isNative && loginRemember.value) {
      try {
        await storeDevicePassword(device.id, password)
        devices.value = saveDevices(devices.value.map(d => d.id === device.id ? { ...d, rememberPassword: true } : d))
      } catch (e) {
        listError.value = '登录成功，但保存加密密码失败：' + shortError(e)
        devices.value = saveDevices(devices.value.map(d => d.id === device.id ? { ...d, rememberPassword: false } : d))
      }
    } else {
      try { await deleteDevicePassword(device.id) } catch (_) {}
      devices.value = saveDevices(devices.value.map(d => d.id === device.id ? { ...d, rememberPassword: false } : d))
    }
    form.password = ''
    await refreshDashboard()
  } catch (e) {
    errorMessage.value = shortError(e)
    resetConnectionOnError()
    loginDialog.value = true
  } finally {
    connecting.value = false
  }
}

function resetConnectionOnError() {
  if (!snapshot.value) {
    client.value?.logout()
    client.value = null
    connected.value = false
  }
}

function handleRpcError(e) {
  errorMessage.value = shortError(e)
  if (/权限|失效|未登录/.test(errorMessage.value)) {
    errorMessage.value += '；请重新登录'
  }
}

async function refreshDashboard() {
  if (!client.value || refreshing.value) return
  refreshing.value = true
  errorMessage.value = ''
  try {
    snapshot.value = await readDashboard(client.value)
    if (selectedDeviceId.value) {
      deviceSummaries[selectedDeviceId.value] = {
        model: snapshot.value.board.model,
        hostname: snapshot.value.board.hostname,
        version: snapshot.value.board.version,
        temperature: snapshot.value.temperature,
        uptime: snapshot.value.uptime,
        updatedAt: Date.now()
      }
    }
    lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (e) {
    handleRpcError(e)
  } finally {
    refreshing.value = false
  }
}

async function refreshCurrent() {
  if (!client.value || refreshing.value) return
  if (activeTab.value === 'home' || activeTab.value === 'statistics' || activeTab.value === 'network') {
    await refreshDashboard()
    if (activeTab.value === 'network') {
      try { networkHardware.value = await readNetworkHardware(client.value) } catch (_) {}
    }
    return
  }
  refreshing.value = true
  errorMessage.value = ''
  try {
    if (activeTab.value === 'clients') clientData.value = await readClients(client.value)
    if (activeTab.value === 'apps') serviceData.value = await readServices(client.value)
    lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (e) {
    handleRpcError(e)
  } finally {
    refreshing.value = false
  }
}

async function showLegacyTool(toolId) {
  if (!client.value || toolLoading.value) return
  toolPanel.value = toolId
  toolMessage.value = ''
  if (toolId === 'reset') {
    factoryPhrase.value = ''
    factoryError.value = ''
    factoryDialog.value = true
    return
  }
  if (toolId === 'parental') return
  if (toolId === 'startup') {
    if (!serviceData.value.available) {
      toolLoading.value = true
      try { serviceData.value = await readServices(client.value) }
      catch (e) { toolMessage.value = shortError(e) }
      finally { toolLoading.value = false }
    }
    return
  }
  toolLoading.value = true
  try {
    if (toolId === 'process') {
      processData.value = await readProcessList(client.value)
      if (!processData.value.available) toolMessage.value = '当前 QWRT 未开放 luci.getProcessList RPC 接口，请核实固件插件及权限。'
    }
    if (toolId === 'routes') {
      ;[routeData.value, liveRoutes.value] = await Promise.all([
        readRouteConfig(client.value), readRuntimeRoutes(client.value)
      ])
      if (!routeData.value.available && !liveRoutes.value.available) toolMessage.value = '当前账号无路由表读取权限，请检查 ubus ACL。'
    }
    if (toolId === 'wol') {
      wolData.value = await readWolDevices(client.value)
      wolForm.iface = wolData.value.interfaces.includes('br-lan') ? 'br-lan' : (wolData.value.interfaces[0] || '')
      if (!wolData.value.available) toolMessage.value = '未安装 LuCI WOL 服务，需先在路由器安装 luci-app-wol。'
    }

  } catch (e) {
    toolMessage.value = shortError(e)
  } finally {
    toolLoading.value = false
  }
}

async function submitWolTarget() {
  if (wolBusy.value || !client.value) return
  wolBusy.value = true
  toolMessage.value = ''
  try {
    await saveWolTarget(client.value, wolForm)
    wolData.value = await readWolDevices(client.value)
    Object.assign(wolForm, { name: '', mac: '', iface: wolForm.iface, broadcast: false })
    toolMessage.value = '网络唤醒目标已保存'
  } catch (e) { toolMessage.value = shortError(e) }
  finally { wolBusy.value = false }
}

async function sendWakePacket(item) {
  if (wolBusy.value || !client.value) return
  wolBusy.value = true
  toolMessage.value = ''
  try {
    await wakeWolDevice(client.value, item)
    toolMessage.value = '已向 ' + item.name + ' 发送网络唤醒包（设备是否开机需另行确认）'
  } catch (e) { toolMessage.value = shortError(e) }
  finally { wolBusy.value = false }
}

async function confirmRemoveWol() {
  const item = wolDeleteTarget.value
  wolDeleteDialog.value = false
  wolDeleteTarget.value = null
  if (!item || wolBusy.value || !client.value) return
  wolBusy.value = true
  try {
    await removeWolTarget(client.value, item.id)
    wolData.value = await readWolDevices(client.value)
    toolMessage.value = '已删除网络唤醒配置'
  } catch (e) { toolMessage.value = shortError(e) }
  finally { wolBusy.value = false }
}

async function saveParentalOptions() {
  if (parentalSaving.value || !client.value) return
  parentalSaving.value = true
  toolMessage.value = ''
  try {
    await saveParentalBase(client.value, parentalForm)
    parentalData.value = await readParentalSettings(client.value)
    toolMessage.value = '家长控制基础设置已提交'
  } catch (e) { toolMessage.value = shortError(e) }
  finally { parentalSaving.value = false }
}

async function showReleasePage() {
  try {
    await Browser.open({ url: 'https://github.com/lmdbot/xxwrt-m-custom/releases', windowName: '_blank' })
  } catch (e) {
    listError.value = '打开版本页面失败：' + shortError(e)
  }
}

async function openRouterWeb() {
  // Retained as an intentionally disabled compatibility function.
  // Missing management functionality must be migrated to native RPC,
  // not delegated to a router web panel.
  return
}

async function factoryResetRouter() {
  if (!client.value || factoryBusy.value || factoryPhrase.value !== '恢复出厂') return
  factoryBusy.value = true
  factoryError.value = ''
  try {
    const result = await client.value.call('file', 'exec', {
      command: '/sbin/firstboot', params: ['-r', '-y'], env: null
    })
    if (result && typeof result.code === 'number' && result.code !== 0) {
      throw new Error('恢复出厂命令返回失败代码：' + result.code)
    }
    factoryDialog.value = false
    resetSession()
    listError.value = '已向路由器提交恢复出厂请求，设备将断开连接。'
  } catch (e) {
    factoryError.value = '执行结果未确认：' + shortError(e) + '。如设备已断线请勿立即重复操作。'
  } finally { factoryBusy.value = false }
}

async function rebootRouter() {
  if (!client.value || actionBusy.value) return
  confirmReboot.value = false
  actionBusy.value = true
  try {
    await client.value.call('system', 'reboot')
    errorMessage.value = '已向路由器发送重启命令，稍后可重新登录'
    resetSession()
  } catch (e) {
    handleRpcError(e)
  } finally {
    actionBusy.value = false
  }
}

onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mediaQuery.matches
  systemListener = e => { systemDark.value = e.matches }
  mediaQuery.addEventListener?.('change', systemListener)
  void refreshDeviceStatuses()
  probeTimer = setInterval(() => {
    if (viewMode.value === 'list') void refreshDeviceStatuses()
  }, 30000)
  refreshTimer = setInterval(() => {
    if (viewMode.value === 'detail' && connected.value && activeTab.value === 'home' && !refreshing.value) refreshDashboard()
  }, 12000)
})
onUnmounted(() => {
  mediaQuery?.removeEventListener?.('change', systemListener)
  if (refreshTimer) clearInterval(refreshTimer)
  if (probeTimer) clearInterval(probeTimer)
})
</script>

<template>
  <v-app class="material-demo" :class="{ 'theme-is-dark': dark }">
    <v-app-bar flat color="surface" height="64" class="top-bar">
      <v-btn icon="mdi-menu" size="small" aria-label="打开侧栏菜单" @click="drawerOpen = !drawerOpen"/>
      <v-btn v-if="viewMode === 'detail'" icon="mdi-arrow-left" size="small" aria-label="返回设备列表" @click="goToDeviceList"/>
      <v-toolbar-title class="app-name">{{ viewMode === 'list' ? '我的 OpenWrt' : (selectedDevice?.name || 'QWRT') }}</v-toolbar-title>
      <v-spacer />
      <v-btn v-if="viewMode === 'detail' && connected" icon="mdi-logout" size="small" aria-label="退出登录" @click="resetSession"/>
    </v-app-bar>

    <v-navigation-drawer v-model="drawerOpen" temporary location="left" width="304" class="material-side-drawer" aria-label="侧栏菜单">
      <div class="sidebar-brand">
        <v-avatar size="44" color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-router-wireless" size="27"/></v-avatar>
        <div><strong>XX-WRT M</strong><small>Material UI · OpenWrt</small></div>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="关闭侧栏菜单" @click="drawerOpen = false"/>
      </div>
      <v-divider class="mb-2"/>
      <v-list nav density="compact" class="sidebar-nav-list">
        <v-list-item prepend-icon="mdi-router-network" title="设备列表"
          :active="drawerSection === 'devices'" @click="drawerSection = 'devices'; goToDeviceList()"/>
        <v-list-item prepend-icon="mdi-translate" title="语言设置"
          :active="drawerSection === 'language'" @click="drawerSection = 'language'"/>
        <v-list-item prepend-icon="mdi-palette-outline" title="外观模式"
          :active="drawerSection === 'appearance'" @click="drawerSection = 'appearance'"/>
        <v-list-item prepend-icon="mdi-update" title="检查更新"
          :active="drawerSection === 'update'" @click="drawerSection = 'update'"/>
        <v-list-item prepend-icon="mdi-help-circle-outline" title="帮助与反馈"
          :active="drawerSection === 'help'" @click="drawerSection = 'help'"/>
        <v-list-item prepend-icon="mdi-heart-outline" title="支持项目"
          :active="drawerSection === 'support'" @click="drawerSection = 'support'"/>
        <v-list-item prepend-icon="mdi-information-outline" title="关于"
          :active="drawerSection === 'about'" @click="drawerSection = 'about'"/>
      </v-list>
      <v-divider class="my-3"/>
      <div class="sidebar-panel">
        <template v-if="drawerSection === 'appearance'">
          <div class="sidebar-section-title"><v-icon icon="mdi-tune-variant" size="19"/> 界面设置</div>
          <div class="sidebar-field-label">底部导航样式</div>
          <v-btn-toggle v-model="navStyle" class="sidebar-style-switch" mandatory divided color="primary" variant="outlined" density="comfortable" aria-label="底栏样式">
            <v-btn value="standard" aria-label="标准底栏" size="small">标准</v-btn>
            <v-btn value="liquid" aria-label="液态底栏" size="small">液态</v-btn>
          </v-btn-toggle>
          <v-select v-model="colorMode" class="mt-5" density="compact" variant="outlined" label="主题颜色"
            :items="[{title:'跟随系统',value:'system'},{title:'浅色模式',value:'light'},{title:'深色模式',value:'dark'}]"
            item-title="title" item-value="value" hide-details/>
          <p class="muted-hint mt-3">设置自动保存在本机，打开任意路由器时继续生效。</p>
        </template>
        <template v-else-if="drawerSection === 'language'">
          <div class="sidebar-section-title">语言设置</div>
          <p class="muted-hint">当前语言：简体中文。原版的多语言资源尚需逐页迁移，未完成前不提供无效的语言切换。</p>
        </template>
        <template v-else-if="drawerSection === 'update'">
          <div class="sidebar-section-title">检查更新</div>
          <p class="muted-hint">查看 GitHub 的最新测试版本和变更记录。</p>
          <v-btn block color="primary" variant="tonal" prepend-icon="mdi-open-in-new" @click="showReleasePage">查看 Releases</v-btn>
        </template>
        <template v-else-if="drawerSection === 'help'">
          <div class="sidebar-section-title">帮助与反馈</div>
          <p class="muted-hint">添加设备后使用 QWRT 的 RPC 账号登录。终端页的 DHCP 租约不等于实时在线设备；插件管理依赖固件开放的对应 RPC。</p>
          <v-btn block color="primary" variant="outlined" prepend-icon="mdi-github" @click="showReleasePage">查看项目及版本记录</v-btn>
        </template>
        <template v-else-if="drawerSection === 'support'">
          <div class="sidebar-section-title">支持项目</div>
          <p class="muted-hint">本项目是非官方 Material UI 自定义版本。上游赞助链接未直接迁移，以免展示未经核对的收款或推广信息。</p>
        </template>
        <template v-else-if="drawerSection === 'about'">
          <div class="sidebar-section-title">关于</div>
          <p class="muted-hint">XX-WRT M Material 测试版；使用 Vue、Vuetify、Capacitor 与开源液态玻璃组件。基础版仍为 v1.0.6。</p>
          <v-btn block variant="tonal" prepend-icon="mdi-github" @click="showReleasePage">版本与源代码</v-btn>
        </template>
        <template v-else>
          <div class="sidebar-section-title">设备列表</div>
          <p class="muted-hint">选择或添加路由器后可进入管理页面。</p>
        </template>
      </div>
    </v-navigation-drawer>

    <v-main>
      <v-container class="main-container">
        <template v-if="viewMode === 'list'">
          <div class="list-page-title">
            <div><div class="eyebrow">OPENWRT DEVICES · MULTI-ROUTER</div><h1>设备列表</h1>
              <p class="muted-hint mt-1">保存多台路由器，查看可达状态；点击设备进入管理首页。</p></div>
            <div class="list-page-actions">
              <v-btn icon="mdi-refresh" variant="tonal" color="primary" :loading="probeBusy" aria-label="刷新设备状态" @click="refreshDeviceStatuses"/>
              <v-btn color="primary" rounded="xl" prepend-icon="mdi-plus" @click="showDeviceDialog()">添加</v-btn>
            </div>
          </div>
          <v-alert v-if="listError && !deviceDialog" type="warning" variant="tonal" closable density="compact" class="mb-3" @click:close="listError = ''">{{ listError }}</v-alert>
          <v-card v-if="!devices.length" rounded="xl" elevation="1" class="empty-devices">
            <v-avatar color="primary" variant="tonal" size="72"><v-icon icon="mdi-router-wireless" size="36"/></v-avatar>
            <h2>还没有添加 OpenWrt 设备</h2>
            <p>支持 IP、域名、HTTP、HTTPS 和不同端口。添加后会保留在首页。</p>
            <v-btn rounded="xl" color="primary" prepend-icon="mdi-plus" @click="showDeviceDialog()">添加第一个设备</v-btn>
          </v-card>
          <div v-else class="saved-device-grid">
            <v-card v-for="device in devices" :key="device.id" rounded="xl" elevation="1" class="saved-device-card"
                    tabindex="0" role="button" :aria-label="'进入 ' + device.name"
                    @click="openDevice(device)" @keydown.enter.prevent="openDevice(device)">
              <div class="saved-device-header">
                <v-avatar color="primary" variant="tonal" rounded="lg" size="48"><v-icon icon="mdi-router-wireless" size="27"/></v-avatar>
                <div class="saved-device-identity"><h2>{{ device.name }}</h2><div class="muted-hint ellipsis-url">{{ device.address }}</div></div>
                <v-icon icon="mdi-chevron-right" size="23" color="secondary"/>
              </div>
              <div class="saved-device-info">
                <v-chip size="small" variant="tonal"
                        :color="['reachable', 'online'].includes(deviceStatuses[device.id]) ? 'success' : deviceStatuses[device.id] === 'offline' ? 'error' : 'secondary'"
                        :prepend-icon="['reachable', 'online'].includes(deviceStatuses[device.id]) ? 'mdi-check-circle' : deviceStatuses[device.id] === 'offline' ? 'mdi-alert-circle' : 'mdi-progress-clock'">
                  {{ deviceStatuses[device.id] === 'online' ? '已登录 · 在线' : deviceStatuses[device.id] === 'reachable' ? '网络可达' : deviceStatuses[device.id] === 'offline' ? '无法连接' : '检测中' }}
                </v-chip>
                <span class="muted-hint">{{ deviceSummaries[device.id]?.temperature || deviceSummaries[device.id]?.hostname || '等待获取设备状态' }}</span>
              </div>
              <div v-if="deviceSummaries[device.id]" class="saved-device-summary">
                {{ deviceSummaries[device.id].model }} · {{ deviceSummaries[device.id].version }} · 运行 {{ deviceSummaries[device.id].uptime }}
              </div>
              <div class="saved-device-footer">
                <span class="muted-hint">用户：{{ device.username }} · {{ device.rememberPassword ? '已加密保存凭据' : '每次启动需验证' }}</span>
                <div>
                  <v-btn icon="mdi-pencil-outline" size="small" variant="text" :aria-label="'编辑' + device.name" @click.stop="showDeviceDialog(device)"/>
                  <v-btn icon="mdi-delete-outline" size="small" color="error" variant="text" :aria-label="'删除' + device.name" @click.stop="askDeleteDevice(device)"/>
                </div>
              </div>
            </v-card>
          </div>
          <div class="device-list-help">
            <v-icon icon="mdi-shield-lock-outline" size="18"/><span>设备信息保存在本机；勾选记住密码时仅由 Android Keystore 加密保存，不会上传到第三方服务器。</span>
          </div>
        </template>
        <template v-else>
          <div class="page-head">
            <div><div class="eyebrow">{{ client?.baseUrl }} · {{ lastUpdated ? '更新于 ' + lastUpdated : '已连接' }}</div><h1>{{ pageTitle }}</h1></div>
            <v-btn color="primary" variant="tonal" icon="mdi-refresh" size="small" :loading="refreshing" aria-label="刷新数据" @click="refreshCurrent"/>
          </div>
          <v-alert v-if="errorMessage" type="warning" variant="tonal" density="compact" closable class="mb-4" @click:close="errorMessage = ''">{{ errorMessage }}</v-alert>

          <template v-if="activeTab === 'home' || activeTab === 'statistics'">
            <v-card v-if="snapshot && activeTab === 'home'" rounded="xl" elevation="1" class="device-card">
              <div class="device-heading">
                <v-avatar color="primary" variant="tonal" rounded="lg" size="52"><v-icon icon="mdi-router-wireless" size="30"/></v-avatar>
                <div class="device-heading-label"><h2>{{ snapshot.board.model }}</h2><p>{{ snapshot.board.version }} · {{ snapshot.board.target }}</p></div>
                <v-icon icon="mdi-check-circle" color="success" size="24"/>
              </div>
              <v-divider class="my-3"/>
              <div class="details">
                <div><span>主机名</span><strong>{{ snapshot.board.hostname }}</strong></div>
                <div><span>处理器</span><strong>{{ snapshot.board.system }}</strong></div>
                <div><span>内核版本</span><strong>{{ snapshot.board.kernel }}</strong></div>
                <div><span>温度</span><strong>{{ snapshot.temperature }}</strong></div>
                <div><span>本地时间</span><strong>{{ snapshot.localtime }}</strong></div>
                <div><span>运行时间</span><strong>{{ snapshot.uptime }}</strong></div>
              </div>
              <section class="detector-area">
                <div class="section-heading">
                  <h3>联网监测</h3>
                  <v-chip v-if="snapshot.detectorAvailable" size="small" variant="tonal" :color="onlineCount === allChecks.length ? 'success' : 'error'">
                    {{ onlineCount }} / {{ allChecks.length }} 正常
                  </v-chip>
                  <span v-else class="muted-hint">未获取到状态</span>
                </div>
                <div v-if="allChecks.length" class="detector-grid">
                  <v-chip v-for="check in allChecks" :key="check.id" size="small" :color="check.state === 'up' ? 'success' : check.state === 'pending' ? 'warning' : 'error'" variant="tonal" class="status-chip">
                    <v-icon start :icon="check.state === 'up' ? 'mdi-circle' : check.state === 'pending' ? 'mdi-progress-clock' : 'mdi-alert-circle'" size="10"/>
                    <span class="chip-name">{{ check.name }}</span><span class="chip-state">{{ check.state === 'up' ? '已连接' : check.state === 'pending' ? '检测中' : '已断开' }}</span>
                  </v-chip>
                </div>
                <p v-else class="muted-hint">{{ snapshot.detectorAvailable ? '未配置监测实例' : '需要在 QWRT 安装 Internet Detector 并开放读取权限' }}</p>
              </section>
            </v-card>

            <div v-if="snapshot" class="resource-grid">
              <v-card v-for="item in resourceCards" :key="item.label" rounded="xl" elevation="1" class="resource-card">
                <div class="resource-top"><span>{{ item.label }}</span><v-icon :icon="item.icon" color="secondary" size="22"/></div>
                <strong>{{ item.value }}</strong><small>{{ item.detail }}</small>
                <v-progress-linear :model-value="item.progress" rounded height="4" color="primary" class="mt-3"/>
              </v-card>
            </div>

            <v-card v-if="snapshot && activeTab === 'statistics'" class="mt-4 network-card" rounded="xl" elevation="1">
              <h2>系统与连接</h2>
              <div class="details">
                <div><span>在线终端数</span><strong>{{ snapshot.users }}</strong></div>
                <div><span>CPU 平均负载</span><strong>{{ snapshot.load }}</strong></div>
                <div><span>温度</span><strong>{{ snapshot.temperature }}</strong></div>
                <div><span>LAN IP</span><strong>{{ snapshot.lanIp }}</strong></div>
                <div><span>WAN IP</span><strong>{{ snapshot.wanIp }}</strong></div>
              </div>
            </v-card>
            <v-skeleton-loader v-if="!snapshot" type="card,article,article"/>
          </template>

          <template v-if="activeTab === 'clients'">
            <div class="terminal-screen">
              <div class="terminal-header">
                <div><h2>终端设备</h2><p>DHCP 租约记录，不代表当前在线</p></div>
                <v-chip color="primary" variant="tonal" size="small" prepend-icon="mdi-devices">{{ clientData.data.length }} 台</v-chip>
              </div>
              <v-text-field v-model="clientSearch" variant="solo-filled" density="compact" flat rounded="lg"
                hide-details clearable prepend-inner-icon="mdi-magnify" placeholder="搜索名称、IP 或 MAC"
                aria-label="搜索名称、IP 或 MAC" class="terminal-search mb-4"/>
              <div v-if="filteredClients.length" class="terminal-grid" role="list" aria-label="DHCP 终端设备">
                <v-card v-for="item in filteredClients" :key="item.mac || item.ip" role="listitem"
                  rounded="lg" variant="outlined" class="terminal-tile" tabindex="0"
                  :aria-label="'查看终端 ' + item.name" @click="selectedClient = item"
                  @keydown.enter.prevent="selectedClient = item">
                  <v-avatar size="42" rounded="lg" color="primary" variant="tonal" class="terminal-icon">
                    <v-icon icon="mdi-laptop" size="22"/>
                  </v-avatar>
                  <div class="terminal-meta">
                    <div class="terminal-name">{{ item.name || '未知设备' }}</div>
                    <div class="terminal-ip">{{ item.ip }}</div>
                    <div class="terminal-mac">{{ item.mac || 'MAC 未知' }}</div>
                  </div>
                  <div class="terminal-trailing">
                    <v-chip size="x-small" variant="tonal" color="secondary" class="terminal-lease-chip">DHCP</v-chip>
                    <v-icon icon="mdi-chevron-right" size="19" color="secondary"/>
                  </div>
                </v-card>
              </div>
              <v-empty-state v-else-if="clientData.data.length && clientSearch" icon="mdi-magnify-close"
                title="没有匹配的终端" text="请尝试设备名称、IP 地址或 MAC 地址"/>
              <v-empty-state v-else icon="mdi-devices"
                :title="clientData.leasesAvailable ? '暂无 DHCP 租约' : '无法获取 DHCP 租约'"
                text="确认 QWRT 的 luci-rpc.getDHCPLeases 接口具有读取权限"/>
            </div>
          </template>

          <template v-if="activeTab === 'network'">
            <v-card rounded="xl" elevation="1" class="network-card mb-4">
              <h2>网络概览</h2>
              <div v-if="snapshot" class="details">
                <div><span>LAN IPv4</span><strong>{{ snapshot.lanIp }}</strong></div>
                <div><span>WAN IPv4</span><strong>{{ snapshot.wanIp }}</strong></div>
                <div><span>WAN IPv6</span><strong>{{ snapshot.wan6Ip }}</strong></div>
                <div><span>默认网关</span><strong>{{ snapshot.gateway }}</strong></div>
                <div><span>DNS</span><strong>{{ snapshot.dns }}</strong></div>
              </div>
            </v-card>
            <v-card v-if="networkHardware.wired.length || networkHardware.wireless.length" rounded="xl" elevation="1" class="network-card mb-4">
              <h2>网络硬件设备</h2>
              <div v-if="networkHardware.wired.length" class="mt-3">
                <h3>有线接口</h3>
                <v-list density="compact">
                  <v-list-item v-for="nic in networkHardware.wired" :key="'wired-'+nic.name" :title="nic.name" :subtitle="nic.mac">
                    <template #append><v-chip size="x-small" :color="nic.up ? 'success' : 'secondary'" variant="tonal">{{ nic.up ? '在线' : '未连接' }}</v-chip></template>
                  </v-list-item>
                </v-list>
              </div>
              <div v-if="networkHardware.wireless.length" class="mt-3">
                <h3>无线接口</h3>
                <v-list density="compact">
                  <v-list-item v-for="nic in networkHardware.wireless" :key="'wifi-'+nic.name" :title="nic.name" :subtitle="nic.mac"/>
                </v-list>
              </div>
            </v-card>
            <v-card v-for="nic in snapshot?.interfaces || []" :key="nic.interface" rounded="xl" elevation="1" class="interface-card mb-3">
              <div class="section-heading">
                <div><strong>{{ nic.interface }}</strong><div class="muted-hint">{{ nic.proto || 'unknown' }} · {{ nic.device || nic.l3_device || '--' }}</div></div>
                <v-chip size="small" variant="tonal" :color="nic.up ? 'success' : 'error'">{{ nic.up ? '已连接' : '未连接' }}</v-chip>
              </div>
              <div class="muted-hint">{{ nic['ipv4-address']?.map(x => x.address).join(', ') || '无 IPv4 地址' }}</div>
            </v-card>
          </template>

          <template v-if="activeTab === 'apps'">
            <v-card rounded="xl" elevation="1" class="network-card">
              <div class="section-heading"><h2>系统服务</h2><v-chip size="small" variant="tonal" color="primary">{{ serviceData.services.length }} 项</v-chip></div>
              <p class="muted-hint">通过 QWRT 的 rc.list 读取服务；更深入的插件管理请进入路由器 LuCI 管理界面。</p>
              <v-list v-if="serviceData.services.length" bg-color="transparent">
                <v-list-item v-for="svc in serviceData.services" :key="svc.name" :title="svc.name" :subtitle="svc.enabled ? '开机启用' : '未启用'">
                  <template #append><v-chip :color="svc.running ? 'success' : 'secondary'" variant="tonal" size="x-small">{{ svc.running ? '运行中' : '未运行' }}</v-chip></template>
                </v-list-item>
              </v-list>
              <p v-else class="muted-hint">{{ serviceData.available ? '路由器没有返回服务项' : '当前固件不支持 rc.list 或接口权限不足' }}</p>
            </v-card>
            <v-card rounded="xl" elevation="1" class="network-card mt-4">
              <div class="section-heading"><h2>基础版管理工具</h2><v-chip size="small" variant="tonal" color="primary">main 功能入口</v-chip></div>
              <p class="muted-hint">基于 main 分支真实 RPC 逐项迁移。受固件版本和权限影响，部分功能可能不可用；不会自动跳转 LuCI 替代。</p>
              <div class="legacy-tool-grid">
                <v-btn v-for="tool in legacyTools" :key="tool.id" variant="tonal" color="primary" rounded="lg" class="legacy-tool-button" :prepend-icon="tool.icon" @click="showLegacyTool(tool.id)">{{ tool.title }}</v-btn>
              </div>
              <v-alert v-if="toolMessage" type="info" variant="tonal" density="compact" class="mt-3">{{ toolMessage }}</v-alert>
              <v-progress-linear v-if="toolLoading" indeterminate class="mt-3"/>
              <div v-if="toolPanel === 'process'" class="mt-3">
                <h3>进程列表</h3>
                <v-list v-if="processData.processes.length" density="compact">
                  <v-list-item v-for="proc in processData.processes" :key="proc.pid + ':' + proc.command" :title="proc.command" :subtitle="'PID ' + proc.pid + ' · ' + proc.user + ' · CPU ' + proc.cpu + ' · MEM ' + proc.memory"/>
                </v-list>
                <p v-else class="muted-hint">暂无进程数据</p>
              </div>
              <div v-if="toolPanel === 'startup'" class="mt-3">
                <h3>启动项 / 服务</h3>
                <v-list v-if="serviceData.services.length" density="compact">
                  <v-list-item v-for="svc in serviceData.services" :key="'startup-' + svc.name" :title="svc.name" :subtitle="svc.enabled ? '开机自启' : '未设置开机自启'">
                    <template #append><v-chip size="x-small" :color="svc.running ? 'success' : 'secondary'" variant="tonal">{{ svc.running ? '运行中' : '未运行' }}</v-chip></template>
                  </v-list-item>
                </v-list>
              </div>
              <div v-if="toolPanel === 'routes'" class="mt-3">
                <h3>静态路由配置</h3>
                <v-list v-if="routeData.routes.length" density="compact">
                  <v-list-item v-for="r in routeData.routes" :key="r.section" :title="r.target" :subtitle="r.type + ' · ' + r.interface + ' · 网关 ' + r.gateway + ' · 跃点 ' + r.metric"/>
                </v-list>
                <p v-else class="muted-hint">暂无静态路由配置或当前固件不提供对应接口</p>
              </div>
              <div v-if="toolPanel === 'routes' && liveRoutes.lines.length" class="mt-3">
                <h3>当前 IPv4 路由表</h3>
                <div class="route-table"><div v-for="(line, i) in liveRoutes.lines" :key="'route-' + i">{{ line }}</div></div>
              </div>
              <div v-if="toolPanel === 'wol'" class="mt-3">
                <h3>网络唤醒</h3>
                <p class="muted-hint mb-2">支持 main 相同的 LuCI WOL RPC；需要 QWRT 已安装 WOL 插件并授权。</p>
                <v-list v-if="wolData.targets.length" density="compact">
                  <v-list-item v-for="target in wolData.targets" :key="target.id" :title="target.name" :subtitle="target.mac + (target.iface ? ' · ' + target.iface : '')">
                    <template #append>
                      <v-btn size="small" color="primary" variant="tonal" :loading="wolBusy" @click="sendWakePacket(target)">唤醒</v-btn>
                      <v-btn icon="mdi-delete-outline" color="error" variant="text" size="small" aria-label="删除 WOL 目标" @click="wolDeleteTarget = target; wolDeleteDialog = true"/>
                    </template>
                  </v-list-item>
                </v-list>
                <v-alert v-if="!wolData.available" type="warning" density="compact" variant="tonal">WOL RPC 未启用，无法在 APP 内直接唤醒设备。</v-alert>
                <template v-else>
                  <h3 class="mt-4">添加网络唤醒目标</h3>
                  <form @submit.prevent="submitWolTarget">
                    <v-text-field v-model.trim="wolForm.name" label="名称" density="compact" variant="outlined" class="mt-2" required/>
                    <v-text-field v-model.trim="wolForm.mac" label="MAC 地址" placeholder="AA:BB:CC:DD:EE:FF" density="compact" variant="outlined" required/>
                    <v-select v-model="wolForm.iface" label="发送接口" density="compact" variant="outlined" :items="wolData.interfaces" clearable/>
                    <v-checkbox v-model="wolForm.broadcast" label="广播方式" density="compact" hide-details/>
                    <v-btn type="submit" block color="primary" variant="tonal" :loading="wolBusy" class="mt-2">保存 WOL 设备</v-btn>
                  </form>
                </template>
              </div>
              <AppFilterPanel v-if="toolPanel === 'parental' && client" :client="client"/>

            </v-card>
            <v-card rounded="xl" elevation="1" class="network-card mt-4">
              <h2>路由器维护</h2>
              <v-btn variant="tonal" color="error" class="mt-3" prepend-icon="mdi-restart" @click="confirmReboot = true">重启路由器</v-btn>
            </v-card>
          </template>


        </template>
        <v-alert v-if="errorMessage && !connected" class="mt-4" type="error" variant="tonal">{{ errorMessage }}</v-alert>
        <p class="demo-notice">非官方 Material UI · 通过真实 QWRT ubus 接口读取数据</p>
      </v-container>
    </v-main>

    <v-bottom-navigation v-if="viewMode === 'detail' && connected && navStyle === 'standard'" v-model="activeTab" :height="68" grow bg-color="surface" class="standard-bottom" color="primary" elevation="6">
      <v-btn v-for="item in pages" :key="item.id" :value="item.id" density="comfortable">
        <v-icon :icon="item.icon" size="23"/><span class="nav-label">{{ item.label }}</span>
      </v-btn>
    </v-bottom-navigation>
    <div v-else-if="viewMode === 'detail' && connected" class="liquid-bottom">
      <VGlass :blur="9" :scale="22" :base-frequency="0.016" class="glass-host">
        <div class="glass-nav">
          <v-btn v-for="item in pages" :key="item.id" class="glass-tab" :class="{ selected: activeTab === item.id }" variant="text" rounded="xl" density="compact" :aria-label="item.label" @click="activeTab = item.id">
            <v-icon :icon="item.icon" size="23"/><span>{{ item.label }}</span>
          </v-btn>
        </div>
      </VGlass>
    </div>
    <v-dialog v-model="selectedClient" max-width="420">
      <v-card v-if="selectedClient" rounded="xl" title="终端详情">
        <v-card-text>
          <div class="details">
            <div><span>名称</span><strong>{{ selectedClient.name }}</strong></div>
            <div><span>IPv4</span><strong>{{ selectedClient.ip }}</strong></div>
            <div><span>MAC 地址</span><strong>{{ selectedClient.mac }}</strong></div>
            <div><span>租约时间</span><strong>{{ selectedClient.expires ?? '--' }}</strong></div>
          </div>
          <p class="muted-hint mt-3">租约存在并不代表设备当前在线；其他终端扩展功能需继续按原版 RPC 接口迁移。</p>
        </v-card-text>
        <v-card-actions><v-spacer/><v-btn @click="selectedClient = null">关闭</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="deviceDialog" max-width="430">
      <v-card rounded="xl">
        <v-card-title>{{ editDeviceId ? '编辑 OpenWrt 设备' : '添加 OpenWrt 设备' }}</v-card-title>
        <v-card-text>
          <form id="device-editor" @submit.prevent="saveDeviceEntry">
            <v-text-field v-model.trim="deviceForm.name" label="设备名称 / 备注" variant="outlined" density="comfortable" placeholder="例如：QWRT 主路由" required/>
            <v-text-field v-model.trim="deviceForm.address" label="IP / 域名 / 端口" variant="outlined" density="comfortable" placeholder="http://192.168.100.1" autocomplete="url" autocapitalize="off" required/>
            <v-text-field v-model.trim="deviceForm.username" label="登录用户名" variant="outlined" density="comfortable" autocomplete="username" required/>
            <p class="muted-hint">设备地址可以是 HTTPS 公网域名。保存后点击设备输入密码登录。</p>
            <v-alert v-if="listError" type="warning" variant="tonal" density="compact" class="mt-2">{{ listError }}</v-alert>
          </form>
        </v-card-text>
        <v-card-actions><v-spacer/><v-btn variant="text" @click="deviceDialog = false">取消</v-btn><v-btn type="submit" form="device-editor" color="primary">保存设备</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="loginDialog" max-width="430" :persistent="connecting">
      <v-card rounded="xl">
        <v-card-title>连接 {{ selectedDevice?.name || 'OpenWrt' }}</v-card-title>
        <v-card-text>
          <p class="muted-hint mb-3">{{ selectedDevice?.address }}</p>
          <form id="router-login" @submit.prevent="connect">
            <v-text-field v-model.trim="form.username" density="comfortable" variant="outlined" label="用户名" autocomplete="username" readonly/>
            <v-text-field v-model="form.password" density="comfortable" variant="outlined" label="路由器密码" autocomplete="current-password" :type="form.showPassword ? 'text' : 'password'" :append-inner-icon="form.showPassword ? 'mdi-eye-off' : 'mdi-eye'" @click:append-inner="form.showPassword = !form.showPassword" required/>
            <v-checkbox v-if="isNative" v-model="loginRemember" label="使用 Android Keystore 加密记住密码" color="primary" hide-details/>
            <p v-else class="muted-hint">网页预览不保存密码；Android 安装版支持安全存储。</p>
          </form>
          <v-alert v-if="errorMessage" type="warning" variant="tonal" density="compact" class="mt-2">{{ errorMessage }}</v-alert>
        </v-card-text>
        <v-card-actions><v-spacer/><v-btn variant="text" :disabled="connecting" @click="loginDialog = false">返回列表</v-btn><v-btn type="submit" form="router-login" color="primary" :loading="connecting">登录并进入</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="deleteDialog" max-width="360">
      <v-card rounded="xl" title="删除路由器">
        <v-card-text>确定从设备列表移除这台 OpenWrt 吗？本机保存的对应密码也将删除，不会对路由器执行任何命令。</v-card-text>
        <v-card-actions><v-spacer/><v-btn @click="deleteDialog = false">取消</v-btn><v-btn color="error" @click="confirmDeleteDevice">删除</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="wolDeleteDialog" max-width="360">
      <v-card rounded="xl" title="删除网络唤醒目标">
        <v-card-text>删除 {{ wolDeleteTarget?.name }} 的 WOL 配置？这只删除保存的唤醒目标，不会关闭当前设备。</v-card-text>
        <v-card-actions><v-spacer/><v-btn @click="wolDeleteDialog = false">取消</v-btn><v-btn color="error" @click="confirmRemoveWol">删除目标</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="factoryDialog" max-width="420" :persistent="factoryBusy">
      <v-card rounded="xl" title="恢复 QWRT 出厂设置">
        <v-card-text>
          <v-alert type="error" variant="tonal" density="comfortable" class="mb-4">
            此操作将删除路由器当前配置，影响所有连接设备，且无法撤销。
            本功能使用 main 原版的 file.exec /sbin/firstboot -r -y 命令。
          </v-alert>
          <v-text-field v-model.trim="factoryPhrase" variant="outlined" label="请输入“恢复出厂”以确认"
            autocapitalize="off" autocomplete="off" :disabled="factoryBusy"/>
          <v-alert v-if="factoryError" type="warning" variant="tonal" density="compact">{{ factoryError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" :disabled="factoryBusy" @click="factoryDialog = false">取消</v-btn>
          <v-btn color="error" :disabled="factoryPhrase !== '恢复出厂'" :loading="factoryBusy"
            @click="factoryResetRouter">确认恢复出厂</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="confirmReboot" max-width="360">
      <v-card rounded="xl" title="确认重启 QWRT">
        <v-card-text>此操作将断开所有连接并重启路由器。确定执行吗？</v-card-text>
        <v-card-actions><v-spacer/><v-btn variant="text" @click="confirmReboot = false">取消</v-btn><v-btn color="error" :loading="actionBusy" @click="rebootRouter">确认重启</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>
