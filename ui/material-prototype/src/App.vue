<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { useTheme } from 'vuetify'
import { VGlass } from '@daisigu/vue-liquid-glass'
import { Browser } from '@capacitor/browser'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor, registerPlugin } from '@capacitor/core'
import packageInfo from '../package.json'
import AppFilterPanel from './components/AppFilterPanel.vue'
import CompactManagementLists from './components/CompactManagementLists.vue'
import NetworkHardwareList from './components/NetworkHardwareList.vue'
import SavedRouterCard from './components/SavedRouterCard.vue'
import RealtimeChart from './components/RealtimeChart.vue'
import {
  readDiskUsage, interfaceOptions, readInterfaceCounters, readSystemLoad,
  bandwidthSample, prettyRate, readWirelessStations
} from './services/telemetry.js'
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
function formatInterfaceUptime(rawSeconds) {
  if (rawSeconds === null || rawSeconds === undefined || rawSeconds === '') return '--'
  const value = Number(rawSeconds)
  if (!Number.isFinite(value) || value < 0) return '--'
  let seconds = Math.floor(value)
  const days = Math.floor(seconds / 86400)
  seconds %= 86400
  const hours = Math.floor(seconds / 3600)
  seconds %= 3600
  const minutes = Math.floor(seconds / 60)
  seconds %= 60
  const parts = []
  if (days) parts.push(days + '天')
  if (hours) parts.push(hours + '小时')
  if (minutes) parts.push(minutes + '分钟')
  if (!parts.length) parts.push(seconds + '秒')
  return parts.join(' ')
}

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
  theme: 'xxwrt_material_color_mode',
  showIp: 'xxwrt_material_list_show_ip',
  showHostname: 'xxwrt_material_list_show_hostname',
  listLayout: 'xxwrt_material_device_list_layout'
}
const devices = ref(loadDevices())
const showIp = ref(localStorage.getItem(storage.showIp) !== 'false')
const showHostnames = ref(localStorage.getItem(storage.showHostname) !== 'false')
const routerListLayout = ref(localStorage.getItem(storage.listLayout) === 'list' ? 'list' : 'card')
const routerListFilter = ref('all')
const isReachable = status => status === 'online' || status === 'reachable'
const reachableCount = computed(() => devices.value.filter(d => isReachable(deviceStatuses[d.id])).length)
const offlineCount = computed(() => devices.value.filter(d => deviceStatuses[d.id] === 'offline').length)
const displayedDevices = computed(() => devices.value.filter(d => routerListFilter.value === 'all'
  || (routerListFilter.value === 'online' && isReachable(deviceStatuses[d.id]))
  || (routerListFilter.value === 'offline' && deviceStatuses[d.id] === 'offline')))
function displayDeviceName(device) {
  if (!device) return 'QWRT'
  if (showHostnames.value) return device.name
  return '路由器 ' + (Math.max(0, devices.value.findIndex(d => d.id === device.id)) + 1)
}
function maskHostname(host) {
  return showHostnames.value ? (host || '--') : '••••••'
}
function displayRouterAddress(address) {
  return showIp.value ? (address || '--') : '•••.•••.•••.•••'
}
const deviceCounterCache = new Map()
async function makeDeviceSummary(api, info, deviceId) {
  const summary = {
    model: info.board.model, hostname: info.board.hostname,
    version: info.board.version, temperature: info.temperature, uptime: info.uptime,
    cpuPercent: info.cpuPercent, memoryPercent: info.memoryPercent,
    memoryDetail: info.memoryDetail, connUsed: String(info.connDetail || '--').split(' / ')[0],
    users: info.users, wanIp: info.wanIp, lanIp: info.lanIp,
    // Retain the last displayed rate until a new pair of counters is sampled.
    // A transient counter RPC failure must not blank a saved router card.
    rxBps: deviceSummaries[deviceId]?.rxBps ?? null,
    txBps: deviceSummaries[deviceId]?.txBps ?? null, updatedAt: Date.now()
  }
  const wan = info.interfaces.find(i => i.interface === 'wan' && i.up)
    || info.interfaces.find(i => i.interface === 'wan')
  const nic = wan?.l3_device || wan?.device || ''
  if (!nic) return summary
  try {
    const counters = await readInterfaceCounters(api, nic)
    if (!counters) return summary
    const now = Date.now()
    const previous = deviceCounterCache.get(deviceId)
    const rate = previous && previous.nic === nic
      ? bandwidthSample(previous.counters, counters, now - previous.at) : null
    deviceCounterCache.set(deviceId, { nic, counters, at: now })
    if (rate) {
      summary.rxBps = rate.rxBps
      summary.txBps = rate.txBps
    }
  } catch (_) {
    // Failed optional interface telemetry must not mark a logged-in router offline.
  }
  return summary
}
const viewMode = ref('list')
const selectedDeviceId = ref('')
const loginDialog = ref(false)
const deviceDialog = ref(false)
const editDeviceId = ref('')
const deleteDialog = ref(false)
const deleteDeviceId = ref('')
const loginRemember = ref(true)
const isNative = Capacitor.isNativePlatform()
const UiChrome = registerPlugin('UiChrome')
function syncNativeChrome(isDark) {
  const color = isDark ? '#11141B' : '#F5F6FB'
  document.documentElement.style.backgroundColor = color
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  if (isNative) {
    void UiChrome.setTheme({ dark: isDark }).catch(e =>
      console.warn('Android system bar theme sync unavailable', e))
  }
}
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
const terminalView = ref('dhcp4')
const wifiClientData = ref({ available: false, stations: [] })
const appFilterUsers = ref({ available: false, users: [] })
const diskData = ref({ available: false, partitions: [], primary: null, temporary: null })
const chosenInterface = ref('')
const bandwidthHistory = ref([])
const loadHistory = ref([])
const currentRate = ref(null)
const telemetryError = ref('')
const availableInterfaces = computed(() => interfaceOptions(snapshot.value?.interfaces || []))
const rxTxSeries = [{ key: 'rx', title: '接收 RX' }, { key: 'tx', title: '发送 TX' }]
const loadSeries = [
  { key: 'l1', title: '1 分钟' }, { key: 'l5', title: '5 分钟' },
  { key: 'l15', title: '15 分钟' }
]
const bandwidthSummary = computed(() => {
  const points = bandwidthHistory.value
  if (!points.length) return null
  const mean = key => points.reduce((sum, p) => sum + Number(p[key] || 0), 0) / points.length
  const peak = key => Math.max(...points.map(p => Number(p[key] || 0)))
  return {
    rxAverage: mean('rx').toFixed(1), txAverage: mean('tx').toFixed(1),
    rxPeak: peak('rx').toFixed(1), txPeak: peak('tx').toFixed(1)
  }
})
let samplePrevious = null
let samplePreviousAt = 0
let sampleBusy = false
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
  { id: 'parental', title: '家长控制', subtitle: '应用过滤与访问规则', icon: 'mdi-shield-account-outline' },
  { id: 'routes', title: '路由表', subtitle: '静态与运行路由', icon: 'mdi-routes' },
  { id: 'process', title: '进程', subtitle: '系统运行进程', icon: 'mdi-format-list-bulleted' },
  { id: 'startup', title: '启动项', subtitle: '开机启动服务', icon: 'mdi-power-plug-outline' },
  { id: 'wol', title: '网络唤醒', subtitle: '远程唤醒终端', icon: 'mdi-lan-connect' },
  { id: 'reboot', title: '重启设备', subtitle: '需要二次确认', icon: 'mdi-restart' },
  { id: 'reset', title: '恢复出厂', subtitle: '清除配置，请谨慎操作', icon: 'mdi-restore' }
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
let mediaQuery, systemListener, refreshTimer, probeTimer, telemetryTimer

watch(navStyle, v => localStorage.setItem(storage.nav, v))
watch(colorMode, v => localStorage.setItem(storage.theme, v))
watch(showIp, v => localStorage.setItem(storage.showIp, String(v)))
watch(showHostnames, v => localStorage.setItem(storage.showHostname, String(v)))
watch(routerListLayout, v => localStorage.setItem(storage.listLayout, v))
watch(dark, v => {
  theme.global.name.value = v ? 'dark' : 'light'
  syncNativeChrome(v)
}, { immediate: true })
watch(activeTab, (tab) => {
  if (connected.value) refreshCurrent()
  if (tab === 'statistics') void pollTelemetry()
  if (tab !== 'apps') toolPanel.value = ''
})
// Capture logical application destinations rather than raw WebView history.
// Android edge-back invokes the same handler as the explicit top-left back arrow.
const navigationTrail = []
let restoringNavigation = false
let nativeBackSubscription = null
let nativeResumeSubscription = null
const logicalRouteKey = computed(() => JSON.stringify({
  mode: viewMode.value,
  tab: viewMode.value === 'detail' ? activeTab.value : 'home',
  tool: viewMode.value === 'detail' && activeTab.value === 'apps' ? toolPanel.value : ''
}))
watch(logicalRouteKey, (next, previous) => {
  if (restoringNavigation || !previous || next === previous) return
  const former = JSON.parse(previous)
  // Never restore unrelated router details after a session is discarded.
  navigationTrail.push(former)
  if (navigationTrail.length > 40) navigationTrail.shift()
}, { flush: 'sync' })

function clearNavigationTrail() {
  navigationTrail.length = 0
}
function restoreRoute(previous) {
  restoringNavigation = true
  try {
    viewMode.value = previous.mode
    activeTab.value = previous.mode === 'detail' ? previous.tab : 'home'
    toolPanel.value = previous.mode === 'detail' && previous.tab === 'apps' ? previous.tool : ''
  } finally { restoringNavigation = false }
}

// Screen content > side drawer > modal > app hierarchy > Android task.
// A configured system back gesture must not immediately send the user home
// while the WebView is showing a detail page, tool, tab or popup.
async function handleBack() {
  if (factoryBusy.value || connecting.value || actionBusy.value) return 'busy'
  if (factoryDialog.value) { factoryDialog.value = false; return 'dialog' }
  if (confirmReboot.value) { confirmReboot.value = false; return 'dialog' }
  if (wolDeleteDialog.value) { wolDeleteDialog.value = false; return 'dialog' }
  if (deleteDialog.value) { deleteDialog.value = false; return 'dialog' }
  if (selectedClient.value) { selectedClient.value = null; return 'dialog' }
  if (loginDialog.value) { loginDialog.value = false; return 'dialog' }
  if (deviceDialog.value) { deviceDialog.value = false; return 'dialog' }
  if (drawerOpen.value) { drawerOpen.value = false; return 'drawer' }

  while (navigationTrail.length) {
    const previous = navigationTrail.pop()
    if (previous.mode === 'detail' && !connected.value) continue
    restoreRoute(previous)
    if (previous.mode === 'list') void refreshDeviceStatuses()
    return 'page'
  }
  if (viewMode.value === 'detail') {
    await goToDeviceList()
    return 'list'
  }
  // Root of the app: minimize (preserve session) instead of force-killing it.
  if (isNative) await CapacitorApp.minimizeApp()
  return 'root'
}

watch(chosenInterface, () => {
  samplePrevious = null
  samplePreviousAt = 0
  bandwidthHistory.value = []
  currentRate.value = null
  telemetryError.value = ''
})
function boundedAppend(list, value, limit = 75) {
  return [...list.slice(Math.max(0, list.length - limit + 1)), value]
}
async function pollTelemetry() {
  if (sampleBusy || !client.value || !connected.value || viewMode.value !== 'detail' ||
      activeTab.value !== 'statistics') return
  sampleBusy = true
  try {
    if (!chosenInterface.value) {
      const options = availableInterfaces.value
      chosenInterface.value = (options.find(x => x.logical === 'wan') || options[0])?.value || ''
    }
    const device = chosenInterface.value
    const now = Date.now()
    const [loadResult, countersResult] = await Promise.allSettled([
      readSystemLoad(client.value),
      device ? readInterfaceCounters(client.value, device) : Promise.resolve(null)
    ])
    const label = new Date(now).toLocaleTimeString('zh-CN', { hour12: false })
    if (loadResult.status === 'fulfilled' && loadResult.value) {
      const [l1, l5, l15] = loadResult.value
      loadHistory.value = boundedAppend(loadHistory.value, { time: label, l1, l5, l15 })
    }
    const counters = countersResult.status === 'fulfilled' ? countersResult.value : null
    if (counters) {
      const rate = bandwidthSample(samplePrevious, counters, now - samplePreviousAt)
      samplePrevious = counters
      samplePreviousAt = now
      if (rate) {
        currentRate.value = { rx: prettyRate(rate.rxBps), tx: prettyRate(rate.txBps) }
        bandwidthHistory.value = boundedAppend(bandwidthHistory.value, {
          time: label, rx: +(rate.rxBps / 1024).toFixed(2),
          tx: +(rate.txBps / 1024).toFixed(2)
        })
        telemetryError.value = ''
      }
    } else if (device) telemetryError.value = '接口未提供收发字节计数器，无法生成真实带宽曲线'
    else telemetryError.value = '没有可采样的网络接口'
  } catch (e) { telemetryError.value = shortError(e) }
  finally { sampleBusy = false }
}

function resetSession() {
  restoringNavigation = true
  clearNavigationTrail()
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
  wifiClientData.value = { available: false, stations: [] }
  appFilterUsers.value = { available: false, users: [] }
  diskData.value = { available: false, partitions: [], primary: null, temporary: null }
  bandwidthHistory.value = []
  loadHistory.value = []
  chosenInterface.value = ''
  samplePrevious = null
  samplePreviousAt = 0
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
  restoringNavigation = false
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
  deviceCounterCache.delete(id)
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
        // Preserve the previous state while an existing device is polled.
        // Only a newly added router should display the transient checking state.
        if (deviceStatuses[d.id] == null) deviceStatuses[d.id] = 'checking'
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
            deviceSummaries[d.id] = await makeDeviceSummary(api, result, d.id)
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
  restoringNavigation = true
  try {
    drawerOpen.value = false
    viewMode.value = 'list'
    activeTab.value = 'home'
    toolPanel.value = ''
    clearNavigationTrail()
  } finally { restoringNavigation = false }
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
    const [dashboardResult, partitionsResult] = await Promise.allSettled([
      readDashboard(client.value), readDiskUsage(client.value)
    ])
    if (dashboardResult.status === 'rejected') throw dashboardResult.reason
    snapshot.value = dashboardResult.value
    // A one-off disk RPC failure must not collapse an already visible disk card.
    // Keep last good data; initial loading still displays the unavailable state.
    if (partitionsResult.status === 'fulfilled' &&
        (partitionsResult.value.available || !diskData.value.available)) {
      diskData.value = partitionsResult.value
    }
    if (selectedDeviceId.value) {
      deviceSummaries[selectedDeviceId.value] =
        await makeDeviceSummary(client.value, snapshot.value, selectedDeviceId.value)
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
    if (activeTab.value === 'clients') {
      const [leases, stations, oafUsers] = await Promise.allSettled([
        readClients(client.value), readWirelessStations(client.value),
        client.value.call('appfilter', 'get_all_users', { flag: 3 }, true)
      ])
      if (leases.status === 'fulfilled') clientData.value = leases.value
      else throw leases.reason
      if (stations.status === 'fulfilled' &&
          (stations.value.available || !wifiClientData.value.available)) {
        wifiClientData.value = stations.value
      }
      if (oafUsers.status === 'fulfilled') {
        const rawUsers = oafUsers.value
        const list = rawUsers?.data?.list || rawUsers?.list
        appFilterUsers.value = {
          available: !!rawUsers, users: Array.isArray(list) ? list : []
        }
      }
    }
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
  if (toolId === 'reboot') { confirmReboot.value = true; return }
  if (toolId === 'reset') {
    factoryPhrase.value = ''
    factoryError.value = ''
    factoryDialog.value = true
    return
  }
  toolPanel.value = toolId
  toolMessage.value = ''
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
  if (isNative) {
    // Android can reapply its system-bar appearance after returning from a
    // settings page or another app, so restore both contrast and background.
    void CapacitorApp.addListener('resume', () => syncNativeChrome(dark.value))
      .then(listener => { nativeResumeSubscription = listener })
      .catch(e => console.warn('Android resume listener unavailable', e))
    void CapacitorApp.addListener('backButton', () => {
      void handleBack().catch(error => { errorMessage.value = shortError(error) })
    }).then(listener => { nativeBackSubscription = listener })
      .catch(error => { console.warn('Android back listener unavailable', error) })
  }
  // Browser smoke tests can exercise the same navigation function without
  // simulating hardware Android gestures. Never expose this in production.
  if (import.meta.env.DEV) {
    window.__xxwrtTestBack = handleBack
    window.__xxwrtTestRefreshDevices = refreshDeviceStatuses
    window.__xxwrtTestRefreshDashboard = refreshDashboard
  }
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mediaQuery.matches
  systemListener = e => { systemDark.value = e.matches }
  mediaQuery.addEventListener?.('change', systemListener)
  void refreshDeviceStatuses()
  probeTimer = setInterval(() => {
    if (viewMode.value === 'list') void refreshDeviceStatuses()
  }, 15000)
  telemetryTimer = setInterval(() => { void pollTelemetry() }, 3000)
  refreshTimer = setInterval(() => {
    if (viewMode.value === 'detail' && connected.value && activeTab.value === 'home' && !refreshing.value) refreshDashboard()
  }, 12000)
})
onUnmounted(() => {
  if (nativeBackSubscription) void nativeBackSubscription.remove()
  if (nativeResumeSubscription) void nativeResumeSubscription.remove()
  if (import.meta.env.DEV) {
    delete window.__xxwrtTestBack
    delete window.__xxwrtTestRefreshDevices
    delete window.__xxwrtTestRefreshDashboard
  }
  mediaQuery?.removeEventListener?.('change', systemListener)
  if (refreshTimer) clearInterval(refreshTimer)
  if (probeTimer) clearInterval(probeTimer)
  if (telemetryTimer) clearInterval(telemetryTimer)
})
</script>

<template>
  <v-app class="material-demo" :class="{ 'theme-is-dark': dark }">
    <v-app-bar flat color="surface" height="64" class="top-bar">
      <v-btn icon="mdi-menu" size="small" aria-label="打开侧栏菜单" @click="drawerOpen = !drawerOpen"/>
      <v-btn v-if="viewMode === 'detail'" icon="mdi-arrow-left" size="small" aria-label="返回上一页" @click="handleBack"/>
      <v-toolbar-title class="app-name">{{ viewMode === 'list' ? '我的 OpenWrt' : displayDeviceName(selectedDevice) }}</v-toolbar-title>
      <v-spacer />
      <v-btn v-if="viewMode === 'detail' && connected" icon="mdi-logout" size="small" aria-label="退出登录" @click="resetSession"/>
    </v-app-bar>

    <v-navigation-drawer v-model="drawerOpen" temporary location="left" width="304" class="material-side-drawer" aria-label="侧栏菜单">
      <div class="sidebar-brand">
        <v-avatar size="44" color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-router-wireless" size="27"/></v-avatar>
        <div><strong>XX-WRT M</strong><small>路由器管理</small></div>
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
          <v-divider class="my-4"/>
          <div class="sidebar-section-title"><v-icon icon="mdi-shield-eye-outline" size="19"/> 隐私保护</div>
          <v-switch v-model="showHostnames" label="显示路由器名称和主机名"
            color="primary" hide-details density="compact" class="privacy-switch"/>
          <v-switch v-model="showIp" label="显示 IP / 域名地址"
            color="primary" hide-details density="compact" class="privacy-switch"/>
          <p class="muted-hint mt-3">关闭后，设备列表和路由器首页使用掩码。仅影响界面显示，编辑设备时仍可查看实际配置，不会修改 OpenWrt 系统主机名。</p>
          <p class="muted-hint mt-2">底栏、隐私和主题设置保存在本机，所有路由器共用。</p>
        </template>
        <template v-else-if="drawerSection === 'language'">
          <div class="sidebar-section-title">语言设置</div>
          <p class="muted-hint">当前仅支持简体中文。</p>
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
          <v-btn block variant="tonal" prepend-icon="mdi-github" @click="showReleasePage">查看项目</v-btn>
        </template>
        <template v-else-if="drawerSection === 'about'">
          <div class="sidebar-section-title">关于</div>
          <p class="muted-hint">版本：{{ packageInfo.version }}</p>
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
            <div><h1>设备列表</h1></div>
            <div class="list-page-actions">
              <v-btn icon="mdi-refresh" variant="tonal" color="primary" :loading="probeBusy" aria-label="刷新设备状态" @click="refreshDeviceStatuses"/>
              <v-btn color="primary" rounded="xl" prepend-icon="mdi-plus" @click="showDeviceDialog()">添加</v-btn>
            </div>
          </div>
          <div class="router-list-toolbar">
            <v-btn-toggle v-model="routerListFilter" mandatory density="compact"
              rounded="lg" variant="tonal" color="primary" aria-label="设备在线状态筛选">
              <v-btn value="all" size="small">全部 {{ devices.length }}</v-btn>
              <v-btn value="online" size="small">可达 {{ reachableCount }}</v-btn>
              <v-btn value="offline" size="small">离线 {{ offlineCount }}</v-btn>
            </v-btn-toggle>
            <div class="router-list-tools">
              <v-btn size="small" variant="text"
                :icon="showIp ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
                :aria-label="showIp ? '隐藏路由器地址' : '显示路由器地址'"
                @click="showIp = !showIp"/>
              <v-btn size="small" variant="text"
                :icon="routerListLayout === 'card' ? 'mdi-view-list-outline' : 'mdi-view-grid-outline'"
                :aria-label="routerListLayout === 'card' ? '切换到列表模式' : '切换到卡片模式'"
                @click="routerListLayout = routerListLayout === 'card' ? 'list' : 'card'"/>
            </div>
          </div>
          <v-alert v-if="listError && !deviceDialog" type="warning" variant="tonal" closable density="compact" class="mb-3" @click:close="listError = ''">{{ listError }}</v-alert>
          <v-card v-if="!devices.length" rounded="xl" elevation="1" class="empty-devices">
            <v-avatar color="primary" variant="tonal" size="72"><v-icon icon="mdi-router-wireless" size="36"/></v-avatar>
            <h2>还没有添加 OpenWrt 设备</h2>
            <p>支持 IP、域名、HTTP、HTTPS 和不同端口。添加后会保留在首页。</p>
            <v-btn rounded="xl" color="primary" prepend-icon="mdi-plus" @click="showDeviceDialog()">添加第一个设备</v-btn>
          </v-card>
          <div v-else-if="!displayedDevices.length" class="router-list-empty">
            <v-icon icon="mdi-router-network" size="30" color="secondary"/>
            <span>此筛选条件下暂无设备</span>
          </div>
          <div v-else class="saved-device-grid" :class="{ 'saved-device-grid-compact': routerListLayout === 'list' }">
            <SavedRouterCard v-for="device in displayedDevices" :key="device.id"
              :device="device" :index="devices.findIndex(d => d.id === device.id)"
              :summary="deviceSummaries[device.id] || null"
              :status="deviceStatuses[device.id] || 'checking'"
              :layout="routerListLayout" :show-names="showHostnames" :show-address="showIp"
              @open="openDevice" @edit="showDeviceDialog" @remove="askDeleteDevice"/>
          </div>
          
        </template>
        <template v-else>
          <div class="page-head">
            <h1>{{ pageTitle }}</h1>
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
                <div><span>主机名</span><strong>{{ maskHostname(snapshot.board.hostname) }}</strong></div>
                <div><span>处理器</span><strong>{{ snapshot.board.system }}</strong></div>
                <div><span>内核版本</span><strong>{{ snapshot.board.kernel }}</strong></div>
                <div><span>温度</span><strong>{{ snapshot.temperature }}</strong></div>
                <div><span>本地时间</span><strong>{{ snapshot.localtime }}</strong></div>
                <div><span>运行时间</span><strong>{{ snapshot.uptime }}</strong></div>
              </div>
              <section class="detector-area">
                <div class="section-heading">
                  <h3 class="detector-title">联网检测</h3>
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

            <v-card v-if="snapshot && activeTab === 'home'" class="mt-4 network-card storage-card" rounded="xl" elevation="1">
              <div class="section-heading"><h2>磁盘占用</h2><v-icon icon="mdi-harddisk" color="secondary" size="22"/></div>
              <template v-if="diskData.available && diskData.partitions.length">
                <div class="storage-row" v-for="(partition, index) in diskData.partitions" :key="partition.device + partition.mount + index">
                  <div class="storage-label">
                    <div><strong>{{ partition.mount === '/overlay' ? '系统可写空间' : partition.mount === '/tmp' ? '临时空间' : partition.mount }}</strong>
                      <small>{{ partition.device }}</small></div>
                    <span>{{ partition.percent }}%</span>
                  </div>
                  <v-progress-linear :model-value="partition.percent" rounded height="5"
                    :color="partition.percent > 90 ? 'error' : partition.temporary ? 'secondary' : 'primary'"/>
                  <div class="muted-hint mt-1">{{ partition.usedText }} / {{ partition.totalText }}</div>
                </div>
              </template>
              <v-alert v-else type="info" variant="tonal" density="compact">
                无法读取磁盘分区信息。检查 QWRT 是否允许 file.exec 执行只读 df 命令。
              </v-alert>
            </v-card>

            <template v-if="snapshot && activeTab === 'statistics'">
              <v-card class="network-card mt-4" rounded="xl" elevation="1">
                <div class="section-heading"><h2>实时带宽</h2>
                  <v-chip color="primary" variant="tonal" size="small">3 秒采样</v-chip>
                </div>
                <v-select v-model="chosenInterface" label="选择网络接口" variant="outlined"
                  density="compact" hide-details="auto" :items="availableInterfaces"
                  item-title="title" item-value="value" class="mt-2 mb-3" :disabled="!availableInterfaces.length"/>
                <div class="bandwidth-kpis">
                  <div><span>接收 RX</span><strong>{{ currentRate?.rx || '--' }}</strong></div>
                  <div><span>发送 TX</span><strong>{{ currentRate?.tx || '--' }}</strong></div>
                </div>
                <RealtimeChart v-if="bandwidthHistory.length" :samples="bandwidthHistory"
                  :series="rxTxSeries" unit=" KB/s" title="实时网络带宽曲线"/>
                <v-alert v-else class="mt-3" type="info" density="compact" variant="tonal">
                  {{ telemetryError || '正在采集接口字节计数器，至少需要两个采样点才能计算速率' }}
                </v-alert>
                <div v-if="bandwidthSummary" class="bandwidth-summary">
                  <span>接收平均 {{ bandwidthSummary.rxAverage }} KB/s · 峰值 {{ bandwidthSummary.rxPeak }} KB/s</span>
                  <span>发送平均 {{ bandwidthSummary.txAverage }} KB/s · 峰值 {{ bandwidthSummary.txPeak }} KB/s</span>
                </div>
              </v-card>
              <v-card class="network-card mt-4" rounded="xl" elevation="1">
                <div class="section-heading"><h2>系统负载历史</h2>
                  <v-chip variant="tonal" size="small">1 / 5 / 15 分钟</v-chip>
                </div>
                <RealtimeChart v-if="loadHistory.length" :samples="loadHistory"
                  :series="loadSeries" title="系统负载历史曲线"/>
                <p v-else class="muted-hint">正在采集 system.info 负载信息</p>
              </v-card>
            </template>

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
              <v-tabs v-model="terminalView" show-arrows color="primary" density="compact" class="terminal-type-tabs mb-3">
                <v-tab value="dhcp4">DHCPv4 ({{ clientData.data.length }})</v-tab>
                <v-tab value="dhcp6">DHCPv6 ({{ clientData.ipv6.length }})</v-tab>
                <v-tab value="wireless">无线终端 ({{ wifiClientData.stations.length }})</v-tab>
                <v-tab value="oaf">应用用户 ({{ appFilterUsers.users.length }})</v-tab>
              </v-tabs>
              <template v-if="terminalView === 'dhcp4'">
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
              </template>
              <div v-if="terminalView === 'dhcp6'" class="terminal-grid">
                <v-card v-for="(item,index) in clientData.ipv6" :key="'dhcp6-'+index" variant="outlined" rounded="lg" class="terminal-tile">
                  <v-avatar size="42" rounded="lg" color="primary" variant="tonal"><v-icon icon="mdi-ip-network" size="22"/></v-avatar>
                  <div class="terminal-meta">
                    <div class="terminal-name">{{ item.hostname || item.name || 'IPv6 终端' }}</div>
                    <div class="terminal-ip terminal-ip6">{{ item.ip6addr || item.address || item.ip6addrs?.join(', ') || '--' }}</div>
                    <div class="terminal-mac">{{ item.duid || item.macaddr || '--' }}</div>
                  </div>
                </v-card>
                <p v-if="!clientData.ipv6.length" class="muted-hint">没有 DHCPv6 租约，或 QWRT 尚未返回 IPv6 租约。</p>
              </div>
              <div v-if="terminalView === 'wireless'">
                <div class="terminal-grid" v-if="wifiClientData.stations.length">
                  <v-card v-for="(item,index) in wifiClientData.stations" :key="'wifi-'+index" variant="outlined" rounded="lg" class="terminal-tile">
                    <v-avatar size="42" rounded="lg" color="primary" variant="tonal"><v-icon icon="mdi-wifi" size="22"/></v-avatar>
                    <div class="terminal-meta">
                      <div class="terminal-name">{{ item.mac }}</div>
                      <div class="terminal-ip">{{ item.device }} · 信号 {{ item.signal ?? '--' }} dBm</div>
                      <div class="terminal-mac">RX {{ item.rxRate ?? '--' }} · TX {{ item.txRate ?? '--' }}</div>
                    </div>
                  </v-card>
                </div>
                <v-alert v-else type="info" variant="tonal" density="compact">
                  {{ wifiClientData.available ? '当前没有已关联的无线终端' : 'QWRT 未开放 iwinfo RPC 或当前路由器没有 Wi-Fi 射频' }}
                </v-alert>
              </div>
              <div v-if="terminalView === 'oaf'">
                <div class="terminal-grid" v-if="appFilterUsers.users.length">
                  <v-card v-for="(item,index) in appFilterUsers.users" :key="'oaf-'+index" variant="outlined" rounded="lg" class="terminal-tile">
                    <v-avatar size="42" color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-shield-account-outline" size="22"/></v-avatar>
                    <div class="terminal-meta">
                      <div class="terminal-name">{{ item.nickname || item.hostname || item.mac || '未知用户' }}</div>
                      <div class="terminal-ip">{{ item.ip || item.ipaddr || '--' }}</div>
                      <div class="terminal-mac">{{ item.mac || '--' }} · {{ item.appname || item.app_name || '暂无应用记录' }}</div>
                    </div>
                  </v-card>
                </div>
                <v-alert v-else type="info" variant="tonal" density="compact">
                  {{ appFilterUsers.available ? '应用过滤用户列表为空' : '未安装 OpenAppFilter，或当前账号没有 appfilter RPC 权限' }}
                </v-alert>
              </div>
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
            <v-card v-if="networkHardware.wired.length || networkHardware.wireless.length"
              rounded="xl" elevation="1" class="network-card mb-4">
              <NetworkHardwareList :wired="networkHardware.wired" :wireless="networkHardware.wireless"/>
            </v-card>
            <v-card v-for="nic in snapshot?.interfaces || []" :key="nic.interface" rounded="xl" elevation="1" class="interface-card mb-3">
              <div class="section-heading">
                <div><strong>{{ nic.interface }}</strong><div class="muted-hint">{{ nic.proto || 'unknown' }} · {{ nic.device || nic.l3_device || '--' }}</div></div>
                <v-chip size="small" variant="tonal" :color="nic.up ? 'success' : 'error'">{{ nic.up ? '已连接' : '未连接' }}</v-chip>
              </div>
              <div class="network-interface-details">
                <div><span>IPv4</span><strong>{{ nic['ipv4-address']?.map(x => x.address + '/' + x.mask).join(', ') || '--' }}</strong></div>
                <div><span>IPv6</span><strong>{{ nic['ipv6-address']?.map(x => x.address + '/' + x.mask).join(', ') || '--' }}</strong></div>
                <div v-if="nic['ipv6-prefix']?.length"><span>IPv6-PD</span><strong>{{ nic['ipv6-prefix'].map(x => x.address + '/' + x.mask).join(', ') }}</strong></div>
                <div v-if="nic['ipv6-prefix-assignment']?.length"><span>IPv6-PD 分配</span><strong>{{ nic['ipv6-prefix-assignment'].map(x => x.address + '/' + x.mask).join(', ') }}</strong></div>
                <div v-if="nic['dns-server']?.length"><span>DNS</span><strong>{{ nic['dns-server'].join(' / ') }}</strong></div>
                <div v-if="nic.mtu"><span>MTU</span><strong>{{ nic.mtu }}</strong></div>
                <div v-if="nic.uptime !== undefined && nic.uptime !== null"><span>运行时间</span><strong>{{ formatInterfaceUptime(nic.uptime) }}</strong></div>
                <div v-if="nic.route?.length"><span>路由</span><strong>{{ nic.route.map(x => x.target + '/' + x.mask + ' → ' + (x.nexthop || '--')).join('; ') }}</strong></div>
              </div>
            </v-card>
          </template>

          <template v-if="activeTab === 'apps'">
            <template v-if="!toolPanel">
              <div class="app-launcher-heading">
                <div><h2>应用管理</h2><p>点击图标进入相应的路由器管理功能</p></div>
              </div>
              <div class="app-launcher-grid" role="group" aria-label="应用功能入口">
                <v-card v-for="tool in legacyTools" :key="tool.id" rounded="xl" variant="flat"
                  role="button" tabindex="0" class="app-launcher-tile" :aria-label="'打开' + tool.title"
                  @click="showLegacyTool(tool.id)" @keydown.enter.prevent="showLegacyTool(tool.id)">
                  <v-avatar rounded="lg" size="49" :color="tool.id === 'reset' ? 'error' : 'primary'" variant="tonal">
                    <v-icon :icon="tool.icon" size="25"/>
                  </v-avatar>
                  <strong>{{ tool.title }}</strong>
                  <span>{{ tool.subtitle }}</span>
                </v-card>
              </div>
              
            </template>
            <template v-else>
              <div class="app-subpage-heading">
                <v-btn icon="mdi-arrow-left" size="small" variant="text" aria-label="返回应用功能列表"
                  @click="toolPanel = ''; toolMessage = ''"/>
                <div><h2>{{ legacyTools.find(x => x.id === toolPanel)?.title || '功能详情' }}</h2>
                  <p>{{ legacyTools.find(x => x.id === toolPanel)?.subtitle }}</p></div>
                <v-btn icon="mdi-refresh" size="small" color="primary" variant="tonal" :loading="toolLoading"
                  aria-label="刷新当前功能" @click="showLegacyTool(toolPanel)"/>
              </div>
              <v-card rounded="xl" elevation="1" class="network-card app-subpage">
                <v-alert v-if="toolMessage" type="info" variant="tonal" density="compact" class="mb-3">{{ toolMessage }}</v-alert>
                <v-progress-linear v-if="toolLoading" indeterminate class="mb-3"/>
                <CompactManagementLists
                v-if="['process','startup','routes'].includes(toolPanel)"
                :kind="toolPanel"
                :processes="processData.processes"
                :services="serviceData.services"
                :static-routes="routeData.routes"
                :live-routes="liveRoutes.lines"
                :route-available="routeData.available || liveRoutes.available"
              />
              <div v-if="toolPanel === 'wol'" class="mt-3">
                <h3>网络唤醒</h3>
                <p class="muted-hint mb-2">需要路由器安装 WOL 插件并允许访问。</p>
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
            </template>
          </template>
          <div v-if="connected" class="device-page-meta" data-testid="device-page-meta" aria-label="设备地址和更新时间">
            <div class="device-page-meta-line">
              <v-icon icon="mdi-lan-connect" size="14"/>
              <span>{{ displayRouterAddress(client?.baseUrl) }}</span>
            </div>
            <div class="device-page-meta-line">
              <v-icon icon="mdi-clock-outline" size="14"/>
              <span>{{ lastUpdated ? '更新于 ' + lastUpdated : '已连接' }}</span>
            </div>
          </div>
        </template>
        <v-alert v-if="errorMessage && !connected" class="mt-4" type="error" variant="tonal">{{ errorMessage }}</v-alert>
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
          <p class="muted-hint mt-3">DHCP 租约不代表设备当前在线。</p>
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
        <v-card-title>连接 {{ displayDeviceName(selectedDevice) }}</v-card-title>
        <v-card-text>
          <p class="muted-hint mb-3">{{ displayRouterAddress(selectedDevice?.address) }}</p>
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
