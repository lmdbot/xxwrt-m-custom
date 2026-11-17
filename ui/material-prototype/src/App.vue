<script setup>
import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, shallowRef, watch } from 'vue'
import { useTheme, useDisplay } from 'vuetify'
import { V3_TABS, groupV3Tools, networkV3Tools, searchV3Features } from './services/featureCatalogV3.js'
import { useLabController } from './services/useLabController.js'
import { getDownloadDisplay } from './services/downloadDisplay.js'
import { createWaterSlosh } from './services/waterSlosh.js'
import { waterSurfacePath } from './services/waterSurfacePath.js'
import {
  APP_ICON_PRESETS, DEFAULT_APP_ICON, loadAppIconChoice,
  loadCustomAppIcon, saveAppIconChoice, storeCustomAppIcon
} from './services/appIconPreferences.js'
import classicAppIconBase64 from '../assets/icons/xxwrtm-classic.png.b64?raw'
import openwrtAppIconBase64 from '../assets/icons/openwrt-brand.png.b64?raw'
import { readLanDhcpStatus } from './services/networkInterfaceConfig.js'
import { describeNavigationMotion, playInterfaceMotion } from './services/motionEngine.js'
import { VGlass } from '@daisigu/vue-liquid-glass'
import { Browser } from '@capacitor/browser'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor, registerPlugin } from '@capacitor/core'
import packageInfo from '../package.json'
import {
  MOTION_PREFERENCE_KEY, readMotionPreference, motionAllowed,
  motionScrollBehavior, isCurrentTabRoot
} from './services/motionPreferences.js'
import { compareAppVersions, parseAppVersion } from './services/appReleases.js'
import {
  APP_FAVORITES_LIMIT, DEFAULT_APP_FAVORITES, readAppFavorites,
  writeAppFavorites,
  sortFavoriteTools, toggleAppFavorite, moveAppFavorite, isDangerousApp
} from './services/appLauncher.js'
import { formatLeaseDuration } from './services/leaseTime.js'
import { fetchLatestStableRelease, fetchGithubReleaseNotes } from './services/appUpdates.js'
import AppFilterPanel from './components/AppFilterPanel.vue'
import RouterAppsPanel from './components/RouterAppsPanel.vue'
import LuckyPanel from './components/LuckyPanel.vue'
import VlmcsdPanel from './components/VlmcsdPanel.vue'
import SoftwarePackagesPanel from './components/SoftwarePackagesPanel.vue'
import RouterOperationsPanel from './components/RouterOperationsPanel.vue'
import AdvancedManagementPanel from './components/AdvancedManagementPanel.vue'
import { METRIC_INTERVAL_MS, recordMetricSample } from './services/routerInsights.js'
import CompactManagementLists from './components/CompactManagementLists.vue'
import NetworkHardwareList from './components/NetworkHardwareList.vue'
import NetworkInterfacesPanel from './components/NetworkInterfacesPanel.vue'
import SavedRouterCard from './components/SavedRouterCard.vue'
import RealtimeChart from './components/RealtimeChart.vue'
import OpenSourceLicensesDialog from './components/OpenSourceLicensesDialog.vue'
import AboutPage from './components/AboutPage.vue'
import LabPanel from './components/LabPanel.vue'
import appIcon from '../assets/qwrt-chibi-openwrt-router.webp'
import { LANGUAGES, mountLocalization, savedLanguage, persistLanguage } from './services/localization.js'
import TerminalDeviceCard from './components/TerminalDeviceCard.vue'
import { readTerminalSettings, selectTerminalQosBackend, saveTerminalStaticIP, saveTerminalRateLimit, saveHqosGlobal } from './services/terminalManagement.js'
import { identifyDevice, deviceKindLabel, deviceDisplayName } from './services/deviceIdentity.js'
import {
  readDiskUsage, interfaceOptions, readInterfaceCounters, readSystemLoad,
  bandwidthSample, prettyRate, readWirelessStations
} from './services/telemetry.js'
import {
  loadDevices, saveDevices, newDevice, probeDevice,
  storeDevicePassword, fetchDevicePassword, deleteDevicePassword
} from './services/devices.js'
import {
  RouterClient, readDashboard, readClients, readServices, readInstalledRouterApps,
  readProcessList, readRouteConfig, readWolDevices, wakeWolDevice,
  saveWolTarget, removeWolTarget, readParentalSettings, saveParentalBase,
  readRuntimeRoutes, readNetworkHardware, formatBytes, shortError
} from './services/router.js'

const theme = useTheme()
const { smAndDown } = useDisplay()
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

const pages = V3_TABS
const storage = {
  host: 'xxwrt_material_router_url',
  nav: 'xxwrt_material_nav_style',
  theme: 'xxwrt_material_color_mode',
  showIp: 'xxwrt_material_list_show_ip',
  showHostname: 'xxwrt_material_list_show_hostname',
  listLayout: 'xxwrt_material_device_list_layout',
  motion: MOTION_PREFERENCE_KEY
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
const loginIgnoreTls = ref(false)
const isNative = Capacitor.isNativePlatform()
const UiChrome = registerPlugin('UiChrome')
const LauncherIcon = registerPlugin('LauncherIcon')
const appIconChoices = APP_ICON_PRESETS.map(item => ({
  ...item,
  src:item.id === 'anime' ? appIcon
    : 'data:image/png;base64,' + (item.id === 'classic' ? classicAppIconBase64.trim() : openwrtAppIconBase64.trim())
}))
const appIconChoice = ref(loadAppIconChoice(localStorage))
const customAppIconSrc = ref(loadCustomAppIcon(localStorage) || '')
const appIconBusy = ref(false)
const appIconMessage = ref('')
const currentAppIconSrc = computed(() =>
  appIconChoice.value === 'custom' && customAppIconSrc.value ? customAppIconSrc.value
    : appIconChoices.find(item => item.id === appIconChoice.value)?.src || appIcon
)
async function selectAppIcon(id) {
  if (appIconBusy.value || !['anime','classic','openwrt','custom'].includes(id)) return
  if (id === 'custom' && !customAppIconSrc.value) {
    appIconMessage.value = '请先上传一张图片'
    return
  }
  appIconBusy.value = true
  try {
    if (isNative && id !== 'custom') await LauncherIcon.setPreset({id})
    if (!saveAppIconChoice(localStorage,id)) throw new Error('无法保存图标偏好')
    appIconChoice.value = id
    appIconMessage.value = id === 'custom'
      ? '图片已应用到应用内；如需出现在手机桌面，请点击添加自定义桌面快捷方式'
      : isNative
        ? '已切换桌面预置图标；桌面启动器可能需要片刻刷新'
        : '已切换应用内图标；网页版不能更改手机桌面图标'
  } catch (error) { appIconMessage.value = '切换失败：' + shortError(error) }
  finally { appIconBusy.value = false }
}
function uploadAppIcon(dataUrl) {
  if (!storeCustomAppIcon(localStorage,dataUrl)) {
    appIconMessage.value = '上传图标保存失败，请检查图片大小与本机存储空间'
    return
  }
  customAppIconSrc.value = dataUrl
  void selectAppIcon('custom')
}
async function pinCustomAppIcon() {
  if (!isNative || !customAppIconSrc.value || appIconBusy.value) return
  appIconBusy.value = true
  try {
    await LauncherIcon.pinCustomShortcut({pngBase64:customAppIconSrc.value.split(',')[1]})
    appIconMessage.value = '已请求添加自定义桌面快捷方式，请在系统桌面弹窗中确认；原应用图标不受影响'
  } catch(error) { appIconMessage.value = '添加快捷方式失败：' + shortError(error) }
  finally { appIconBusy.value = false }
}
async function restoreDefaultAppIcon() {
  appIconChoice.value = DEFAULT_APP_ICON
  customAppIconSrc.value = ''
  if (isNative) {
    try {
      await LauncherIcon.setPreset({id:DEFAULT_APP_ICON})
      appIconMessage.value = '已恢复默认二次元桌面图标'
    } catch(error) {
      appIconMessage.value = '应用内图标已恢复，但桌面图标复位失败：' + shortError(error)
    }
  } else appIconMessage.value = '已恢复默认二次元图标'
}
const ApkDownloader = registerPlugin('ApkDownloader')
const installedVersion = ref(packageInfo.version)
const installedBuild = ref('')
const installedBuildDate = new Date(__XXWRT_BUILD_AT__).toLocaleString('zh-CN', { hour12: false })
const installedPackageId = ref('com.lmdbot.xxwrt.materialpreview')
const versionDetailsDialog = ref(false)
const privacyDialog = ref(false)
const latestRelease = shallowRef(null)
const updateChecking = ref(false)
const updateChecked = ref(false)
const updateError = ref('')
const updateNotice = ref('')
const updateDialog = ref(false)
const releaseNotesDialog = ref(false)
const releaseNotesLoading = ref(false)
const releaseNotesText = ref('')
const releaseNotesError = ref('')
const releaseNotesVersion = ref('')
const releaseNotesSource = ref('')
const releaseNotesBlocks = computed(() => String(releaseNotesText.value || '').split(/\r?\n/)
  .map(raw => {
    const line = raw.trim()
    if (!line) return null
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    const bullet = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(line)
    const plain = (heading?.[1] || bullet?.[1] || line)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
    return { kind: heading ? 'heading' : bullet ? 'bullet' : 'paragraph', text: plain }
  }).filter(Boolean))
const openSourceDialog = ref(false)
const downloadBusy = ref(false)
const downloadPercent = ref(0)
const downloadOutcome = ref('idle')
const downloadBytes = ref(0)
const downloadTotal = ref(0)
const downloadedApkReady = ref(false)
const installPermissionPending = ref(false)
let nativeApkProgressSubscription = null
let nativeApkProgressPromise = null
const updateAvailable = computed(() => !!latestRelease.value
  && compareAppVersions(latestRelease.value.version, installedVersion.value) > 0)
const downloadDisplay = computed(() => getDownloadDisplay({
  downloading: downloadBusy.value,
  downloadedApkReady: downloadedApkReady.value,
  outcome: downloadOutcome.value,
  receivedBytes: downloadBytes.value,
  totalBytes: downloadTotal.value,
  percent: downloadPercent.value
}))
const downloadProgressText = computed(() => downloadDisplay.value.sizeText)

function listenNativeApkProgress() {
  if (!nativeApkProgressPromise) {
    nativeApkProgressPromise = ApkDownloader.addListener('downloadProgress', progress => {
      if (!downloadBusy.value) return
      downloadBytes.value = Number(progress.receivedBytes || 0)
      downloadTotal.value = Number(progress.totalBytes || 0)
      downloadPercent.value = Math.max(0, Math.min(100, Number(progress.percent || 0)))
    }).then(listener => { nativeApkProgressSubscription = listener })
      .catch(error => { nativeApkProgressPromise = null; throw error })
  }
  return nativeApkProgressPromise
}

function handleInstallLaunch(result) {
  downloadOutcome.value = 'ready'
  downloadedApkReady.value = true
  installPermissionPending.value = result?.status === 'permissionRequired'
  if (installPermissionPending.value) {
    updateNotice.value = '已下载并校验 APK，请允许此 APP 安装应用；返回后将打开安装确认界面。'
  } else if (result?.status === 'installRequested') {
    updateNotice.value = 'APK 已校验并提交 Android 系统安装会话，等待系统弹出安装确认界面。'
  } else if (result?.status === 'installerOpened') {
    updateNotice.value = 'APK 已校验，已打开 Android 安装确认界面，请确认安装。'
  } else {
    updateError.value = 'Android 安装服务没有返回预期状态'
  }
}

async function installDownloadedApk() {
  if (!isNative || !downloadedApkReady.value || downloadBusy.value) return
  updateError.value = ''
  try {
    handleInstallLaunch(await ApkDownloader.installDownloaded())
  } catch (error) {
    updateError.value = '无法打开安装界面：' + shortError(error)
  }
}

async function showInstallFailureIfAny() {
  if (!isNative) return
  try {
    const result = await ApkDownloader.consumeInstallResult()
    if (result?.error) updateError.value = result.error
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Unable to read Android install result', error)
  }
}

async function continueInstallAfterPermission() {
  if (!installPermissionPending.value || !downloadedApkReady.value || downloadBusy.value) return
  installPermissionPending.value = false
  try {
    const permission = await ApkDownloader.checkInstallPermission()
    if (permission?.granted) await installDownloadedApk()
    else updateNotice.value = '尚未允许 APP 安装更新包，可点击“重新打开安装”再次授权。'
  } catch (error) {
    updateError.value = '安装权限检查失败：' + shortError(error)
  }
}

async function cancelApkDownload() {
  if (!downloadBusy.value || !isNative) return
  try { await ApkDownloader.cancel() }
  catch (error) { updateError.value = '无法取消下载：' + shortError(error) }
}

async function copyAboutVersion() {
  const details = ['XX-WRT v' + installedVersion.value,
    installedBuild.value ? 'Build ' + installedBuild.value : '',
    'Built ' + installedBuildDate,
    installedPackageId.value].filter(Boolean).join('\n')
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(details)
    else {
      const field = document.createElement('textarea')
      field.value = details
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      try {
        if (!document.execCommand('copy')) throw new Error('clipboard unavailable')
      } finally { field.remove() }
    }
    updateNotice.value = '已复制 APP 版本信息'
  } catch (_) {
    updateNotice.value = '复制失败，可在版本详情中长按选择文字'
  }
}

async function checkAppUpdates({ automatic = false } = {}) {
  if (updateChecking.value || downloadBusy.value) return
  updateChecking.value = true
  updateError.value = ''
  updateNotice.value = ''
  try {
    const next = await fetchLatestStableRelease()
    if (latestRelease.value?.tag !== next?.tag) {
      downloadedApkReady.value = false
      installPermissionPending.value = false
      downloadOutcome.value = 'idle'
    }
    latestRelease.value = next
    updateChecked.value = true
    if (automatic && isNative && updateAvailable.value && latestRelease.value.apkUrl) {
      const key = 'xxwrt_material_update_prompted_v1'
      if (localStorage.getItem(key) !== latestRelease.value.tag) {
        updateDialog.value = true
        localStorage.setItem(key, latestRelease.value.tag)
      }
    }
  } catch (error) {
    updateChecked.value = false
    if (!automatic) updateError.value = '检查更新失败：' + shortError(error)
  } finally {
    updateChecking.value = false
  }
}

async function downloadLatestApk() {
  const release = latestRelease.value
  if (!release?.apkUrl || !updateAvailable.value || downloadBusy.value) return
  updateError.value = ''
  updateNotice.value = ''
  if (!isNative) {
    try {
      await Browser.open({ url: release.apkUrl, windowName: '_blank' })
      updateNotice.value = '已打开 APK 下载地址，请在浏览器中查看下载状态。'
      updateDialog.value = false
    } catch (error) { updateError.value = '无法打开下载地址：' + shortError(error) }
    return
  }
  downloadBusy.value = true
  downloadOutcome.value = 'downloading'
  downloadedApkReady.value = false
  installPermissionPending.value = false
  downloadBytes.value = 0
  downloadTotal.value = release.apkSize || 0
  downloadPercent.value = 0
  try {
    await listenNativeApkProgress()
    const result = await ApkDownloader.download({
      url: release.apkUrl, filename: release.apkName,
      apkSize: release.apkSize, sha256: release.sha256 || null
    })
    handleInstallLaunch(result)
    updateDialog.value = false
  } catch (error) {
    const message = shortError(error)
    if (/下载已取消|cancel/i.test(message)) {
      downloadOutcome.value = 'cancelled'
      updateNotice.value = '已取消 APK 下载'
    } else {
      downloadOutcome.value = 'failed'
      updateError.value = 'APP 内下载或安装失败：' + message
    }
  } finally { downloadBusy.value = false }
}

function syncNativeChrome(isDark) {
  const color = isDark ? '#0F1727' : '#F3F7FD'
  document.documentElement.style.backgroundColor = color
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  if (isNative) {
    void UiChrome.setTheme({ dark: isDark }).catch(e =>
      console.warn('Android system bar theme sync unavailable', e))
  }
}
const listError = ref('')
const generalFeedbackOpen = ref(false)
const generalFeedbackText = computed(() => listError.value || updateError.value || updateNotice.value)
const generalFeedbackColor = computed(() => listError.value || updateError.value ? 'warning' : 'info')
watch(generalFeedbackText, value => { generalFeedbackOpen.value = Boolean(value) })
function dismissGeneralFeedback() {
  generalFeedbackOpen.value = false
  listError.value = ''
  updateError.value = ''
  updateNotice.value = ''
}
const deviceStatuses = reactive({})
const deviceSummaries = reactive({})
const deviceForm = reactive({ name: '', address: 'http://192.168.100.1', username: 'root', ignoreTlsErrors: false })
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
// User setting defaults ON, but OS "Reduce motion" always takes precedence.
const motionEnabled = ref(readMotionPreference(localStorage))
const systemReducedMotion = ref(false)
const effectiveMotion = computed(() => motionAllowed(motionEnabled.value, systemReducedMotion.value))
const waterMetricsRoot = ref(null)
const waterPageVisible = ref(true)
const waterSlosh = createWaterSlosh({getContainer: () => waterMetricsRoot.value})
function updateWaterPageVisibility() { waterPageVisible.value = !document.hidden }
provide('xxwrt-motion-enabled', effectiveMotion)
const appLocale = ref(savedLanguage())
const selectedLanguage = computed(() => LANGUAGES.find(option => option.code === appLocale.value)?.name || '简体中文')
let localizationController = null
const settingsOpen = ref(false)
const settingsCategory = ref('settings')
const settingsTrail = []
const moreCategories = [
  { id: 'router', title: '路由器', description: '设备管理、连接与系统信息', icon: 'mdi-router-wireless' },
  { id: 'settings', title: '设置', description: '显示、隐私、刷新、实验室、语言', icon: 'mdi-cog-outline' },
  { id: 'about', title: '关于', description: '帮助、反馈与版本', icon: 'mdi-information-outline' },
  { id: 'help', title: '帮助与反馈', description: '使用说明与问题反馈', icon: 'mdi-help-circle-outline' }
]
const settingsCategories = [
  { id: 'display', title: '显示与外观', description: '深浅主题 / 底栏样式', icon: 'mdi-theme-light-dark' },
  { id: 'privacy', title: '隐私与安全', description: '名称与地址隐藏', icon: 'mdi-shield-lock-outline' },
  { id: 'refresh', title: '刷新与同步', description: '数据更新和刷新策略', icon: 'mdi-refresh' },
  { id: 'language', title: '语言', description: '简体中文 / 繁體中文 / English', icon: 'mdi-translate' },
  { id: 'lab', title: '实验室', description: '高级选项与实验功能', icon: 'mdi-flask-outline' }
]
const settingsPage = computed(() =>
  [...moreCategories, ...settingsCategories].find(category => category.id === settingsCategory.value) || moreCategories[1]
)
const hideHostnames = computed({
  get: () => !showHostnames.value,
  set: value => { showHostnames.value = !value }
})
const hideIpAddresses = computed({
  get: () => !showIp.value,
  set: value => { showIp.value = !value }
})
const clientSearch = ref('')
const terminalSortMode = ref('default')
const terminalDevices = computed(() => {
  const byMac = new Map()
  const wechatRecords = clientData.value.wechatRecords || []
  const wechatByMac = new Map(wechatRecords.map(item => [String(item.mac || '').toUpperCase(), item]))
  const wechatAliases = new Map(clientData.value.wechatAliases || [])
  const add = (raw, source) => {
    const mac = String(raw.mac || raw.macaddr || '').toUpperCase()
    const key = mac || String(raw.ip || raw.ip6addr || raw.address || raw.name || `${source}:${raw.sourceIndex ?? byMac.size}`)
    let item = byMac.get(key)
    if (!item) {
      item = { ...raw, mac, sources: new Set(), wifi: null }
      byMac.set(key, item)
    } else {
      item.name = item.name || raw.name || raw.hostname || ''
      item.identityName = item.identityName || raw.identityName || raw.hostname || ''
      item.ip = item.ip && item.ip !== '--' ? item.ip : (raw.ip || raw.ip4 || '')
      item.ip6 = item.ip6 || raw.ip6 || raw.ip6addr || raw.address || ''
      item.expires = item.expires ?? raw.expires
      item.online = item.online === true || raw.online === true
      item.onlineKnown = item.onlineKnown === true || raw.onlineKnown === true
    }
    item.sources.add(source)
    if (source === 'wireless') {
      item.wifi = raw
      item.online = true
      item.onlineKnown = true
    }
    return item
  }
  clientData.value.data.forEach(item => add(item, 'dhcp4'))
  clientData.value.ipv6.forEach(item => add({
    ...item, ip: item.ip4 || '', ip6: item.ip || item.ip6addr || '',
    name: item.name || item.hostname || ''
  }, 'dhcp6'))
  wifiClientData.value.stations.forEach(item => {
    const hint = clientData.value.hints?.[item.mac] || clientData.value.hints?.[item.mac?.toUpperCase()] || {}
    add({
      ...item, name: hint.name || '', ip: hint.ipaddrs?.[0] || '',
      ip6: hint.ip6addrs?.[0] || '', online: true, onlineKnown: true
    }, 'wireless')
  })
  // WeChatPush sees some always-on devices on a downstream AP even when
  // they have no fresh DHCP lease or a locally associated Wi-Fi station.
  // Add only active online devices as standalone entries; cached offline
  // devices are used solely to enrich other known DHCP/OAF records.
  wechatRecords.filter(item => item.status === 'online').forEach(item => {
    add({ ...item, name: item.name || '', online: true, onlineKnown: true,
      monitorStatus: 'online' }, 'wechatpush')
  })
  // OpenAppFilter users are another discovery source, not proof of being online.
  // Merge by MAC so one terminal does not appear twice across DHCP, Wi-Fi and apps.
  appFilterUsers.value.users.forEach((user, index) => add({
    ...user,
    name: user.nickname || user.name || user.hostname || '',
    ip: user.ip || user.ipaddr || '',
    sourceIndex: index,
    online: false,
    onlineKnown: false
  }, 'oaf'))
  return [...byMac.values()].map(item => {
    const mac = String(item.mac || '').toUpperCase()
    const monitored = wechatByMac.get(mac)
    if (monitored) item.sources.add('wechatpush')
    const alias = wechatAliases.get(mac.toLowerCase()) ||
      wechatAliases.get(String(item.ip || '').toLowerCase()) || ''
    // Alias is explicit user configuration. Monitor name is the next best
    // source, with the DHCP / host hint and device identity as fallbacks.
    const hostname = alias || monitored?.name || item.name || item.hostname || ''
    const identity = identifyDevice(item.identityName || item.name || item.hostname, mac)
    const status = monitored?.status === 'online' || monitored?.status === 'offline'
      ? monitored.status : null
    const online = status ? status === 'online' : item.online === true
    const onlineKnown = status !== null || item.onlineKnown === true
    const connectionType = monitored?.connectionType ||
      (item.wifi ? 'wireless' : '')
    const connectionBand = monitored?.band || ''
    return {
      ...item,
      name: hostname,
      identity,
      kind: deviceKindLabel(identity),
      displayName: deviceDisplayName(hostname, identity),
      sources: [...item.sources],
      active: online && connectionType === 'wireless',
      online,
      onlineKnown,
      monitorStatus: status || item.monitorStatus || '',
      connectionType,
      connectionBand,
      privateMac: identity.privateMac
    }
  })
})
const filteredClients = computed(() => {
  const term = String(clientSearch.value || '').trim().toLowerCase()
  const sourceList = terminalView.value === 'all' ? terminalDevices.value
    : terminalDevices.value.filter(item =>
      terminalView.value === 'wireless'
        ? item.online && item.connectionType === 'wireless'
        : item.sources.includes(terminalView.value))
  const visible = sourceList.filter(item => {
    const online = item.online === true
    if (terminalOnlineFilter.value === 'online' && !online) return false
    if (terminalOnlineFilter.value === 'other' && online) return false
    return !term || [item.displayName, item.kind, item.ip, item.ip6, item.mac, item.identity.brand?.n]
      .some(value => String(value || '').toLowerCase().includes(term))
  })
  if (terminalSortMode.value === 'name') {
    return visible.sort((a, b) =>
      String(a.displayName || a.name || '').localeCompare(String(b.displayName || b.name || ''), 'zh-CN', { numeric: true }))
  }
  if (terminalSortMode.value === 'ip') {
    return visible.sort((a, b) =>
      String(a.ip || a.ip6 || '').localeCompare(String(b.ip || b.ip6 || ''), 'en', { numeric: true }))
  }
  return visible
})
function onlineStateForMac(mac) {
  const normalized = String(mac || '').toUpperCase()
  const item = terminalDevices.value.find(device => device.mac === normalized)
  if (!item) return 'unknown'
  if (item.online) return 'online'
  return item.onlineKnown ? 'offline' : 'unknown'
}
const colorMode = ref(localStorage.getItem(storage.theme) || 'system')
const activeTab = ref('home')
const networkOriginTab = ref('') // preserve originating tab for network quick actions
const homeDetailsExpanded = ref(false)
const overviewFocusedMetric = ref('')
const previousContentTab = ref('home')
// V3 keeps legacy panel identifiers/RPC flows, while the visible navigation
// follows the feature's real home section instead of forcing the Tools tab.
const toolOriginTab = ref('')
const networkSection = ref('hub')
const currentNavTab = computed(() =>
  (activeTab.value === 'statistics' || toolOriginTab.value === 'statistics')
    ? 'home' : activeTab.value === 'network' && networkOriginTab.value
      ? networkOriginTab.value : (toolOriginTab.value || activeTab.value))
const networkSectionTitle = computed(() => ({
  interfaces: '网络接口', devices: '物理设备', wireless: '无线设备'
})[networkSection.value] || '网络')
function openDetailedMonitor() {
  if (!connected.value) return
  toolPanel.value = ''
  toolOriginTab.value = ''
  activeTab.value = 'statistics'
}
function openNetworkSection(section) {
  if (!['interfaces', 'devices', 'wireless'].includes(section)) return
  networkSection.value = section
  networkView.value = section
}
function openOverviewInterfaces() {
  if (!connected.value) return
  networkOriginTab.value = 'home'
  openNetworkSection('interfaces')
  activeTab.value = 'network'
}
// KPI navigation expands the detail and aligns its actual destination in view.
async function focusHomeDetail(id) {
  homeDetailsExpanded.value = true
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'center' })
}
async function toggleHomeDetails() {
  homeDetailsExpanded.value = !homeDetailsExpanded.value
  if (homeDetailsExpanded.value) await focusHomeDetail('overview-system-details')
}
async function openOverviewMetric(label) {
  if (!connected.value) return
  if (label === '终端') { navigateBottomTab('clients'); return }
  if (label === '联网监测') { launchV3Tool('detector'); return }
  const destinations = {
    'CPU 占用': 'overview-detail-cpu',
    '内存占用': 'overview-detail-memory',
    '温度': 'overview-detail-temperature',
    '存储': 'overview-detail-storage'
  }
  if (!destinations[label]) return
  overviewFocusedMetric.value = label
  await focusHomeDetail(destinations[label])
}
function launchV3Tool(id) {
  if (!connected.value || toolLoading.value) return
  // Back returns to the invoking page, not an unrelated tool catalog.
  // Canonical feature ownership is expressed by its single list entry.
  toolOriginTab.value = activeTab.value === 'apps' ? '' : activeTab.value
  activeTab.value = 'apps'
  void showLegacyTool(id)
}
const systemDark = ref(false)
const dark = computed(() => colorMode.value === 'dark' || (colorMode.value === 'system' && systemDark.value))
function toggleQuickTheme() { colorMode.value = dark.value ? 'light' : 'dark' }
const pageTitle = computed(() => activeTab.value === 'statistics' ? '详细监控'
  : pages.find(page => page.id === currentNavTab.value)?.label || '概览')
const toolbarSection = computed(() => {
  if (settingsOpen.value || activeTab.value === 'more') return ''
  if (viewMode.value !== 'detail' || !connected.value) return ''
  if (toolPanel.value) return legacyTools.find(x => x.id === toolPanel.value)?.title || '工具详情'
  if (activeTab.value === 'apps' && pluginDirectoryOpen.value) return '插件中心'
  if (activeTab.value === 'network' && networkSection.value !== 'hub') return networkSectionTitle.value
  return ''
})
function closeAppTool() {
  if (toolPanel.value === 'packages' && softwarePackagesPanel.value?.handleBack?.()) return
  if (routerOperationsToolIds.includes(toolPanel.value) && routerOperationsPanel.value?.handleBack?.()) return
  if (advancedToolIds.includes(toolPanel.value) && advancedManagementPanel.value?.handleBack?.()) return
  if (routerAppToolIds.includes(toolPanel.value) && routerAppsPanel.value?.handleBack?.()) return
  toolPanel.value = ''
  toolMessage.value = ''
  if (toolOriginTab.value) {
    const origin = toolOriginTab.value
    toolOriginTab.value = ''
    activeTab.value = origin
  }
}
const client = shallowRef(null)
const connected = ref(false)
const waterSloshEnabled = computed(() => effectiveMotion.value && waterPageVisible.value &&
  connected.value && viewMode.value === 'detail' && activeTab.value === 'home' &&
  !settingsOpen.value)
watch([waterSloshEnabled, waterMetricsRoot], ([enabled, root]) => {
  if (enabled && root) void waterSlosh.start()
  else waterSlosh.stop()
}, { flush: 'post' })
const connecting = ref(false)
const refreshing = ref(false)
const errorMessage = ref('')
const lastUpdated = ref('')
const snapshot = ref(null)
const {
  labSettings, labIntervals, labCards, labRpcRecords, labAlternate,
  labSmartBusy, labSmartMessage, labGlobalMessage, labRpcMessage, labHealthBusy, labDeepRows, labHealthRows,
  applyLabSettings, setLabRefreshProfile, setLabCustomInterval,
  setLabCardVisibility, moveLabCard, resetLabCards, toggleLabRpc,
  copyLabRpc, clearRpcTrace, resetLabAll, pairLabAlternative, unpairLabAlternative,
  swapLabConnection, maybeLabFailover, runLabHealthCheck
} = useLabController({
  storage: localStorage, selectedDeviceId, selectedDevice, connected,
  client, snapshot, sessions,
  onRefreshSettingsChange: () => restartLabRefreshTimers(),
  onAppIconReset: () => { void restoreDefaultAppIcon() },
  onConnectionSwitched: ({ automatic }) => {
    if (automatic) refreshQueued = true
    else void refreshDashboard()
  }
})
const clientData = ref({ data: [], ipv6: [], wechatRecords: [], wechatAliases: [],
  wechatInstalled: false, leasesAvailable: false })
const clientsPrefetching = ref(false)
let clientFetchToken = 0
const terminalView = ref('all')
const terminalOnlineFilter = ref('all')
const showTerminalSourceFilters = ref(false)
const wifiClientData = ref({ available: false, stations: [] })
const appFilterUsers = ref({ available: false, users: [] })
const terminalCategories = computed(() => [
  { value: 'all', label: '全部终端', count: terminalDevices.value.length, icon: 'mdi-devices' },
  { value: 'dhcp4', label: 'DHCPv4', count: clientData.value.data.length, icon: 'mdi-laptop' },
  { value: 'dhcp6', label: 'DHCPv6', count: clientData.value.ipv6.length, icon: 'mdi-ip-network' },
  { value: 'wireless', label: '无线终端', count: terminalDevices.value.filter(item => item.online && item.connectionType === 'wireless').length, icon: 'mdi-wifi' },
  ...(clientData.value.wechatInstalled ? [{
    value: 'wechatpush', label: '微信推送', count: terminalDevices.value.filter(item => item.sources.includes('wechatpush')).length,
    icon: 'mdi-message-badge-outline'
  }] : []),
  { value: 'oaf', label: '应用用户', count: terminalDevices.value.filter(item => item.sources.includes('oaf')).length, icon: 'mdi-account-group-outline' }
])
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
    rxAverage: prettyRate(mean('rx') * 1024), txAverage: prettyRate(mean('tx') * 1024),
    rxPeak: prettyRate(peak('rx') * 1024), txPeak: prettyRate(peak('tx') * 1024)
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
const terminalDetailEditor = ref('')
const terminalSettings = ref(null)
const terminalSettingsBusy = ref(false)
const terminalSaving = ref(false)
const terminalError = ref('')
const terminalNotice = ref('')
const terminalForm = reactive({ staticEnabled: false, staticIp: '', name: '', download: '', upload: '', connections: '0' })
const qosWriteConfirm = ref(false)
const hqosGlobalDialog = ref(false)
const hqosGlobalConfirm = ref(false)
const hqosGlobalBusy = ref(false)
const hqosGlobalForm = reactive({ enabled: false, backend: 'auto', interface: 'br-lan' })
const hqosBackendOptions = [
  { title: '自动', value: 'auto' },
  { title: '联发科 PPE / QDMA', value: 'mtk-ppe' },
  { title: 'Airoha PPE / QDMA', value: 'airoha-ppe' },
  { title: 'CPU / 软件 Flow Offloading', value: 'cpu' }
]
const hqosInterfaceOptions = computed(() => Array.from(new Set([
  'br-lan', 'lan', terminalSettings.value?.hqosStatus?.interface,
  ...(snapshot.value?.interfaces || []).flatMap(nic =>
    [nic.device, nic.l3_device, nic.interface].filter(Boolean))
].filter(Boolean))))
let terminalRequestId = 0

function applyTerminalSettings(settings) {
  terminalSettings.value = settings
  terminalForm.staticEnabled = settings.staticEnabled
  terminalForm.staticIp = settings.staticIP || ''
  const dhcpName = settings.host?.name || selectedClient.value?.identityName || ''
  terminalForm.name = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(dhcpName)
    ? dhcpName : ''
  terminalForm.download = settings.rates.download == null ? '' : String(settings.rates.download)
  terminalForm.upload = settings.rates.upload == null ? '' : String(settings.rates.upload)
  terminalForm.connections = String(settings.connections ?? 0)
}
function changeTerminalQosBackend(backendId) {
  if (terminalSaving.value || hqosGlobalBusy.value || !terminalSettings.value) return
  const selected = selectTerminalQosBackend(terminalSettings.value, backendId)
  terminalSettings.value = selected
  terminalForm.download = selected.rates.download == null ? '' : String(selected.rates.download)
  terminalForm.upload = selected.rates.upload == null ? '' : String(selected.rates.upload)
  terminalForm.connections = String(selected.connections ?? 0)
  terminalError.value = ''
  terminalNotice.value = ''
}
async function openTerminal(item) {
  if (terminalSaving.value) return
  selectedClient.value = item
  terminalDetailEditor.value = ''
  terminalSettings.value = null
  terminalError.value = ''
  terminalNotice.value = ''
  const id = ++terminalRequestId
  const api = client.value
  terminalSettingsBusy.value = true
  try {
    const settings = await readTerminalSettings(api, item)
    if (id === terminalRequestId && api === client.value && selectedClient.value?.mac === item.mac) {
      applyTerminalSettings(settings)
    }
  } catch (error) {
    if (id === terminalRequestId) terminalError.value = shortError(error)
  } finally {
    if (id === terminalRequestId) terminalSettingsBusy.value = false
  }
}
async function refreshTerminalSettings() {
  if (!selectedClient.value || !client.value) return
  const settings = await readTerminalSettings(client.value, selectedClient.value,
    terminalSettings.value?.selectedBackend || '')
  applyTerminalSettings(settings)
}
async function saveTerminalStatic() {
  if (!terminalSettings.value || !client.value || terminalSaving.value) return
  terminalSaving.value = true
  terminalError.value = ''
  terminalNotice.value = ''
  try {
    const result = await saveTerminalStaticIP(client.value, selectedClient.value, terminalSettings.value,
      { enabled: terminalForm.staticEnabled, ip: terminalForm.staticIp, name: terminalForm.name })
    terminalNotice.value = result.message + (result.applied ? '。新 IP 通常在终端重新获取 DHCP 租约后生效。' : '')
    await refreshTerminalSettings()
    void fetchClientsInBackground(client.value)
  } catch (error) {
    terminalError.value = shortError(error)
  } finally {
    terminalSaving.value = false
  }
}
function openHqosGlobalSettings() {
  const status = terminalSettings.value?.hqosStatus
  if (!status?.rpcReady) return
  hqosGlobalForm.enabled = status.enabled
  hqosGlobalForm.backend = status.mode
  hqosGlobalForm.interface = status.interface || 'br-lan'
  hqosGlobalDialog.value = true
}
async function persistHqosGlobalSettings() {
  if (hqosGlobalBusy.value || !terminalSettings.value || !client.value) return
  hqosGlobalConfirm.value = false
  hqosGlobalBusy.value = true
  terminalError.value = ''
  terminalNotice.value = ''
  try {
    const result = await saveHqosGlobal(client.value, terminalSettings.value,
      { ...hqosGlobalForm, allowConflict: true })
    terminalNotice.value = result.message
    hqosGlobalDialog.value = false
    await refreshTerminalSettings()
  } catch (error) {
    terminalError.value = shortError(error)
  } finally {
    hqosGlobalBusy.value = false
  }
}
async function saveTerminalQos(confirmedRisks = false) {
  const settings = terminalSettings.value
  if (!settings?.backend || !client.value || terminalSaving.value) return
  const wantsRule = [terminalForm.upload, terminalForm.download,
    settings.backend === 'hqos' ? terminalForm.connections : null]
    .some(value => value != null && String(value).trim() !== '' && Number(value) > 0)
  const enablesHqos = settings.backend === 'hqos' &&
    !settings.hqosStatus.enabled && wantsRule
  if (!confirmedRisks && (enablesHqos || (wantsRule && settings.conflicts?.length))) {
    qosWriteConfirm.value = true
    return
  }
  terminalSaving.value = true
  terminalError.value = ''
  terminalNotice.value = ''
  try {
    const result = await saveTerminalRateLimit(client.value, selectedClient.value, terminalSettings.value,
      { upload: terminalForm.upload, download: terminalForm.download,
        connections: terminalForm.connections,
        name: terminalSettings.value.backend === 'hqos'
          ? terminalSettings.value.hqosRule?.name || selectedClient.value?.displayName ||
            selectedClient.value?.name || '' : '',
        allowEnable: confirmedRisks, allowConflict: confirmedRisks })
    terminalNotice.value = result.message
    await refreshTerminalSettings()
  } catch (error) {
    terminalError.value = shortError(error)
  } finally {
    terminalSaving.value = false
  }
}
const toolPanel = ref('')
const routerAppsPanel = ref(null)
const luckyPanel = ref(null)
const vlmcsdPanel = ref(null)
const softwarePackagesPanel = ref(null)
const routerOperationsPanel = ref(null)
const routerOperationsToolIds = ['diagnostics', 'logs', 'backup', 'dnsdhcp', 'services']
const advancedManagementPanel = ref(null)
const advancedToolIds = ['ddns', 'cron', 'capabilities', 'audit', 'trends', 'security']
// Detection results include a non-configurable frozen __evidence object.
// Vue deep reactive proxies violate proxy invariants on that object: keep
// the immutable snapshot as-is and react only when it is replaced.
const installedRouterApps = shallowRef(null)
const installedRouterAppsLoading = ref(false)
let installedRouterAppsRequest = 0
const routerAppToolIds = ['ssr', 'wechatpush', 'openclash', 'detector', 'carbon', 'zerotier', 'firewall']
const toolLoading = ref(false)
const legacyLoadStatus = reactive({ process: 'idle', startup: 'idle', routes: 'idle' })
const legacyLoadError = ref('')
const toolMessage = ref('')
const toolFeedbackOpen = ref(false)
const toolWaiting = computed(() => toolLoading.value || wolBusy.value || actionBusy.value)
const toolFeedbackText = computed(() => toolMessage.value || (toolWaiting.value ? '正在执行操作，请稍候…' : ''))
function dismissToolFeedback() {
  if (toolWaiting.value) return
  toolFeedbackOpen.value = false
  toolMessage.value = ''
}
const processData = ref({ available: false, processes: [] })
const routeData = ref({ available: false, routes: [] })
const liveRoutes = ref({ available: false, lines: [] })
const wolData = ref({ available: false, statusKnown: false, tool: '', targets: [], interfaces: [], known: [], neighbors: [] })
const wolLoadStatus = ref('idle') // idle | loading | ready | error
const wolForm = reactive({ name: '', mac: '', iface: '', broadcast: false })
const wolTab = ref('targets')
const wolNeighborSearch = ref('')
const filteredWolNeighbors = computed(() => {
  const term = String(wolNeighborSearch.value || '').trim().toLowerCase()
  if (!term) return wolData.value.neighbors
  return wolData.value.neighbors.filter(item =>
    [item.name, item.ip, item.mac].some(value => String(value || '').toLowerCase().includes(term)))
})
const wolBusy = ref(false)
watch([toolFeedbackText, toolWaiting], () => {
  toolFeedbackOpen.value = Boolean(toolFeedbackText.value)
})
const wolDeleteDialog = ref(false)
const wolDeleteTarget = ref(null)
const parentalData = ref({ available: false, base: {}, status: {}, advanced: {}, selectedRules: [], users: [] })
const parentalForm = reactive({ enable: false, record_enable: false, work_mode: 0 })
const parentalSaving = ref(false)
const networkHardware = ref({ wiredAvailable: false, wirelessAvailable: false, wired: [], wireless: [] })
const lanDhcpStatus = ref({ dhcp4: null, dhcp6: null })
const networkInterfacesPanel = ref(null)
const networkView = ref('interfaces')
const networkInterfaces = computed(() =>
  (snapshot.value?.interfaces || []).filter(item => item.interface !== 'loopback'))
function ipv6ValidSeconds(nic) {
  const lifetime = [...(nic?.['ipv6-prefix'] || []), ...(nic?.['ipv6-address'] || [])]
    .map(item => Number(item?.valid))
    .find(value => Number.isFinite(value) && value >= 0 && value < 4294967295)
  return lifetime ?? null
}
const networkCategories = computed(() => [
  { value: 'interfaces', label: '接口', count: networkInterfaces.value.length, icon: 'mdi-lan' },
  { value: 'devices', label: '设备', count: networkHardware.value.wired.length, icon: 'mdi-ethernet' },
  { value: 'wireless', label: '无线', count: networkHardware.value.wireless.length, icon: 'mdi-wifi' }
])
const ethernetPorts = computed(() => networkHardware.value.wired
  .filter(item => /^(eth|en|ge|port)/i.test(item.name || ''))
  .sort((a, b) => {
    // Physical ports are ordered by their trailing numeric index, not the
    // order returned by ubus (which may change after an interface restart).
    const number = name => Number(String(name || '').match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
    const indexDiff = number(a.name) - number(b.name)
    return indexDiff || String(a.name || '').localeCompare(String(b.name || ''), undefined,
      { numeric: true, sensitivity: 'base' })
  }))
const legacyTools = [
  { id: 'parental', title: '家长控制', subtitle: '应用过滤与访问规则', icon: 'mdi-shield-account-outline' },
  { id: 'routes', title: '路由表', subtitle: '静态与运行路由', icon: 'mdi-routes' },
  { id: 'process', title: '进程', subtitle: '系统运行进程', icon: 'mdi-format-list-bulleted' },
  { id: 'startup', title: '启动项', subtitle: '开机启动服务', icon: 'mdi-power-plug-outline' },
  { id: 'wol', title: '网络唤醒', subtitle: '远程唤醒终端', icon: 'mdi-lan-connect' },
  { id: 'packages', title: '软件包', subtitle: '安装、卸载、更新与软件源配置', icon: 'mdi-package-variant-closed' },
  { id: 'diagnostics', title: '网络诊断', subtitle: 'Ping、路由追踪和 DNS 解析', icon: 'mdi-lan-check' },
  { id: 'logs', title: '日志中心', subtitle: '系统 / 内核日志搜索与复制', icon: 'mdi-text-box-search-outline' },
  { id: 'backup', title: '配置备份恢复', subtitle: 'UCI 配置快照、差异预览和安全恢复', icon: 'mdi-backup-restore' },
  { id: 'dnsdhcp', title: 'DNS / DHCP', subtitle: '本地域名映射和静态租约', icon: 'mdi-dns' },
  { id: 'services', title: '服务管理', subtitle: '服务运行与开机自启控制', icon: 'mdi-cog-sync-outline' },
  { id: 'ddns', title: 'DDNS 管理', subtitle: '动态域名服务、IPv6 与更新日志', icon: 'mdi-earth' },
  { id: 'cron', title: '系统定时任务', subtitle: 'Cron 计划启停与安全预设', icon: 'mdi-calendar-clock-outline' },
  { id: 'capabilities', title: '系统能力识别', subtitle: 'OpenWrt / QWRT 插件与 RPC 能力', icon: 'mdi-shield-check-outline' },
  { id: 'audit', title: '操作记录', subtitle: '脱敏的统一变更审计日志', icon: 'mdi-clipboard-text-clock-outline' },
  { id: 'trends', title: '长期趋势', subtitle: '30 天本地历史采样与曲线', icon: 'mdi-chart-line' },
  { id: 'security', title: '安全分析', subtitle: '认证失败、防火墙及扫描事件', icon: 'mdi-security' },
  { id: 'ssr', title: 'ShadowSocksR Plus+', subtitle: '代理节点与服务管理', icon: 'mdi-rocket-launch-outline' },
  { id: 'lucky', title: 'Lucky', subtitle: '运行状态、访问规则与备份维护', icon: 'mdi-clover' },
  { id: 'vlmcsd', title: 'Vlmcsd KMS', subtitle: '服务开关、自动激活与配置文件', icon: 'mdi-server-network' },
  { id: 'wechatpush', title: '微信推送', subtitle: '通知渠道与推送配置', icon: 'mdi-message-badge-outline' },
  { id: 'openclash', title: 'OpenClash', subtitle: '代理模式与运行控制', icon: 'mdi-cloud-sync-outline' },
  { id: 'detector', title: 'Internet Detector', subtitle: '联网监测状态', icon: 'mdi-web-check' },
  { id: 'carbon', title: 'Carbon 主题设置', subtitle: 'LuCI 主题与在线更新', icon: 'mdi-palette-outline' },
  { id: 'zerotier', title: 'ZeroTier', subtitle: '虚拟组网与网络成员', icon: 'mdi-lan-connect' },
  { id: 'firewall', title: '防火墙', subtitle: '区域策略与端口转发', icon: 'mdi-fire' },
  { id: 'reboot', title: '重启设备', subtitle: '需要二次确认', icon: 'mdi-restart' },
  { id: 'reset', title: '恢复出厂', subtitle: '清除配置，请谨慎操作', icon: 'mdi-restore' }
]
const visibleLegacyTools = computed(() => legacyTools.filter(tool =>
  installedRouterApps.value?.[tool.id] !== false))
const appSearch = ref('')
const hasAppSearch = computed(() => String(appSearch.value ?? '').trim().length > 0)
const pluginDirectoryOpen = ref(false)
const expandedAppCategories = ref([])
const favoriteEditorOpen = ref(false)
const terminalDisplayMenuOpen = ref(false)
const appFavoriteIds = ref([...DEFAULT_APP_FAVORITES])
// V3 information architecture: a feature has one canonical home. The
// favorites/search still accept legacy IDs, so existing per-router shortcuts
// continue working after the redesign without changing RPC handlers.
const appCategories = computed(() => groupV3Tools(legacyTools))
const pluginDirectoryTools = computed(() => appCategories.value.find(group => group.id === 'plugins')?.tools || [])
function pluginDetectionState(id) {
  if (installedRouterAppsLoading.value) return { label: '检测中', color: 'secondary' }
  if (installedRouterApps.value?.__evidence?.[id] === true) return { label: '已发现', color: 'success' }
  if (installedRouterApps.value?.[id] === false) return { label: '未检测到', color: 'warning' }
  return { label: '待确认', color: 'secondary' }
}
const networkFeatureTools = computed(() => networkV3Tools(visibleLegacyTools.value))
const appSearchResults = computed(() => searchV3Features(legacyTools, appSearch.value))
const favoriteTools = computed(() => sortFavoriteTools(visibleLegacyTools.value, appFavoriteIds.value))
const activeFavoriteIds = computed(() => favoriteTools.value.map(tool => tool.id))
const favoriteCandidates = computed(() => visibleLegacyTools.value.filter(tool => !isDangerousApp(tool.id)))
const favoriteEditorTools = computed(() => [
  ...favoriteTools.value,
  ...favoriteCandidates.value.filter(tool => !activeFavoriteIds.value.includes(tool.id))
])

// Device IDs remain stable if the router's name or IP changes. Preferences
// stay local to this device; router-side UCI and installed packages are untouched.
watch(() => selectedDevice.value?.id, id => {
  appFavoriteIds.value = readAppFavorites(localStorage, id)
  favoriteEditorOpen.value = false
  appSearch.value = ''
  pluginDirectoryOpen.value = false
  expandedAppCategories.value = []
}, { immediate: true })

function updateFavorite(toolId) {
  if (!favoriteCandidates.value.some(tool => tool.id === toolId)) return
  const next = toggleAppFavorite(activeFavoriteIds.value, toolId)
  if (next.join('|') === activeFavoriteIds.value.join('|')) return
  appFavoriteIds.value = next
  writeAppFavorites(localStorage, selectedDevice.value?.id, next)
}

function reorderFavorite(toolId, direction) {
  const next = moveAppFavorite(activeFavoriteIds.value, toolId, direction)
  if (next.join('|') === activeFavoriteIds.value.join('|')) return
  appFavoriteIds.value = next
  writeAppFavorites(localStorage, selectedDevice.value?.id, next)
}

function toggleAppCategory(id) {
  if (!appCategories.value.some(group => group.id === id)) return
  expandedAppCategories.value = expandedAppCategories.value.includes(id)
    ? expandedAppCategories.value.filter(value => value !== id)
    : [...expandedAppCategories.value, id]
}

async function expandAllAppCategories() {
  expandedAppCategories.value = appCategories.value.map(group => group.id)
  await nextTick()
  // Expand-all changes the height of multiple lists. A smooth scroll here
  // can continue *after* the user sets a new scroll position, then the route
  // saves that unintended offset on entry to a tool detail (82px in CI).
  // Keep the jump immediate; regular manual scrolling and page motion remain.
  document.getElementById('app-category-list')?.scrollIntoView({
    behavior: 'instant', block: 'start'
  })
}
const showHomeDetector = computed(() => {
  if (installedRouterApps.value?.detector === false) return false
  if (installedRouterApps.value?.detector === true) return true
  return Boolean(snapshot.value?.detectorAvailable)
})
async function refreshInstalledRouterApps(api = client.value) {
  if (!api || !api.session) return
  const request = ++installedRouterAppsRequest
  installedRouterAppsLoading.value = true
  try {
    const installed = await readInstalledRouterApps(api)
    if (request !== installedRouterAppsRequest || api !== client.value) return
    installedRouterApps.value = installed
    // Leave an already opened page alone until the user navigates back.
  } catch (error) {
    if (request === installedRouterAppsRequest && api === client.value) {
      // A transient RPC failure is not evidence that a plugin was removed.
      if (import.meta.env.DEV) console.warn('Router app discovery unavailable', error)
    }
  } finally {
    if (request === installedRouterAppsRequest) installedRouterAppsLoading.value = false
  }
}
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
// Show only real Internet Detector results, never treat an unavailable RPC as 0/0.
const overviewDetectorStatus = computed(() => {
  if (!snapshot.value?.detectorAvailable) return { value: '--/--', tone: '' }
  const checks = allChecks.value
  const total = checks.length
  if (total === 0) return { value: '0/0', tone: '' }
  const healthy = onlineCount.value
  return {
    value: healthy + '/' + total,
    tone: healthy === 0 ? 'error' : healthy === total ? 'success' : 'warning'
  }
})
// Only real, finite percentages drive the water gauge. Missing values stay unfilled.
function overviewWaterPercent(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null
}
// Overview metrics use live router values; missing data remains unknown.
const overviewResources = computed(() => {
  const disk = diskData.value.primary
  const snap = snapshot.value
  return [
    ...resourceCards.value.slice(0, 2).map(item => ({
      ...item,
      waterPercent: item.value === '--' ? null : overviewWaterPercent(item.progress)
    })),
    { label: '存储', value: disk ? disk.percent + '%' : '--',
      progress: disk?.percent ?? null, icon: 'mdi-harddisk',
      waterPercent: disk ? overviewWaterPercent(disk.percent) : null },
    { label: '温度', value: snap?.temperature && snap.temperature !== '--' ? snap.temperature : '--',
      progress: null, icon: 'mdi-thermometer' },
    { label: '终端', value: snap?.users ?? '--',
      progress: null, icon: 'mdi-devices' },
    { label: '联网监测', value: overviewDetectorStatus.value.value,
      tone: overviewDetectorStatus.value.tone, progress: null, icon: 'mdi-web-check' }
  ]
})
const labVisibleOverviewResources = computed(() => {
  const metrics = overviewResources.value
  if (!labSettings.value.cardsEnabled) return metrics
  const dictionary = new Map(metrics.map(item => [item.label,item]))
  return labCards.value.filter(item => item.visible).map(item => dictionary.get(item.id)).filter(Boolean)
})
const overviewWanState = computed(() => {
  const wan = snapshot.value?.interfaces?.find(item => item.interface === 'wan')
  return !wan || typeof wan.up !== 'boolean' ? '待确认' : wan.up ? '已连接' : '未连接'
})
// netifd reports uptime per interface, independently of system uptime.
// An unreadable value is unknown; a down interface is explicitly disconnected.
function interfaceConnectionDuration(names) {
  const nic = snapshot.value?.interfaces?.find(item => names.includes(item.interface))
  if (!nic || typeof nic.up !== 'boolean') return '--'
  if (!nic.up) return '未连接'
  return formatInterfaceUptime(nic.uptime)
}
const wanConnectionDuration = computed(() => interfaceConnectionDuration(['wan']))
const wan6ConnectionDuration = computed(() => interfaceConnectionDuration(['wan6', 'wan_6']))
const overviewIpv6State = computed(() => {
  const address = String(snapshot.value?.wan6Ip || '')
  return address && address !== '--' ? '已分配' : '待确认'
})
let mediaQuery, systemListener, motionMediaQuery, motionListener, refreshTimer, probeTimer, telemetryTimer, processTimer, historyTimer
let refreshQueued = false
let processRefreshBusy = false
let hardwareSampleAt = 0

function restartLabRefreshTimers() {
  if (probeTimer) clearInterval(probeTimer)
  if (telemetryTimer) clearInterval(telemetryTimer)
  if (refreshTimer) clearInterval(refreshTimer)
  const intervals = labIntervals.value
  probeTimer = setInterval(() => {
    if (!document.hidden && viewMode.value === 'list') void refreshDeviceStatuses()
  }, intervals.devices)
  telemetryTimer = setInterval(() => {
    if (!document.hidden) void pollTelemetry()
  }, intervals.telemetry)
  refreshTimer = setInterval(() => {
    if (!document.hidden && viewMode.value === 'detail' && connected.value &&
        activeTab.value === 'home' && !refreshing.value) void refreshDashboard()
  }, intervals.overview)
}
function drainQueuedRefresh() {
  if (!refreshQueued) return
  refreshQueued = false
  if (connected.value && client.value) void refreshCurrent()
}

function applyNetworkHardwareRates(data) {
  const now = Date.now()
  const elapsed = hardwareSampleAt ? now - hardwareSampleAt : 0
  const previous = new Map(networkHardware.value.wired.map(item => [item.name, item]))
  const wired = data.wired.map(item => {
    const before = previous.get(item.name)
    const counters = item.rxBytes == null || item.txBytes == null ? null : {
      rxBytes: Number(item.rxBytes), txBytes: Number(item.txBytes)
    }
    const rate = before && counters
      ? bandwidthSample(before, counters, elapsed) : null
    return {
      ...item,
      rxRateBps: rate?.rxBps ?? null,
      txRateBps: rate?.txBps ?? null
    }
  })
  hardwareSampleAt = now
  return { ...data, wired }
}

watch(navStyle, v => localStorage.setItem(storage.nav, v))
watch(motionEnabled, enabled => localStorage.setItem(storage.motion, String(enabled)))
let sceneAnimation = null
let sectionAnimation = null
function cancelMotionAnimations() {
  sceneAnimation?.cancel()
  sectionAnimation?.cancel()
  sceneAnimation = null
  sectionAnimation = null
}
watch(effectiveMotion, enabled => {
  document.documentElement.dataset.xxwrtMotion = enabled ? 'on' : 'off'
  // CSS animation overrides do not cancel Web Animations.
  if (!enabled) cancelMotionAnimations()
}, { immediate: true })
watch(colorMode, v => localStorage.setItem(storage.theme, v))
watch(appLocale, async value => {
  persistLanguage(value)
  await nextTick()
  localizationController?.refresh(value)
})
watch(showIp, v => localStorage.setItem(storage.showIp, String(v)))
watch(showHostnames, v => localStorage.setItem(storage.showHostname, String(v)))
watch(routerListLayout, v => localStorage.setItem(storage.listLayout, v))
watch(toolPanel, panel => {
  if (processTimer) clearInterval(processTimer)
  processTimer = null
  if (panel !== 'process') return
  processTimer = setInterval(async () => {
    if (!client.value || toolPanel.value !== 'process' || toolLoading.value || processRefreshBusy) return
    processRefreshBusy = true
    try {
      const result = await readProcessList(client.value)
      if (result.available) processData.value = result
    } catch (_) {
      // Preserve the last good process snapshot during a transient RPC failure.
    } finally { processRefreshBusy = false }
  }, 3000)
})
watch(dark, v => {
  theme.global.name.value = v ? 'dark' : 'light'
  syncNativeChrome(v)
}, { immediate: true })
// Route-specific scroll offsets are in memory only. Switching to a child
// tool begins at the top; returning to the app hub restores its prior position.
const pageScrollPositions=new Map()
let pageScrollSequence=0
let cancelPendingHubScrollRestore=null
function stopPendingHubScrollRestore(){
  cancelPendingHubScrollRestore?.()
  cancelPendingHubScrollRestore=null
}
// App categories animate their height when re-mounted. A two-frame restore
// can be clamped against the temporarily short page and remain 60-100px off.
// Follow actual hub size changes, but stop on navigation or manual interaction
// so we never drag the user back after they begin scrolling.
function keepHubScrollRestored(position,sequence){
  if(position<=0||typeof ResizeObserver==='undefined')return
  const hub=document.querySelector('.app-hub')
  if(!hub)return
  let stopped=false,scheduled=false
  const userEvents=['touchstart','wheel','pointerdown','keydown']
  const stop=()=>{
    if(stopped)return
    stopped=true
    observer.disconnect()
    clearTimeout(timeout)
    for(const event of userEvents)window.removeEventListener(event,stop)
    if(cancelPendingHubScrollRestore===stop)cancelPendingHubScrollRestore=null
  }
  const restore=()=>{
    if(stopped||sequence!==pageScrollSequence){stop();return}
    restorePageScroll(position)
  }
  const observer=new ResizeObserver(()=>{
    if(stopped||scheduled)return
    scheduled=true
    requestAnimationFrame(()=>{
      scheduled=false
      restore()
    })
  })
  const timeout=setTimeout(()=>{
    restore()
    stop()
  },600)
  for(const event of userEvents)window.addEventListener(event,stop,{passive:true})
  cancelPendingHubScrollRestore=stop
  observer.observe(hub)
}
function currentScrollNodes(){
  return [...new Set([document.scrollingElement,document.documentElement,
    document.body,document.querySelector('.v-application'),
    document.querySelector('.v-main')].filter(Boolean))]
}
function readPageScroll(){
  return Math.max(0,window.scrollY||0,
    ...currentScrollNodes().map(node=>Number(node.scrollTop)||0))
}
function resetPageScroll(){
  for(const node of currentScrollNodes())node.scrollTop=0
  window.scrollTo(0,0)
}
function restorePageScroll(position){
  const y=Math.max(0,Math.floor(Number(position)||0))
  for(const node of currentScrollNodes()){
    if(node.scrollHeight>node.clientHeight+1)node.scrollTop=y
  }
  window.scrollTo(0,y)
}
function scrollCurrentPageToTop(){
  const behavior=motionScrollBehavior(effectiveMotion.value)
  const node=currentScrollNodes().find(el=>el.scrollTop>0)
    ||document.scrollingElement||document.documentElement
  if(typeof node?.scrollTo==='function')node.scrollTo({top:0,behavior})
  else window.scrollTo({top:0,behavior})
}
function scrollRouteKey([tab,tool,mode,settings,category,device,netSection]){
  if(settings)return 'settings:'+String(category||'root')
  if(tab==='more')return 'more:root'
  if(mode==='list')return 'device-list'
  return ['router',String(device||'unknown'),String(tab||'home'),
    tab==='apps'?(tool||'hub'):tab==='network'?(netSection||'hub'):'root'].join(':')
}
watch([activeTab,toolPanel,viewMode,settingsOpen,settingsCategory,selectedDeviceId,networkSection],
  async (next,previous)=>{
    const to=scrollRouteKey(next)
    const from=previous?scrollRouteKey(previous):null
    if(from===to)return
    stopPendingHubScrollRestore()
    // The sync watcher runs before Vue replaces the current page.
    if(from)pageScrollPositions.set(from,readPageScroll())
    resetPageScroll()
    const sequence=++pageScrollSequence
    await nextTick()
    if(sequence!==pageScrollSequence)return
    const savedPosition=pageScrollPositions.get(to)||0
    const restore=()=>{
      if(sequence!==pageScrollSequence)return
      restorePageScroll(savedPosition)
    }
    requestAnimationFrame(()=>{
      restore()
      requestAnimationFrame(()=>{
        restore()
        // Returning from an app tool re-mounts expanded lists. Restore again
        // as their height settles instead of retaining the early clamp.
        if(to.endsWith(':apps:hub')&&from?.includes(':apps:')&&savedPosition>0)
          keepHubScrollRestored(savedPosition,sequence)
        if (sequence !== pageScrollSequence || !effectiveMotion.value || document.hidden) return
        const motion = describeNavigationMotion(previous,next)
        if (!motion) return
        sceneAnimation?.cancel()
        // The content DOM is never recreated: router RPC state and scroll survive.
        sceneAnimation = playInterfaceMotion(
          document.querySelector('.main-container'),motion,effectiveMotion.value)
      })
    })
  },{flush:'sync'})
// Only explicit view-category changes trigger these transitions, never polling.
watch([terminalView,networkView],async ([newTerminal,newNetwork],[oldTerminal,oldNetwork])=>{
  if (!effectiveMotion.value || document.hidden) return
  await nextTick()
  requestAnimationFrame(()=>{
    if (!effectiveMotion.value || document.hidden) return
    let target=null
    if (activeTab.value==='clients' && newTerminal!==oldTerminal)
      target=document.querySelector('.terminal-screen .terminal-grid, .terminal-screen .v-empty-state, .terminal-screen .v-alert')
    if (activeTab.value==='network' && newNetwork!==oldNetwork)
      target=document.querySelector('.xxwrt-network-view')
    if (!target) return
    sectionAnimation?.cancel()
    sectionAnimation=playInterfaceMotion(target,{kind:'section'},true)
  })
})
function navigateBottomTab(tab) {
  if (!pages.some(page => page.id === tab)) return
  if (viewMode.value === 'list' && tab !== 'home' && tab !== 'more') return
  if (activeTab.value === 'apps' && toolPanel.value) {
    const blocked = toolPanel.value === 'packages'
      ? softwarePackagesPanel.value?.handleBack?.() :
      advancedToolIds.includes(toolPanel.value)
      ? advancedManagementPanel.value?.handleBack?.() :
      routerOperationsToolIds.includes(toolPanel.value)
        ? routerOperationsPanel.value?.handleBack?.() :
      routerAppToolIds.includes(toolPanel.value) ? routerAppsPanel.value?.handleBack?.() : null
    if (blocked) return
  }
  if (tab === activeTab.value) {
    if (tab === 'more' && settingsOpen.value) {
      settingsOpen.value = false
      settingsTrail.length = 0
      return
    }
    if (tab === 'apps' && pluginDirectoryOpen.value && !toolPanel.value) {
      pluginDirectoryOpen.value = false
      return
    }
    if (tab === 'apps' && toolPanel.value) {
      if (toolOriginTab.value) {
        // Tapping Tools explicitly switches to the Tools hub. The detail-page
        // Back button instead returns to the invoking Devices/Network/Overview.
        toolPanel.value = ''
        toolOriginTab.value = ''
        toolMessage.value = ''
      } else closeAppTool()
      return
    }
    if (tab === 'network' && networkSection.value !== 'hub') {
      networkOriginTab.value = ''
      networkSection.value = 'hub'
      return
    }
    if (isCurrentTabRoot(activeTab.value, tab, toolPanel.value, connected.value, settingsOpen.value)
      || tab === 'more') {
      const route = scrollRouteKey([activeTab.value, toolPanel.value, viewMode.value,
        settingsOpen.value, settingsCategory.value, selectedDeviceId.value])
      pageScrollPositions.set(route, 0)
      scrollCurrentPageToTop()
    }
    return
  }
  if (tab === 'more') previousContentTab.value = currentNavTab.value
  settingsOpen.value = false
  settingsTrail.length = 0
  toolOriginTab.value = ''
  networkOriginTab.value = ''
  if (tab === 'network') networkSection.value = 'hub'
  if (tab !== 'apps') pluginDirectoryOpen.value = false
  activeTab.value = tab
}
function openMoreSection(categoryId) {
  if (!moreCategories.some(category => category.id === categoryId)) return
  settingsTrail.length = 0
  settingsCategory.value = categoryId
  settingsOpen.value = true
}
function openRouterTab(tab) {
  if (viewMode.value !== 'detail' || !connected.value) return
  navigateBottomTab(tab)
}
watch(activeTab, (tab) => {
  if (tab !== 'apps') pluginDirectoryOpen.value = false
  if (connected.value && tab !== 'more') refreshCurrent()
  if (tab === 'statistics') void pollTelemetry()
  if (tab !== 'apps') toolPanel.value = ''
})
// Android Back follows the visible hierarchy, not bottom-tab visit order.
let nativeBackSubscription = null
let nativeResumeSubscription = null
function openSettingsCategory(categoryId, directFromMe = false) {
  if (!settingsCategories.some(category => category.id === categoryId)) return
  settingsTrail.length = 0
  // Direct Me setting entries return to Me; selecting from the all-settings
  // directory returns to that directory instead.
  if (!directFromMe) settingsTrail.push('settings')
  settingsCategory.value = categoryId
  settingsOpen.value = true
}
function closeSettingsPage() {
  if (settingsTrail.length) {
    settingsCategory.value = settingsTrail.pop()
    return
  }
  settingsOpen.value = false
}
// Back: dialogs → More subpage → More hub → app tool → router list → minimize.
async function handleBack() {
  if (factoryBusy.value || connecting.value || actionBusy.value) return 'busy'
  // Consume transient menus and dialogs before changing any page or router.
  if (terminalDisplayMenuOpen.value) { terminalDisplayMenuOpen.value = false; return 'dialog' }
  if (updateDialog.value) {
    if (downloadBusy.value) return 'busy'
    updateDialog.value = false
    return 'dialog'
  }
  // The Tools > My Shortcuts editor is an overlay, not a navigation level.
  // Consume the Android back gesture here so the Tools hub stays visible.
  if (favoriteEditorOpen.value) { favoriteEditorOpen.value = false; return 'dialog' }
  if (releaseNotesDialog.value) { releaseNotesDialog.value = false; return 'dialog' }
  if (versionDetailsDialog.value) { versionDetailsDialog.value = false; return 'dialog' }
  if (privacyDialog.value) { privacyDialog.value = false; return 'dialog' }
  if (openSourceDialog.value) { openSourceDialog.value = false; return 'dialog' }
  if (factoryDialog.value) { factoryDialog.value = false; return 'dialog' }
  if (confirmReboot.value) { confirmReboot.value = false; return 'dialog' }
  if (wolDeleteDialog.value) { wolDeleteDialog.value = false; return 'dialog' }
  if (deleteDialog.value) { deleteDialog.value = false; return 'dialog' }
  if (hqosGlobalConfirm.value) { hqosGlobalConfirm.value = false; return 'dialog' }
  if (hqosGlobalDialog.value) {
    if (hqosGlobalBusy.value) return 'busy'
    hqosGlobalDialog.value = false
    return 'dialog'
  }
  if (qosWriteConfirm.value) { qosWriteConfirm.value = false; return 'dialog' }
  if (selectedClient.value) {
    if (terminalSaving.value) return 'busy'
    selectedClient.value = null
    return 'dialog'
  }
  if (loginDialog.value) { loginDialog.value = false; return 'dialog' }
  if (deviceDialog.value) { deviceDialog.value = false; return 'dialog' }
  // A nested network editor is a separate Vuetify overlay. Consume Android
  // Back in the editor before navigating away from the router detail screen.
  if (viewMode.value === 'detail' && activeTab.value === 'network' && !settingsOpen.value) {
    const handled = networkInterfacesPanel.value?.handleBack?.()
    if (handled) return handled
  }
  if (settingsOpen.value) { closeSettingsPage(); return 'settings' }
  if (activeTab.value === 'statistics') {
    activeTab.value = 'home'
    return 'page'
  }
  if (activeTab.value === 'network' && networkSection.value !== 'hub') {
    const origin = networkOriginTab.value
    networkOriginTab.value = ''
    networkSection.value = 'hub'
    if (origin) activeTab.value = origin
    return 'page'
  }

  if (viewMode.value === 'detail' && activeTab.value === 'apps' && toolPanel.value) {
    const blocked = toolPanel.value === 'packages'
      ? softwarePackagesPanel.value?.handleBack?.() :
      routerOperationsToolIds.includes(toolPanel.value)
      ? routerOperationsPanel.value?.handleBack?.() :
      advancedToolIds.includes(toolPanel.value)
        ? advancedManagementPanel.value?.handleBack?.() :
        routerAppToolIds.includes(toolPanel.value) ? routerAppsPanel.value?.handleBack?.() : null
    if (blocked) return blocked
    closeAppTool()
    return 'page'
  }
  if (viewMode.value === 'detail' && activeTab.value === 'apps' && pluginDirectoryOpen.value) {
    pluginDirectoryOpen.value = false
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
  if (sampleBusy || !client.value || !connected.value || viewMode.value !== 'detail') return
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
  const oldId = selectedDeviceId.value
  if (oldId && sessions.has(oldId)) {
    sessions.get(oldId).logout()
    sessions.delete(oldId)
  }
  client.value?.logout()
  client.value = null
  connected.value = false
  snapshot.value = null
  clientFetchToken++
  clientsPrefetching.value = false
  clientData.value = { data: [], ipv6: [], wechatRecords: [], wechatAliases: [],
    wechatInstalled: false, leasesAvailable: false }
  wifiClientData.value = { available: false, stations: [] }
  appFilterUsers.value = { available: false, users: [] }
  diskData.value = { available: false, partitions: [], primary: null, temporary: null }
  bandwidthHistory.value = []
  loadHistory.value = []
  currentRate.value = null
  telemetryError.value = ''
  chosenInterface.value = ''
  samplePrevious = null
  samplePreviousAt = 0
  hardwareSampleAt = 0
  networkHardware.value = { wiredAvailable: false, wirelessAvailable: false, wired: [], wireless: [] }
  selectedClient.value = null
  terminalRequestId++
  terminalSettings.value = null
  toolPanel.value = ''
  toolMessage.value = ''
  serviceData.value = { services: [], available: false }
  installedRouterApps.value = null
  installedRouterAppsRequest++
  processData.value = { available: false, processes: [] }
  routeData.value = { available: false, routes: [] }
  liveRoutes.value = { available: false, lines: [] }
  wolData.value = { available: false, tool: '', targets: [], interfaces: [], known: [], neighbors: [] }
  wolTab.value = 'targets'
  networkView.value = 'interfaces'
  networkSection.value = 'hub'
  toolOriginTab.value = ''
  form.password = ''
  errorMessage.value = ''
  activeTab.value = 'home'
  viewMode.value = 'list'
  selectedDeviceId.value = ''
  loginDialog.value = false
  settingsOpen.value = false
  settingsTrail.length = 0
  void refreshDeviceStatuses()
}

function showDeviceDialog(device = null) {
  listError.value = ''
  editDeviceId.value = device?.id || ''
  Object.assign(deviceForm, device ? {
    name: device.name, address: device.address, username: device.username,
    ignoreTlsErrors: !!device.ignoreTlsErrors
  } : { name: '', address: 'http://192.168.100.1', username: 'root', ignoreTlsErrors: false })
  deviceDialog.value = true
}

async function saveDeviceEntry() {
  listError.value = ''
  try {
    const candidate = newDevice(deviceForm) // validates name, address, username
    if (editDeviceId.value) {
      const before = devices.value.find(d => d.id === editDeviceId.value)
      if (!before) throw new Error('未找到需要编辑的路由器')
      const changedAddress = before.address !== candidate.address
      const trust = changedAddress ? false : candidate.ignoreTlsErrors
      const changed = changedAddress || before.username !== candidate.username || before.ignoreTlsErrors !== trust
      devices.value = devices.value.map(d => d.id === before.id
        ? { ...d, name: candidate.name, address: candidate.address, username: candidate.username,
            ignoreTlsErrors: trust, rememberPassword: changed ? false : d.rememberPassword }
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
              const session = new RouterClient(d.address, { ignoreTlsErrors: d.ignoreTlsErrors })
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
        if (status !== 'online') status = await probeDevice(d.address, d.ignoreTlsErrors)
        if (devices.value.some(x => x.id === d.id)) deviceStatuses[d.id] = status
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, entries.length) }, () => worker()))
  } finally {
    probeBusy.value = false
  }
}

// Switching routers must honor the same pending-edit and dialog guards as
// Android Back. The previous direct goToDeviceList call bypassed nested panels.
async function requestRouterSwitch() {
  if (viewMode.value !== 'detail' || !connected.value) return
  if (factoryBusy.value || connecting.value || actionBusy.value) return
  if (activeTab.value === 'network' && networkSection.value !== 'hub') {
    const handled = networkInterfacesPanel.value?.handleBack?.()
    if (handled) return
  }
  if (toolPanel.value || selectedClient.value) {
    // First close or reject the active editor; require another explicit
    // switch action to leave the router, rather than discarding a draft.
    await handleBack()
    return
  }
  await goToDeviceList()
}

async function goToDeviceList() {
  settingsOpen.value = false
  settingsTrail.length = 0
  viewMode.value = 'list'
  toolOriginTab.value = ''
  networkOriginTab.value = ''
  networkSection.value = 'hub'
  activeTab.value = 'home'
  toolPanel.value = ''
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
  loginIgnoreTls.value = Boolean(device.ignoreTlsErrors && device.address.startsWith('https://'))
  // Never show snapshot data from another router while switching.
  snapshot.value = null
  lanDhcpStatus.value = { dhcp4: null, dhcp6: null }
  const cached = sessions.get(device.id)
  if (cached?.session) {
    client.value = cached
    connected.value = true
    viewMode.value = 'detail'
    activeTab.value = 'home'
    void fetchClientsInBackground(cached)
    await Promise.all([refreshDashboard(), refreshInstalledRouterApps(cached)])
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
    const api = new RouterClient(device.address, { ignoreTlsErrors: loginIgnoreTls.value })
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
    // TLS exception is remembered per saved router, independently of the password.
    devices.value = saveDevices(devices.value.map(d => d.id === device.id
      ? { ...d, ignoreTlsErrors: api.ignoreTlsErrors } : d))
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
    void fetchClientsInBackground(api)
    await Promise.all([refreshDashboard(), refreshInstalledRouterApps(api)])
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
    const [dashboardResult, partitionsResult, hardwareResult, dhcpResult] = await Promise.allSettled([
      readDashboard(client.value), readDiskUsage(client.value),
      readNetworkHardware(client.value), readLanDhcpStatus(client.value)
    ])
    if (dashboardResult.status === 'rejected') throw dashboardResult.reason
    snapshot.value = dashboardResult.value
    lanDhcpStatus.value = dhcpResult.status === 'fulfilled'
      ? dhcpResult.value : { dhcp4: null, dhcp6: null }
    if (selectedDeviceId.value) {
      try { recordMetricSample(localStorage, selectedDeviceId.value, snapshot.value) }
      catch (_) { /* Private mode or storage quota: never block dashboard refresh. */ }
    }
    if (!installedRouterApps.value && !installedRouterAppsLoading.value) {
      void refreshInstalledRouterApps(client.value)
    }
    if (hardwareResult.status === 'fulfilled') {
      networkHardware.value = applyNetworkHardwareRates(hardwareResult.value)
    }
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
    await maybeLabFailover(e)
  } finally {
    refreshing.value = false
    drainQueuedRefresh()
  }
}

async function fetchClientsInBackground(api = client.value) {
  if (!api || !api.session || clientsPrefetching.value) return
  clientsPrefetching.value = true
  const token = ++clientFetchToken
  try {
    const [leases, stations, oafUsers] = await Promise.allSettled([
      readClients(api), readWirelessStations(api),
      api.call('appfilter', 'get_all_users', { flag: 3 }, true)
    ])
    if (api !== client.value || token !== clientFetchToken) return
    if (leases.status === 'fulfilled') clientData.value = leases.value
    if (stations.status === 'fulfilled' &&
        (stations.value.available || !wifiClientData.value.available)) {
      wifiClientData.value = stations.value
    }
    if (oafUsers.status === 'fulfilled') {
      const list = oafUsers.value?.data?.list || oafUsers.value?.list
      appFilterUsers.value = {
        available: !!oafUsers.value, users: Array.isArray(list) ? list : []
      }
    }
  } finally {
    if (token === clientFetchToken) clientsPrefetching.value = false
  }
}

async function refreshCurrent() {
  if (!client.value) return
  if (refreshing.value) {
    // A tab change during an in-flight refresh must not lose the new page's
    // data request. Run one refresh for the latest active tab when idle.
    refreshQueued = true
    return
  }
  if (activeTab.value === 'home' || activeTab.value === 'statistics' || activeTab.value === 'network') {
    await refreshDashboard()
    if (activeTab.value === 'network') void networkInterfacesPanel.value?.refreshAction()
    return
  }
  refreshing.value = true
  errorMessage.value = ''
  try {
    if (activeTab.value === 'clients') await fetchClientsInBackground(client.value)
    if (activeTab.value === 'apps') {
      const [servicesResult] = await Promise.all([
        readServices(client.value), refreshInstalledRouterApps(client.value)
      ])
      serviceData.value = servicesResult
    }
    lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (e) {
    handleRpcError(e)
  } finally {
    refreshing.value = false
    drainQueuedRefresh()
  }
}

async function showLegacyTool(toolId, { force = false } = {}) {
  if (!client.value || toolLoading.value) return
  if (toolId === 'reboot') { confirmReboot.value = true; return }
  if (toolId === 'reset') {
    factoryPhrase.value = ''
    factoryError.value = ''
    factoryDialog.value = true
    return
  }
  const isSystemList = ['process', 'startup', 'routes'].includes(toolId)
  const needsFetch = toolId !== 'startup' || force || !serviceData.value.available
  if (isSystemList) {
    legacyLoadStatus[toolId] = needsFetch ? 'loading' : 'ready'
    legacyLoadError.value = ''
  }
  if (toolId === 'wol') wolLoadStatus.value = 'loading'
  toolPanel.value = toolId
  toolMessage.value = ''
  if (toolId === 'parental' || toolId === 'lucky' || toolId === 'vlmcsd' || toolId === 'packages' || routerOperationsToolIds.includes(toolId) || advancedToolIds.includes(toolId) || routerAppToolIds.includes(toolId) || (isSystemList && !needsFetch)) return
  toolLoading.value = true
  try {
    if (toolId === 'startup') {
      const data = await readServices(client.value)
      if (!data.available) throw new Error('暂时无法读取启动项服务，请确认 rc.list RPC 授权并重试')
      serviceData.value = data
    }
    if (toolId === 'process') {
      const data = await readProcessList(client.value)
      if (!data.available) throw new Error('当前 QWRT 未开放 luci.getProcessList RPC 接口，请核实固件及账号权限')
      processData.value = data
    }
    if (toolId === 'routes') {
      const [config, runtime] = await Promise.all([
        readRouteConfig(client.value), readRuntimeRoutes(client.value)
      ])
      if (!config.available && !runtime.available)
        throw new Error('路由表读取失败：当前账号无 UCI 与系统路由查询权限，请检查 ubus ACL')
      routeData.value = config
      liveRoutes.value = runtime
    }
    if (toolId === 'wol') {
      const result = await readWolDevices(client.value)
      wolData.value = result
      wolForm.iface = result.interfaces.includes('br-lan') ? 'br-lan' : (result.interfaces[0] || '')
      wolLoadStatus.value = 'ready'
    }
    if (isSystemList) legacyLoadStatus[toolId] = 'ready'
  } catch (e) {
    if (toolId === 'wol') {
      wolLoadStatus.value = 'error'
      toolMessage.value = shortError(e)
    } else if (isSystemList) {
      legacyLoadStatus[toolId] = 'error'
      legacyLoadError.value = shortError(e)
      toolMessage.value = legacyLoadError.value
    } else {
      toolMessage.value = shortError(e)
    }
  } finally {
    toolLoading.value = false
  }
}

function refreshCurrentTool() {
  if (advancedToolIds.includes(toolPanel.value)) {
    void advancedManagementPanel.value?.refreshAction()
    return
  }
  if (routerOperationsToolIds.includes(toolPanel.value)) {
    void routerOperationsPanel.value?.refreshAction()
    return
  }
  if (toolPanel.value === 'packages') {
    void softwarePackagesPanel.value?.refreshAction()
    return
  }
  if (toolPanel.value === 'vlmcsd') {
    void vlmcsdPanel.value?.refreshAction()
    return
  }
  if (toolPanel.value === 'lucky') {
    void luckyPanel.value?.refreshAction()
    return
  }
  if (routerAppToolIds.includes(toolPanel.value)) {
    void routerAppsPanel.value?.refreshAction()
    return
  }
  void showLegacyTool(toolPanel.value, { force: true })
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
    toolMessage.value = '已向 ' + (item.name || item.hostname || item.mac) + ' 发送网络唤醒包（设备是否开机需另行确认）'
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

async function showLatestReleaseNotes() {
  if (releaseNotesLoading.value) return
  releaseNotesDialog.value = true
  releaseNotesLoading.value = true
  releaseNotesText.value = ''
  releaseNotesVersion.value = ''
  releaseNotesSource.value = ''
  releaseNotesError.value = ''
  try {
    // The update checker already stores the latest stable release. If it has
    // not completed yet, fetch using the exact same Aliyun-first path.
    const latest = latestRelease.value || await fetchLatestStableRelease()
    if (!latest) throw new Error('暂无可用的正式版本信息')
    releaseNotesVersion.value = latest.version
    let content = String(latest.releaseNotes || '').trim()
    let source = latest.source || 'github'
    if (!content) {
      // Old version.json files have no notes field; only then use GitHub.
      content = (await fetchGithubReleaseNotes(latest.tag)).trim()
      source = 'github'
    }
    if (!content) throw new Error('当前最新版本尚未提供变更日志')
    releaseNotesText.value = content
    releaseNotesSource.value = source
  } catch (e) {
    releaseNotesError.value = '无法获取版本日志：' + shortError(e)
  } finally {
    releaseNotesLoading.value = false
  }
}
async function showIssuesPage() {
  try {
    await Browser.open({ url: 'https://github.com/lmdbot/xxwrt-m-custom/issues', windowName: '_blank' })
  } catch (e) {
    listError.value = '打开 GitHub Issues 失败：' + shortError(e)
  }
}
async function showProjectPage() {
  try {
    await Browser.open({ url: 'https://github.com/lmdbot/xxwrt-m-custom', windowName: '_blank' })
  } catch (e) {
    listError.value = '打开项目页面失败：' + shortError(e)
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
  updateWaterPageVisibility()
  document.addEventListener('visibilitychange', updateWaterPageVisibility)
  localizationController = mountLocalization(document.body, appLocale.value)
  if (isNative) {
    void LauncherIcon.getPreset().then(({id}) => {
      if (appIconChoice.value !== 'custom' && APP_ICON_PRESETS.some(item => item.id === id)) {
        appIconChoice.value = id
        saveAppIconChoice(localStorage,id)
      }
    }).catch(() => {})
  }
  void (async () => {
    if (isNative) {
      try {
        const appInfo = await CapacitorApp.getInfo()
        if (parseAppVersion(appInfo.version)) installedVersion.value = appInfo.version
        if (appInfo.build) installedBuild.value = String(appInfo.build)
        if (appInfo.id) installedPackageId.value = String(appInfo.id)
      } catch (_) { /* The embedded package version is the fallback. */ }
    }
    await checkAppUpdates({ automatic: true })
    void showInstallFailureIfAny()
  })()
  if (isNative) {
    // Android can reapply its system-bar appearance after returning from a
    // settings page or another app, so restore both contrast and background.
    void CapacitorApp.addListener('resume', () => {
      syncNativeChrome(dark.value)
      void continueInstallAfterPermission()
      void showInstallFailureIfAny()
    })
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
  motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  systemReducedMotion.value = motionMediaQuery.matches
  motionListener = event => { systemReducedMotion.value = event.matches }
  motionMediaQuery.addEventListener?.('change',motionListener)
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mediaQuery.matches
  systemListener = e => { systemDark.value = e.matches }
  mediaQuery.addEventListener?.('change', systemListener)
  void refreshDeviceStatuses()
  restartLabRefreshTimers()
  // Sample even when the user is reading other app tabs; do not run in the
  // background or imply continuous historical collection with the app closed.
  historyTimer = setInterval(() => {
    if (viewMode.value !== 'detail' || !connected.value || !client.value || document.hidden) return
    const api = client.value, routerId = selectedDeviceId.value
    if (!routerId) return
    void readDashboard(api).then(data => {
      if (api !== client.value || routerId !== selectedDeviceId.value) return
      try { recordMetricSample(localStorage, routerId, data) } catch (_) {}
    }).catch(() => {})
  }, METRIC_INTERVAL_MS)
})
onUnmounted(() => {
  waterSlosh.stop()
  document.removeEventListener('visibilitychange', updateWaterPageVisibility)
  stopPendingHubScrollRestore()
  cancelMotionAnimations()
  localizationController?.dispose()
  if (nativeBackSubscription) void nativeBackSubscription.remove()
  if (nativeResumeSubscription) void nativeResumeSubscription.remove()
  if (nativeApkProgressSubscription) void nativeApkProgressSubscription.remove()
  if (import.meta.env.DEV) {
    delete window.__xxwrtTestBack
    delete window.__xxwrtTestRefreshDevices
    delete window.__xxwrtTestRefreshDashboard
  }
  mediaQuery?.removeEventListener?.('change', systemListener)
  motionMediaQuery?.removeEventListener?.('change', motionListener)
  if (refreshTimer) clearInterval(refreshTimer)
  if (historyTimer) clearInterval(historyTimer)
  if (probeTimer) clearInterval(probeTimer)
  if (telemetryTimer) clearInterval(telemetryTimer)
  if (processTimer) clearInterval(processTimer)
})
</script>

<template>
  <v-app class="material-demo xxwrt-v3" :class="{ 'theme-is-dark': dark, 'app-motion-enabled': effectiveMotion }">
    <v-app-bar flat color="surface" height="64" class="top-bar">
      <v-btn v-if="settingsOpen || !!toolPanel || pluginDirectoryOpen || activeTab === 'statistics' || (activeTab === 'network' && networkSection !== 'hub')"
        icon="mdi-arrow-left" size="small" aria-label="返回上一页" @click="handleBack()"/>
      <v-toolbar-title class="app-name">
        <div class="router-toolbar-title">
          <h1 v-if="viewMode === 'list' && !settingsOpen && activeTab !== 'more'"
            class="router-toolbar-name router-list-toolbar-heading">路由器管理</h1>
          <span v-else class="router-toolbar-name">{{ settingsOpen ? settingsPage.title : (toolbarSection || pageTitle) }}</span>
        </div>
      </v-toolbar-title>
      <v-btn v-if="viewMode === 'list' && !settingsOpen && activeTab !== 'more'"
        class="v3-top-action" icon="mdi-refresh" size="small" variant="text" color="primary"
        :loading="probeBusy" aria-label="刷新设备状态" @click="refreshDeviceStatuses"/>
      <v-btn v-if="viewMode === 'list' && !settingsOpen && activeTab !== 'more'"
        class="router-list-add-topbar" color="primary" rounded="xl"
        size="small" prepend-icon="mdi-plus" @click="showDeviceDialog()">添加</v-btn>
      <v-btn v-if="viewMode === 'detail' && connected && !settingsOpen"
        class="v3-top-action" icon="mdi-refresh" size="small" variant="text" :loading="refreshing || toolLoading"
        aria-label="刷新当前页面"
        @click="activeTab === 'more' ? refreshDashboard() : activeTab === 'apps' && toolPanel ? refreshCurrentTool() : refreshCurrent()"/>
      <v-btn v-if="viewMode === 'detail' && !settingsOpen && !toolPanel && activeTab !== 'statistics'"
        class="v3-theme-toggle v3-top-action" size="small" variant="text"
        :icon="dark ? 'mdi-white-balance-sunny' : 'mdi-weather-night'"
        :aria-label="dark ? '切换至浅色主题' : '切换至深色主题'"
        :title="dark ? '切换至浅色主题' : '切换至深色主题'"
        @click="toggleQuickTheme"/>
      <v-btn v-if="viewMode === 'detail' && connected"
        class="v3-router-switch v3-top-action" size="small" variant="text" color="primary"
        append-icon="mdi-chevron-down" aria-label="切换路由器" @click="requestRouterSwitch">
        <span class="v3-router-switch-label">{{ displayDeviceName(selectedDevice) }}</span>
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container class="main-container">
        <template v-if="settingsOpen">
          <section class="settings-page" :data-settings-category="settingsCategory">
            <template v-if="settingsCategory === 'settings'">
              <div class="more-menu-list" role="group" aria-label="设置选项">
                <button v-for="category in settingsCategories" :key="category.id"
                  type="button" class="more-menu-item" :aria-label="'打开' + category.title + '设置'"
                  @click="openSettingsCategory(category.id)">
                  <span class="more-menu-icon"><v-icon :icon="category.icon" size="24"/></span>
                  <span class="more-menu-copy"><strong>{{ category.title }}</strong><small>{{ category.description }}</small></span>
                  <v-icon icon="mdi-chevron-right" size="21" class="more-menu-chevron"/>
                </button>
              </div>
            </template>
            <template v-else-if="settingsCategory === 'router'">
              <header class="more-router-hero">
                <v-icon icon="mdi-router-wireless" size="58" color="primary"/>
                <h2>路由器</h2>
                <p>设备管理、连接与系统信息</p>
              </header>
              <div class="more-menu-list" role="group" aria-label="路由器快捷入口">
                <button type="button" class="more-menu-item" @click="goToDeviceList">
                  <span class="more-menu-icon"><v-icon icon="mdi-information-outline" size="24"/></span>
                  <span class="more-menu-copy"><strong>设备信息</strong><small>查看和管理保存的路由器</small></span>
                  <v-icon icon="mdi-chevron-right" size="21" class="more-menu-chevron"/>
                </button>
                <button type="button" class="more-menu-item" :disabled="!connected" @click="openRouterTab('clients')">
                  <span class="more-menu-icon"><v-icon icon="mdi-devices" size="24"/></span>
                  <span class="more-menu-copy"><strong>连接设备</strong><small>查看已连接的终端</small></span>
                  <v-icon icon="mdi-chevron-right" size="21" class="more-menu-chevron"/>
                </button>
                <button type="button" class="more-menu-item" :disabled="!connected" @click="openRouterTab('network')">
                  <span class="more-menu-icon"><v-icon icon="mdi-lan" size="24"/></span>
                  <span class="more-menu-copy"><strong>接口状态</strong><small>网络接口与连接状态</small></span>
                  <v-icon icon="mdi-chevron-right" size="21" class="more-menu-chevron"/>
                </button>
                <button type="button" class="more-menu-item" :disabled="!connected" @click="openRouterTab('home')">
                  <span class="more-menu-icon"><v-icon icon="mdi-layers-outline" size="24"/></span>
                  <span class="more-menu-copy"><strong>系统信息</strong><small>路由器运行状态与资源</small></span>
                  <v-icon icon="mdi-chevron-right" size="21" class="more-menu-chevron"/>
                </button>
              </div>
              <div class="more-device-summary" aria-label="已保存设备统计">
                <span>已保存设备 <strong>{{ devices.length }}</strong></span>
                <span>可达 <strong>{{ reachableCount }}</strong></span>
                <span>离线 <strong>{{ offlineCount }}</strong></span>
              </div>
              <v-btn class="mt-4" block variant="tonal" prepend-icon="mdi-plus"
                @click="settingsOpen = false; settingsTrail.length = 0; showDeviceDialog()">添加路由器</v-btn>
            </template>
            <template v-else-if="settingsCategory === 'display'">
              <v-card rounded="xl" elevation="1" class="settings-option-card">
                <div class="settings-option-heading">
                  <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-theme-light-dark" size="23"/></v-avatar>
                  <div><h2>主题模式</h2><p>选择应用的颜色主题，也可以跟随 Android 系统设置。</p></div>
                </div>
                <v-btn-toggle v-model="colorMode" mandatory divided color="primary" variant="outlined" class="settings-segmented" aria-label="主题模式">
                  <v-btn value="light" aria-label="浅色主题"><v-icon start icon="mdi-white-balance-sunny"/>浅色</v-btn>
                  <v-btn value="dark" aria-label="深色主题"><v-icon start icon="mdi-weather-night"/>深色</v-btn>
                  <v-btn value="system" aria-label="跟随系统主题"><v-icon start icon="mdi-cellphone"/>跟随系统</v-btn>
                </v-btn-toggle>
              </v-card>

              <v-card rounded="xl" elevation="1" class="settings-option-card">
                <div class="settings-option-heading">
                  <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-dock-window" size="23"/></v-avatar>
                  <div><h2>底部导航样式</h2><p>在结构清晰的标准样式与液态玻璃样式之间切换。</p></div>
                </div>
                <v-btn-toggle v-model="navStyle" mandatory divided color="primary" variant="outlined" class="settings-segmented settings-nav-toggle" aria-label="底栏样式">
                  <v-btn value="standard" aria-label="标准底栏"><v-icon start icon="mdi-view-agenda-outline"/>标准</v-btn>
                  <v-btn value="liquid" aria-label="液态底栏"><v-icon start icon="mdi-waves"/>液态</v-btn>
                </v-btn-toggle>
              </v-card>

              <v-card rounded="xl" elevation="1" class="settings-option-card">
                <div class="settings-option-heading">
                  <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-motion-play-outline" size="23"/></v-avatar>
                  <div><h2>界面动效</h2><p>控制页面进入、卡片反馈、弹窗、图表和滚动动画。</p></div>
                </div>
                <div class="settings-switch-row">
                  <div><p>开启后使用轻量过渡；关闭时所有界面动效立即停用。系统开启“减少动态效果”时始终以系统设置为准。</p></div>
                  <v-switch v-model="motionEnabled" inset color="primary" density="compact"
                    hide-details label="界面动效" aria-label="界面动效"/>
                </div>
                <p v-if="systemReducedMotion" class="settings-footnote">
                  <v-icon icon="mdi-information-outline" size="16"/>
                  已检测到系统减少动态效果，当前自动禁用动画。
                </p>
              </v-card>

              <v-card rounded="xl" elevation="1" class="settings-option-card">
                <div class="settings-option-heading">
                  <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-view-grid-outline" size="23"/></v-avatar>
                  <div><h2>设备列表布局</h2><p>选择多台路由器在首页的展示密度。</p></div>
                </div>
                <v-btn-toggle v-model="routerListLayout" mandatory divided color="primary" variant="outlined" class="settings-segmented" aria-label="设备列表布局">
                  <v-btn value="list" aria-label="列表布局"><v-icon start icon="mdi-view-list-outline"/>列表式</v-btn>
                  <v-btn value="card" aria-label="卡片布局"><v-icon start icon="mdi-view-grid-outline"/>卡片式</v-btn>
                </v-btn-toggle>
              </v-card>
            </template>

            <template v-else-if="settingsCategory === 'privacy'">
              <v-card rounded="xl" elevation="1" class="settings-option-card">
                <div class="settings-option-heading">
                  <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-router" size="23"/></v-avatar>
                  <div><h2>主机名隐藏</h2><p>保护设备列表和路由器首页中的设备名称。</p></div>
                </div>
                <div class="settings-switch-row">
                  <div><p>开启后，路由器名称和系统主机名将以占位符显示；不会修改 OpenWrt 实际主机名。</p></div>
                  <v-switch inset v-model="hideHostnames" label="隐藏主机名" aria-label="隐藏主机名" color="primary" hide-details density="compact"/>
                </div>
              </v-card>

              <v-card rounded="xl" elevation="1" class="settings-option-card">
                <div class="settings-option-heading">
                  <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-web" size="23"/></v-avatar>
                  <div><h2>IP / 域名隐藏</h2><p>控制路由器地址在界面中的可见范围。</p></div>
                </div>
                <div class="settings-switch-row">
                  <div><p>开启后，设备列表和设备详情页使用掩码显示地址，仅影响本机界面。</p></div>
                  <v-switch inset v-model="hideIpAddresses" label="隐藏 IP / 域名" aria-label="隐藏 IP / 域名" color="primary" hide-details density="compact"/>
                </div>
              </v-card>
              <p class="settings-footnote"><v-icon icon="mdi-shield-check-outline" size="16"/> 隐私选项保存在本机，不会修改路由器配置。</p>
            </template>

            <template v-else-if="settingsCategory === 'refresh'">
              <v-card rounded="xl" elevation="1" class="settings-option-card">
                <div class="settings-option-heading">
                  <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-refresh-auto" size="23"/></v-avatar>
                  <div><h2>当前刷新策略</h2><p>按页面状态执行自动刷新，避免无用的后台请求。</p></div>
                </div>
                <div class="settings-detail-row"><span>设备可达性检测</span><strong>设备列表停留期间每 {{ labIntervals.devices / 1000 }} 秒</strong></div>
                <div class="settings-detail-row"><span>路由器首页数据</span><strong>每 {{ labIntervals.overview / 1000 }} 秒</strong></div>
                <div class="settings-detail-row"><span>实时网络采样</span><strong>每 {{ labIntervals.telemetry / 1000 }} 秒</strong></div>
                <p class="muted-hint mt-3">当前策略：{{ labSettings.profile === 'saver' ? '省电' : labSettings.profile === 'realtime' ? '实时' : labSettings.profile === 'custom' ? '自定义' : '均衡' }}。可在“设置 → 实验室”调整或恢复默认，过短的请求间隔将被限制。</p>
                <div class="settings-actions mt-4">
                  <v-btn color="primary" variant="tonal" prepend-icon="mdi-radar" :loading="probeBusy" @click="refreshDeviceStatuses">立即检测所有设备</v-btn>
                  <v-btn v-if="connected" variant="outlined" prepend-icon="mdi-refresh" :loading="refreshing" @click="refreshCurrent">刷新当前路由器</v-btn>
                </div>
              </v-card>
            </template>

            <template v-else-if="settingsCategory === 'language'">
              <v-card rounded="xl" elevation="1" class="settings-option-card">
                <div class="settings-option-heading">
                  <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-translate" size="23"/></v-avatar>
                  <div><h2>应用语言</h2><p>选择应用界面语言，切换后立即生效。</p></div>
                </div>
                <v-radio-group v-model="appLocale" class="settings-language-group" hide-details aria-label="应用语言">
                  <v-radio value="zh-CN" label="简体中文" data-localize-ignore/>
                  <v-radio value="zh-TW" label="繁體中文" data-localize-ignore/>
                  <v-radio value="en" label="English" data-localize-ignore/>
                </v-radio-group>
                <div class="settings-detail-row"><span>当前语言</span><strong data-localize-ignore>{{ selectedLanguage }}</strong></div>
                <p class="settings-footnote"><v-icon icon="mdi-content-save-check-outline" size="16"/> 语言偏好保存在本机，重启应用后仍然有效。</p>
              </v-card>
            </template>

            <template v-else-if="settingsCategory === 'lab'">
              <LabPanel :settings="labSettings" :intervals="labIntervals" :cards="labCards"
                :router="connected ? selectedDevice : null" :rpc-records="labRpcRecords"
                :alternate="labAlternate" :active-address="connected ? (client?.baseUrl || '') : ''"
                :smart-busy="labSmartBusy" :smart-message="labSmartMessage"
                :global-message="labGlobalMessage" :rpc-message="labRpcMessage"
                :health-rows="labHealthRows" :deep-rows="labDeepRows" :health-busy="labHealthBusy"
                :icon-choices="appIconChoices" :icon-choice="appIconChoice"
                :icon-custom-src="customAppIconSrc" :icon-busy="appIconBusy"
                :icon-message="appIconMessage" :icon-is-native="isNative"
                @set-profile="setLabRefreshProfile" @set-interval="setLabCustomInterval"
                @toggle-cards="value => applyLabSettings({ cardsEnabled:value })"
                @toggle-card="setLabCardVisibility" @move-card="moveLabCard" @reset-cards="resetLabCards"
                @toggle-rpc="toggleLabRpc" @clear-rpc="clearRpcTrace" @copy-rpc="copyLabRpc"
                @toggle-smart="value => applyLabSettings({ smartSwitch:value })"
                @pair-alternate="pairLabAlternative" @remove-alternate="unpairLabAlternative"
                @switch-route="() => swapLabConnection()"
                @toggle-health="value => applyLabSettings({ healthEnabled:value })"
                @check-health="runLabHealthCheck" @reset-all="resetLabAll"
                @icon-select="selectAppIcon" @icon-upload="uploadAppIcon"
                @icon-pin-shortcut="pinCustomAppIcon"/>
            </template>

            <template v-else-if="settingsCategory === 'help'">
              <section class="v3-help-center">
                <header class="v3-help-intro"><v-icon icon="mdi-help-circle-outline" color="primary" size="34"/>
                  <div><h2>帮助与反馈</h2><p>查阅项目说明，或向开发者反馈问题和建议。</p></div>
                </header>
                <div class="more-menu-list">
                  <button type="button" class="more-menu-item" aria-label="查看使用说明" @click="showProjectPage">
                    <span class="more-menu-icon"><v-icon icon="mdi-book-open-page-variant-outline" size="23"/></span>
                    <span class="more-menu-copy"><strong>使用说明</strong><small>打开 XX-WRT 项目与使用文档</small></span>
                    <v-icon icon="mdi-open-in-new" size="20"/>
                  </button>
                  <button type="button" class="more-menu-item" aria-label="提交问题反馈" @click="showIssuesPage">
                    <span class="more-menu-icon"><v-icon icon="mdi-message-alert-outline" size="23"/></span>
                    <span class="more-menu-copy"><strong>问题反馈</strong><small>在 GitHub Issues 提交问题或建议</small></span>
                    <v-icon icon="mdi-open-in-new" size="20"/>
                  </button>
                </div>
              </section>
            </template>
            <template v-else-if="settingsCategory === 'about'">
              <AboutPage :installed-version="installedVersion" :installed-build="installedBuild" :icon-src="currentAppIconSrc"
                :update-state="{
                  latestRelease, available: updateAvailable, checking: updateChecking,
                  checked: updateChecked, error: updateError, notice: updateNotice,
                  downloading: downloadBusy, percent: downloadPercent,
                  progressText: downloadProgressText, downloadedApkReady,
                  receivedBytes: downloadBytes, totalBytes: downloadTotal,
                  downloadOutcome,
                  releaseNotesLoading, isNative
                }"
                @show-version-details="versionDetailsDialog = true"
                @check-updates="checkAppUpdates()"
                @download-latest="downloadLatestApk"
                @cancel-download="cancelApkDownload"
                @install-downloaded="installDownloadedApk"
                @show-release-notes="showLatestReleaseNotes"
                @show-project="showProjectPage"
                @show-issues="showIssuesPage"
                @show-licenses="openSourceDialog = true"
                @show-privacy="privacyDialog = true"/>
            </template>
          </section>
        </template>
        <template v-else-if="activeTab === 'more'">
          <section class="more-page v3-me-page" data-testid="more-page">
            <header class="v3-me-profile">
              <button type="button" class="v3-me-about-entry"
                aria-label="打开关于 XX-WRT、版本更新与反馈" @click="openMoreSection('about')">
                <img class="more-app-icon" :src="currentAppIconSrc" alt="XX-WRT 应用图标" width="64" height="64"/>
                <span class="v3-me-profile-copy">
                  <strong class="v3-me-profile-title">XX-WRT 管理器</strong>
                  <span class="v3-me-profile-version">v{{ installedVersion }} · OpenWrt / QWRT</span>
                  <span class="v3-me-connection" :class="{ 'is-connected': connected }">
                    <v-icon :icon="connected ? 'mdi-check-circle-outline' : 'mdi-information-outline'" size="15"/>
                    {{ connected ? '已连接路由器' : '未连接路由器' }}
                  </span>
                </span>
                <v-icon icon="mdi-chevron-right" size="20" class="v3-me-about-chevron"/>
              </button>
              <v-btn v-if="connected" icon="mdi-logout" variant="text" size="small"
                aria-label="退出当前路由器" @click="resetSession"/>
            </header>
            <div class="v3-section-label">路由器</div>
            <div class="more-menu-list v3-me-directory" role="group" aria-label="路由器入口">
              <button type="button" class="more-menu-item" aria-label="打开路由器管理" @click="goToDeviceList()">
                <span class="more-menu-icon"><v-icon icon="mdi-router-wireless" size="24"/></span>
                <span class="more-menu-copy"><strong>路由器管理</strong><small>添加、编辑和切换已保存路由器</small></span>
                <v-icon icon="mdi-chevron-right" size="21"/>
              </button>
            </div>
            <div class="v3-section-label">应用设置</div>
            <div class="more-menu-list v3-me-directory" role="group" aria-label="应用设置入口">
              <button v-for="category in settingsCategories" :key="category.id"
                type="button" class="more-menu-item"
                :aria-label="'打开' + category.title" @click="openSettingsCategory(category.id, true)">
                <span class="more-menu-icon"><v-icon :icon="category.icon" size="23"/></span>
                <span class="more-menu-copy"><strong>{{ category.title }}</strong><small>{{ category.description }}</small></span>
                <v-icon icon="mdi-chevron-right" size="21"/>
              </button>
            </div>
          </section>
        </template>
        <template v-else-if="viewMode === 'list'">
          <!-- Title and primary actions live in the fixed top bar. -->
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
          <TransitionGroup v-else name="xxwrt-list" tag="div" class="saved-device-grid" :class="{ 'saved-device-grid-compact': routerListLayout === 'list' }">
            <SavedRouterCard v-for="device in displayedDevices" :key="device.id"
              :device="device" :index="devices.findIndex(d => d.id === device.id)"
              :summary="deviceSummaries[device.id] || null"
              :status="deviceStatuses[device.id] || 'checking'"
              :layout="routerListLayout" :show-names="showHostnames" :show-address="showIp"
              @open="openDevice" @edit="showDeviceDialog" @remove="askDeleteDevice"/>
          </TransitionGroup>
          
        </template>
        <template v-else>
          <!-- Section title and refresh live in the fixed app toolbar. -->
          <!-- Connected page errors are shown in the fixed bottom snackbar. -->

          <template v-if="activeTab === 'home' || activeTab === 'statistics'">
            <section v-if="activeTab === 'home'" class="v3-overview">
              <div class="v3-health-card" role="button" tabindex="0"
                :aria-expanded="homeDetailsExpanded" aria-label="查看系统与硬件详情"
                @click="toggleHomeDetails"
                @keydown.enter.prevent="toggleHomeDetails"
                @keydown.space.prevent="toggleHomeDetails">
                <div class="v3-health-heading">
                  <v-icon :icon="connected ? 'mdi-check-circle-outline' : 'mdi-progress-clock'" :color="connected ? 'success' : 'warning'" size="30"/>
                  <div><h2>{{ connected ? '路由器已连接' : '正在连接路由器' }}</h2>
                    <p>{{ snapshot?.board?.model || 'OpenWrt / QWRT' }} · 运行 {{ snapshot?.uptime || '--' }}</p></div>
                  <v-chip size="small" :color="connected ? 'success' : 'warning'" variant="tonal">{{ connected ? '在线' : '检测中' }}</v-chip>
                </div>
                <div class="v3-health-footer">
                  <span :class="{ 'v3-health-ok': overviewWanState === '已连接' }">
                    <v-icon :icon="overviewWanState === '已连接' ? 'mdi-check-circle-outline' : 'mdi-information-outline'" size="16"/>
                    {{ overviewWanState === '已连接' ? 'WAN 已连接' : overviewWanState === '未连接' ? 'WAN 未连接' : 'WAN 状态待确认' }}
                  </span>
                  <v-icon :icon="homeDetailsExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="22" color="primary"/>
                </div>
              </div>
              <div ref="waterMetricsRoot" class="v3-health-metrics" role="group" aria-label="实时资源指标">
                <button v-for="(item, index) in labVisibleOverviewResources" :key="item.label" type="button"
                  class="v3-metric v3-metric-action"
                  :class="{ 'v3-metric--water': item.waterPercent !== undefined }"
                  :style="item.waterPercent != null ? { '--v3-water-percent': item.waterPercent + '%' } : undefined"
                  :aria-label="'查看' + item.label + '详情：' + item.value"
                  @click="openOverviewMetric(item.label)">
                  <svg v-if="item.waterPercent > 0" class="v3-metric-water"
                    viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    <defs>
                      <linearGradient :id="'v3-water-gradient-' + index" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" class="v3-water-stop-top"/>
                        <stop offset="100%" class="v3-water-stop-bottom"/>
                      </linearGradient>
                    </defs>
                    <path class="v3-metric-water-fill" :fill="'url(#v3-water-gradient-' + index + ')'"
                      :d="waterSurfacePath(item.waterPercent)"/>
                  </svg>
                  <small>{{ item.label }}</small>
                  <strong :class="item.tone ? 'v3-metric-value--' + item.tone : ''">{{ item.value }}</strong>
                </button>
              </div>
              <div class="v3-module-heading"><h2>实时流量</h2>
                <v-btn size="small" variant="text" append-icon="mdi-chevron-right" @click="openDetailedMonitor">详细监控</v-btn></div>
              <v-card variant="flat" rounded="xl" class="v3-live-card"
                role="button" tabindex="0" aria-label="查看详细监控"
                @click="openDetailedMonitor" @keydown.enter.prevent="openDetailedMonitor"
                @keydown.space.prevent="openDetailedMonitor">
                <div class="v3-rates">
                  <span><v-icon icon="mdi-arrow-down" color="primary" size="17"/> RX {{ currentRate?.rx || '等待采样' }}</span>
                  <span><v-icon icon="mdi-arrow-up" color="secondary" size="17"/> TX {{ currentRate?.tx || '等待采样' }}</span>
                </div>
                <RealtimeChart v-if="bandwidthHistory.length >= 2" :samples="bandwidthHistory"
                  :series="rxTxSeries" unit=" KB/s" title="实时流量趋势"/>
                <p v-else class="muted-hint v3-chart-empty"><v-icon icon="mdi-chart-line" size="25"/>等待第二次有效流量采样，不显示模拟数据</p>
              </v-card>
              <div class="v3-module-heading"><h2>快捷操作</h2></div>
              <div class="v3-shortcuts">
                <button class="v3-shortcut" @click="openOverviewInterfaces"><v-icon icon="mdi-lan"/>接口</button>
                <button class="v3-shortcut" @click="launchV3Tool('firewall')"><v-icon icon="mdi-shield-outline"/>防火墙</button>
                <button class="v3-shortcut" @click="launchV3Tool('ddns')"><v-icon icon="mdi-earth"/>DDNS</button>
                <button class="v3-shortcut" @click="launchV3Tool('diagnostics')"><v-icon icon="mdi-lan-check"/>诊断</button>
              </div>
              <div class="v3-module-heading">
                <h2>系统与硬件详情</h2>
                <v-btn size="small" variant="text"
                  :append-icon="homeDetailsExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                  :aria-expanded="homeDetailsExpanded"
                  :aria-label="homeDetailsExpanded ? '收起系统与硬件详情' : '展开系统与硬件详情'"
                  @click="toggleHomeDetails">{{ homeDetailsExpanded ? '收起' : '展开' }}</v-btn>
              </div>
            </section>
            <div v-if="homeDetailsExpanded && activeTab === 'home'" id="overview-system-details" class="v3-home-details">
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
                <div id="overview-detail-cpu" class="overview-detail-target" :class="{ 'overview-detail-selected': overviewFocusedMetric === 'CPU 占用' }"><span>CPU 占用</span><strong>{{ snapshot.cpuPercent == null ? '--' : snapshot.cpuPercent + '%' }}</strong></div>
                <div id="overview-detail-memory" class="overview-detail-target" :class="{ 'overview-detail-selected': overviewFocusedMetric === '内存占用' }"><span>内存占用</span><strong>{{ snapshot.memoryPercent == null ? '--' : snapshot.memoryPercent + '%' }}</strong></div>
                <div id="overview-detail-temperature" class="overview-detail-target" :class="{ 'overview-detail-selected': overviewFocusedMetric === '温度' }"><span>温度</span><strong>{{ snapshot.temperature }}</strong></div>
                <div><span>本地时间</span><strong>{{ snapshot.localtime }}</strong></div>
                <div><span>运行时间</span><strong>{{ snapshot.uptime }}</strong></div>
              </div>
              <section v-if="showHomeDetector" class="detector-area">
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

            <v-card v-if="snapshot && activeTab === 'home'" class="mt-4 network-card ethernet-card" rounded="xl" elevation="1">
              <div class="section-heading">
                <h2>以太网接口</h2>
                <v-chip size="small" variant="tonal" color="primary">{{ ethernetPorts.length }} 个接口</v-chip>
              </div>
              <div v-if="ethernetPorts.length" class="ethernet-port-list">
                <div v-for="port in ethernetPorts" :key="port.name" class="ethernet-port-item">
                  <div class="ethernet-port-content">
                    <div class="ethernet-port-heading">
                      <div class="ethernet-port-identity">
                        <div class="ethernet-port-icon" :class="{ 'is-up': port.up }">
                          <v-icon icon="mdi-ethernet" size="19"/>
                        </div>
                        <strong>{{ port.name }}</strong>
                      </div>
                      <v-chip size="x-small" variant="tonal" :color="port.up ? 'success' : 'secondary'">
                        {{ port.up ? '已连接' : '未连接' }}
                      </v-chip>
                    </div>
                    <div class="ethernet-port-traffic">
                      <span class="ethernet-rx"><v-icon icon="mdi-arrow-down" size="14"/> RX {{ port.rxRateBps == null ? '--' : prettyRate(port.rxRateBps) }}</span>
                      <span class="ethernet-tx"><v-icon icon="mdi-arrow-up" size="14"/> TX {{ port.txRateBps == null ? '--' : prettyRate(port.txRateBps) }}</span>
                    </div>
                    <div class="ethernet-port-counters">
                      <span>累计接收 <strong>{{ port.rxBytes == null ? '--' : formatBytes(port.rxBytes) }}</strong></span>
                      <span>累计发送 <strong>{{ port.txBytes == null ? '--' : formatBytes(port.txBytes) }}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
              <v-alert v-else type="info" variant="tonal" density="compact">暂未获取到物理以太网接口状态。</v-alert>
            </v-card>

            <v-card v-if="snapshot && activeTab === 'home'" id="overview-detail-storage" class="mt-4 network-card storage-card" :class="{ 'overview-detail-selected': overviewFocusedMetric === '存储' }" rounded="xl" elevation="1">
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
                无法读取磁盘分区信息。请检查 luci.getMountPoints RPC 与账号读取权限。
              </v-alert>
            </v-card>
            </div>

            <template v-if="snapshot && activeTab === 'statistics'">
              <div class="v3-monitor-subnav">
                <div><strong>详细监控</strong><small>实时指标与实际历史采样</small></div>
                <v-btn color="primary" variant="tonal" size="small" prepend-icon="mdi-chart-line"
                  @click="launchV3Tool('trends')">30 天长期趋势</v-btn>
              </div>
              <v-card class="network-card mt-4" rounded="xl" elevation="1">
                <div class="section-heading"><h2>实时带宽</h2>
                  <v-chip color="primary" variant="tonal" size="small">3 秒采样</v-chip>
                </div>
                <v-select v-model="chosenInterface" label="选择网络接口" variant="outlined"
                  density="compact" hide-details="auto" :items="availableInterfaces"
                  item-title="title" item-value="value" class="mt-2 mb-3" :disabled="!availableInterfaces.length"/>
                <div class="bandwidth-kpis">
                  <div>
                    <span>接收 RX · 当前</span>
                    <strong>{{ currentRate?.rx || '--' }}</strong>
                    <small>平均 {{ bandwidthSummary?.rxAverage ?? '--' }}</small>
                    <small>峰值 {{ bandwidthSummary?.rxPeak ?? '--' }}</small>
                  </div>
                  <div>
                    <span>发送 TX · 当前</span>
                    <strong>{{ currentRate?.tx || '--' }}</strong>
                    <small>平均 {{ bandwidthSummary?.txAverage ?? '--' }}</small>
                    <small>峰值 {{ bandwidthSummary?.txPeak ?? '--' }}</small>
                  </div>
                </div>
                <RealtimeChart v-if="bandwidthHistory.length >= 2" :samples="bandwidthHistory"
                  :series="rxTxSeries" unit=" KB/s" title="实时网络带宽曲线"/>
                <v-alert v-else class="mt-3" type="info" density="compact" variant="tonal">
                  {{ telemetryError || '正在采集接口字节计数器，至少需要两个采样点才能计算速率' }}
                </v-alert>
              </v-card>
              <v-card class="network-card mt-4" rounded="xl" elevation="1">
                <div class="section-heading"><h2>系统负载历史</h2>
                  <v-chip variant="tonal" size="small">1 / 5 / 15 分钟</v-chip>
                </div>
                <RealtimeChart v-if="loadHistory.length >= 2" :samples="loadHistory"
                  :series="loadSeries" title="系统负载历史曲线"/>
                <p v-else class="muted-hint">正在采集 system.info 负载数据，至少需要两个有效样本</p>
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
            <div class="terminal-screen" aria-label="终端设备">
              <div class="v3-terminal-status" role="group" aria-label="终端在线状态筛选">
                <button v-for="option in [
                  { id: 'all', label: '全部', count: terminalDevices.length },
                  { id: 'online', label: '在线', count: terminalDevices.filter(i => i.online).length },
                  { id: 'other', label: '离线/未知', count: terminalDevices.filter(i => !i.online).length }
                ]" :key="option.id" type="button"
                  :class="{ 'is-selected': terminalOnlineFilter === option.id }"
                  :aria-pressed="terminalOnlineFilter === option.id"
                  @click="terminalOnlineFilter = option.id">{{ option.label }} {{ option.count }}</button>
              </div>
              <div class="v3-client-search-row">
                <v-text-field v-model="clientSearch" variant="solo-filled" density="compact" flat rounded="lg"
                  hide-details clearable prepend-inner-icon="mdi-magnify" placeholder="搜索设备名称、IP、MAC"
                  aria-label="搜索设备名称、IP、MAC" class="terminal-search">
                  <template #append-inner>
                    <v-btn icon="mdi-filter-variant" size="small" variant="text"
                      :color="terminalView !== 'all' ? 'primary' : undefined"
                      :aria-expanded="showTerminalSourceFilters" aria-controls="v3-terminal-sources"
                      aria-label="展开或收起终端来源筛选" @click.stop="showTerminalSourceFilters = !showTerminalSourceFilters"/>
                    <v-menu v-model="terminalDisplayMenuOpen" location="bottom end">
                      <template #activator="{ props }">
                        <v-btn v-bind="props" icon="mdi-dots-vertical" size="small" variant="text"
                          aria-label="终端显示与排序"/>
                      </template>
                      <v-list density="compact" min-width="190" elevation="3">
                        <v-list-item :title="showIp ? '隐藏 IP 地址' : '显示 IP 地址'"
                          :prepend-icon="showIp ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                          @click="showIp = !showIp"/>
                        <v-divider class="my-1"/>
                        <v-list-item title="默认顺序" prepend-icon="mdi-format-list-bulleted"
                          :active="terminalSortMode === 'default'" @click="terminalSortMode = 'default'"/>
                        <v-list-item title="按名称排序" prepend-icon="mdi-sort-alphabetical-ascending"
                          :active="terminalSortMode === 'name'" @click="terminalSortMode = 'name'"/>
                        <v-list-item title="按 IP 排序" prepend-icon="mdi-sort-numeric-ascending"
                          :active="terminalSortMode === 'ip'" @click="terminalSortMode = 'ip'"/>
                      </v-list>
                    </v-menu>
                  </template>
                </v-text-field>
              </div>
              <div v-if="showTerminalSourceFilters" id="v3-terminal-sources"
                class="terminal-category-grid" role="group" aria-label="按终端来源筛选">
                <button v-for="category in terminalCategories" :key="category.value" type="button"
                  class="v3-source-chip" :class="{ 'is-selected': terminalView === category.value }"
                  :aria-pressed="terminalView === category.value"
                  :aria-label="category.label + '，' + category.count + ' 条'"
                  @click="terminalView = category.value">
                  <v-icon :icon="category.icon" size="16"/>
                  <span>{{ category.label }}</span><small>{{ category.count }}</small>
                </button>
              </div>
              <div v-if="terminalView !== 'all' && !showTerminalSourceFilters" class="v3-active-source">
                已筛选：{{ terminalCategories.find(category => category.value === terminalView)?.label || '终端来源' }}
                <button type="button" aria-label="清除终端来源筛选" @click="terminalView = 'all'">清除</button>
              </div>
              <div v-if="filteredClients.length" class="terminal-grid" role="list" aria-label="已发现终端列表">
                <TerminalDeviceCard v-for="item in filteredClients" :key="item.mac || item.ip || item.ip6"
                  :item="item" :show-address="showIp" @click="openTerminal(item)"/>
              </div>
              <v-empty-state v-else-if="clientSearch || terminalOnlineFilter !== 'all' || terminalView !== 'all'" icon="mdi-magnify-close"
                title="没有匹配的终端" text="请调整在线状态、数据来源或搜索条件"/>
              <v-alert v-else-if="terminalView === 'wireless' && !wifiClientData.available"
                type="info" variant="tonal" density="compact">
                无法读取 Wi-Fi 关联信息：路由器可能没有无线射频，或当前账号缺少 iwinfo RPC 权限。
              </v-alert>
              <v-alert v-else-if="terminalView === 'oaf' && !appFilterUsers.available"
                type="info" variant="tonal" density="compact">
                无法读取应用用户：请检查 OpenAppFilter 是否安装，以及当前账号的 RPC 权限。
              </v-alert>
              <v-empty-state v-else icon="mdi-devices"
                :title="terminalView === 'all' ? '暂无已发现终端' : '此来源暂无终端'"
                :text="terminalView === 'dhcp4' && !clientData.leasesAvailable
                  ? '无法读取 DHCP 租约，请检查 luci-rpc.getDHCPLeases 权限'
                  : '没有对应来源的记录；租约不等于在线状态'"/>
              <p class="v3-client-evidence">已安装微信推送时优先使用其设备备注、在线记录和连接方式；无实时数据时回退到无线关联及邻居可达状态。仅有 DHCP 租约不代表在线。</p>
            </div>
            <div class="v3-section-label v3-device-actions-heading">设备管理</div>
            <div class="v3-inline-links v3-device-actions" role="group" aria-label="终端管理工具">
              <button type="button" class="v3-inline-action" @click="launchV3Tool('parental')"><v-icon icon="mdi-shield-account-outline"/>家长控制<v-icon icon="mdi-chevron-right" size="18"/></button>
              <button type="button" class="v3-inline-action" @click="launchV3Tool('wol')"><v-icon icon="mdi-lan-connect"/>网络唤醒<v-icon icon="mdi-chevron-right" size="18"/></button>
            </div>
          </template>

          <template v-if="activeTab === 'network'">
            <section v-if="networkSection === 'hub'" class="v3-network-home">
              <header class="v3-network-status">
                <h2>网络连接</h2>
                <div class="v3-network-sections">
                  <section class="v3-network-section" aria-labelledby="v3-wan-group">
                    <div class="v3-network-group-heading">
                      <div class="v3-network-group-title"><v-icon icon="mdi-earth" size="20"/><h3 id="v3-wan-group">外网 WAN</h3></div>
                      <span class="v3-connection-status" :class="{ 'is-good': overviewWanState === '已连接' }">{{ overviewWanState }}</span>
                    </div>
                    <div class="v3-network-section-panel">
                      <div class="v3-network-section-row">
                        <span class="v3-network-row-label">WAN IPv4</span>
                        <strong class="v3-network-row-value">{{ snapshot?.wanIp || '--' }}</strong>
                      </div>
                      <div class="v3-network-section-row">
                        <span class="v3-network-row-label">WAN 连接时长</span>
                        <strong class="v3-network-row-value">{{ wanConnectionDuration }}</strong>
                      </div>
                      <div class="v3-network-section-row v3-network-section-row--ipv6">
                        <div class="v3-network-ipv6-heading">
                          <span class="v3-network-row-label">WAN6 IPv6</span>
                          <span class="v3-connection-status" :class="{ 'is-good': overviewIpv6State === '已分配' }">{{ overviewIpv6State }}</span>
                        </div>
                        <strong class="v3-network-ipv6-value">{{ snapshot?.wan6Ip || '--' }}</strong>
                      </div>
                      <div class="v3-network-section-row">
                        <span class="v3-network-row-label">WAN6 连接时长</span>
                        <strong class="v3-network-row-value">{{ wan6ConnectionDuration }}</strong>
                      </div>
                      <div class="v3-network-section-row">
                        <span class="v3-network-row-label">默认网关</span>
                        <strong class="v3-network-row-value">{{ snapshot?.gateway || '--' }}</strong>
                      </div>
                      <div class="v3-network-section-row">
                        <span class="v3-network-row-label">DNS</span>
                        <strong class="v3-network-row-value v3-network-dns-values">
                          <span v-for="(server,index) in String(snapshot?.dns || '--').split(',').map(value => value.trim()).filter(Boolean)" :key="index">{{ server }}</span>
                        </strong>
                      </div>
                      <div v-if="snapshot?.wan6ValidSeconds != null" class="v3-network-section-row">
                        <span class="v3-network-row-label">WAN6 剩余有效期</span>
                        <strong class="v3-network-row-value">{{ formatInterfaceUptime(snapshot.wan6ValidSeconds) }}</strong>
                      </div>
                    </div>
                  </section>
                  <section class="v3-network-section" aria-labelledby="v3-lan-group">
                    <div class="v3-network-group-heading">
                      <div class="v3-network-group-title"><v-icon icon="mdi-lan" size="20"/><h3 id="v3-lan-group">内网 LAN</h3></div>
                    </div>
                    <div class="v3-network-section-panel">
                      <div class="v3-network-section-row">
                        <span class="v3-network-row-label">LAN IPv4</span>
                        <strong class="v3-network-row-value">{{ snapshot?.lanIp || '--' }}</strong>
                      </div>
                      <div class="v3-network-section-row">
                        <span class="v3-network-row-label">DHCPv4</span>
                        <span class="v3-lan-service-badge" :class="lanDhcpStatus.dhcp4 === true ? 'is-on' : 'is-off'">{{ lanDhcpStatus.dhcp4 === null ? '未知' : lanDhcpStatus.dhcp4 ? '开启' : '关闭' }}</span>
                      </div>
                      <div class="v3-network-section-row">
                        <span class="v3-network-row-label">DHCPv6</span>
                        <span class="v3-lan-service-badge" :class="lanDhcpStatus.dhcp6 === true ? 'is-on' : 'is-off'">{{ lanDhcpStatus.dhcp6 === null ? '未知' : lanDhcpStatus.dhcp6 ? '开启' : '关闭' }}</span>
                      </div>
                    </div>
                  </section>
                </div>
              </header>
              <div class="v3-section-label">接口与连接</div>
              <div class="v3-feature-list v3-feature-list-primary">
                <button type="button" @click="openNetworkSection('interfaces')"><v-icon icon="mdi-lan" color="primary"/><span><strong>网络接口</strong><small>WAN / LAN / PPPoE / IPv4 / IPv6 / DHCP</small></span><v-icon icon="mdi-chevron-right"/></button>
                <button type="button" @click="openNetworkSection('devices')"><v-icon icon="mdi-ethernet" color="primary"/><span><strong>物理设备</strong><small>以太网端口、物理网络设备</small></span><v-icon icon="mdi-chevron-right"/></button>
                <button type="button" @click="openNetworkSection('wireless')"><v-icon icon="mdi-wifi" color="primary"/><span><strong>无线设备</strong><small>当前无线硬件与网络状态（只读）</small></span><v-icon icon="mdi-chevron-right"/></button>
              </div>
              <div class="v3-section-label">网络服务与策略</div>
              <div class="v3-feature-list v3-feature-list-secondary">
                <button v-for="tool in networkFeatureTools" :key="tool.id" type="button" @click="launchV3Tool(tool.id)">
                  <v-icon :icon="tool.icon" color="primary"/><span><strong>{{ tool.title }}</strong><small>{{ tool.subtitle }}</small></span><v-icon icon="mdi-chevron-right"/>
                </button>
              </div>
            </section>
            <template v-else>
            <!-- The Network hub is the single level of interface/hardware selection. -->
            <div class="xxwrt-network-view">
            <template v-if="networkView === 'interfaces'">
              <NetworkInterfacesPanel v-if="client" ref="networkInterfacesPanel"
                :client="client" :interfaces="networkInterfaces"
                :format-uptime="formatInterfaceUptime" :valid-seconds="ipv6ValidSeconds"
                @refresh="refreshDashboard"/>
            </template>
            <template v-else-if="networkView === 'devices'">
              <v-card rounded="xl" elevation="1" class="network-card mb-3">
                <NetworkHardwareList :wired="networkHardware.wired" :wireless="[]"/>
              </v-card>
              <v-alert v-if="!networkHardware.wired.length" type="info" variant="tonal" density="compact">暂未获取到有线网络设备。</v-alert>
            </template>
            <template v-else>
              <v-card rounded="xl" elevation="1" class="network-card mb-3">
                <NetworkHardwareList :wired="[]" :wireless="networkHardware.wireless"/>
              </v-card>
              <v-alert v-if="!networkHardware.wireless.length" type="info" variant="tonal" density="compact">暂未获取到无线设备。</v-alert>
            </template>
            </div>
            </template>
          </template>

          <template v-if="activeTab === 'apps'">
            <template v-if="!toolPanel">
              <div class="app-hub">
                <div class="app-hub-search v3-tools-native-search" role="search" aria-label="工具搜索">
                  <v-icon icon="mdi-magnify" size="23" aria-hidden="true"/>
                  <input type="text" :value="appSearch"
                    @input="event => { appSearch = event.target.value }"
                    aria-label="搜索功能与插件" placeholder="搜索功能与插件"
                    autocomplete="off" enterkeyhint="search" spellcheck="false"/>
                  <button v-if="hasAppSearch" type="button" aria-label="清除工具搜索"
                    @click="appSearch = ''">
                    <v-icon icon="mdi-close-circle" size="20"/>
                  </button>
                </div>

                <template v-if="hasAppSearch">
                  <div class="app-hub-section-heading">
                    <strong>搜索结果</strong>
                    <small>{{ appSearchResults.length }} 项</small>
                  </div>
                  <div v-if="appSearchResults.length" class="app-tool-list app-search-results">
                    <button v-for="tool in appSearchResults" :key="tool.id" type="button"
                      class="app-tool-row" :class="{ 'is-danger': isDangerousApp(tool.id) }"
                      :aria-label="'打开' + tool.title" @click="launchV3Tool(tool.id)">
                      <span class="app-tool-icon"><v-icon :icon="tool.icon" size="21"/></span>
                      <span class="app-tool-copy"><strong>{{ tool.title }}</strong><small>{{ tool.subtitle }}</small></span>
                      <v-chip v-if="pluginDirectoryTools.some(plugin => plugin.id === tool.id)" class="v3-plugin-state-tag" size="x-small" variant="tonal" :color="pluginDetectionState(tool.id).color">{{ pluginDetectionState(tool.id).label }}</v-chip>
                      <v-icon icon="mdi-chevron-right" size="20" class="app-tool-chevron"/>
                    </button>
                  </div>
                  <div v-else class="app-hub-empty">没有找到匹配的应用或功能。</div>
                </template>

                <template v-else>
                  <section class="app-hub-favorites" aria-label="常用应用">
                    <div class="app-hub-section-heading">
                      <strong>我的快捷</strong>
                      <v-btn size="small" variant="text" prepend-icon="mdi-pencil-outline"
                        aria-label="编辑常用应用" @click="favoriteEditorOpen = true">编辑</v-btn>
                    </div>
                    <div class="app-favorites-grid">
                      <button v-for="tool in favoriteTools" :key="tool.id" type="button"
                        class="app-favorite-tile" :aria-label="'打开' + tool.title"
                        @click="launchV3Tool(tool.id)">
                        <v-avatar rounded="lg" size="44" color="primary" variant="tonal">
                          <v-icon :icon="tool.icon" size="23"/>
                        </v-avatar>
                        <span>{{ tool.title }}</span>
                      </button>
                      </div>
                    <p v-if="!favoriteTools.length" class="app-hub-hint">暂无常用应用，点击编辑添加。</p>
                  </section>

                  <section id="app-category-list" class="app-hub-categories" aria-label="全部功能">
                    <div class="app-hub-section-heading">
                      <strong>分类工具</strong>
                      <small>共 {{ appCategories.reduce((count, group) => count + group.tools.length, 0) }} 项功能</small>
                    </div>
                    <div v-for="category in appCategories" :key="category.id" class="app-category-card">
                      <button type="button" class="app-category-toggle"
                        :aria-expanded="expandedAppCategories.includes(category.id)"
                        :aria-controls="'app-category-' + category.id"
                        :aria-label="(expandedAppCategories.includes(category.id) ? '收起' : '展开') + category.title"
                        @click="toggleAppCategory(category.id)">
                        <span class="app-category-icon"><v-icon :icon="category.icon" size="22"/></span>
                        <span class="app-category-copy"><strong>{{ category.title }}</strong>
                          <small>{{ category.id === 'plugins' ? category.tools.length + ' 个服务与应用管理'
                            : category.id === 'system' ? '软件包、服务、进程、Cron'
                            : category.id === 'diagnostics' ? '网络诊断、日志、安全分析'
                            : '备份、重启、恢复出厂' }}</small></span>
                        <v-icon :icon="expandedAppCategories.includes(category.id) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                          size="20" class="app-tool-chevron"/>
                      </button>
                      <v-expand-transition>
                      <div v-if="expandedAppCategories.includes(category.id)"
                        :id="'app-category-' + category.id" class="app-tool-list">
                        <button v-for="tool in category.tools" :key="tool.id" type="button"
                          class="app-tool-row" :class="{ 'is-danger': isDangerousApp(tool.id) }"
                          :aria-label="'打开' + tool.title" @click="launchV3Tool(tool.id)">
                          <span class="app-tool-icon"><v-icon :icon="tool.icon" size="21"/></span>
                          <span class="app-tool-copy"><strong>{{ tool.title }}</strong><small>{{ tool.subtitle }}</small></span>
                          <v-chip v-if="category.id === 'plugins'" class="v3-plugin-state-tag" size="x-small" variant="tonal" :color="pluginDetectionState(tool.id).color">{{ pluginDetectionState(tool.id).label }}</v-chip>
                          <v-icon icon="mdi-chevron-right" size="20" class="app-tool-chevron"/>
                        </button>
                      </div>
                      </v-expand-transition>
                    </div>
                  </section>
                  <p class="v3-app-capability-note">可用功能随固件、插件及 RPC 权限变化</p>
                </template>
              </div>

              <v-dialog v-model="favoriteEditorOpen" max-width="480" scrollable>
                <v-card rounded="xl" class="app-favorite-dialog">
                  <v-card-title>编辑常用应用</v-card-title>
                  <v-card-subtitle>最多 {{ APP_FAVORITES_LIMIT }} 个快捷入口，使用箭头调整顺序</v-card-subtitle>
                  <v-divider class="mt-3"/>
                  <v-card-text>
                    <div v-for="tool in favoriteEditorTools" :key="tool.id" class="app-favorite-edit-row">
                      <v-icon :icon="tool.icon" size="21" color="primary"/>
                      <span class="app-favorite-edit-name">{{ tool.title }}</span>
                      <div class="app-favorite-edit-actions">
                        <template v-if="activeFavoriteIds.includes(tool.id)">
                          <v-btn icon="mdi-chevron-up" size="x-small" variant="text"
                            :disabled="activeFavoriteIds.indexOf(tool.id) === 0"
                            :aria-label="'上移' + tool.title" @click="reorderFavorite(tool.id, -1)"/>
                          <v-btn icon="mdi-chevron-down" size="x-small" variant="text"
                            :disabled="activeFavoriteIds.indexOf(tool.id) === activeFavoriteIds.length - 1"
                            :aria-label="'下移' + tool.title" @click="reorderFavorite(tool.id, 1)"/>
                        </template>
                        <v-btn :icon="activeFavoriteIds.includes(tool.id) ? 'mdi-minus-circle-outline' : 'mdi-plus-circle-outline'"
                          size="small" variant="text"
                          :color="activeFavoriteIds.includes(tool.id) ? 'error' : 'primary'"
                          :disabled="!activeFavoriteIds.includes(tool.id) && activeFavoriteIds.length >= APP_FAVORITES_LIMIT"
                          :aria-label="(activeFavoriteIds.includes(tool.id) ? '移除常用' : '添加常用') + tool.title"
                          @click="updateFavorite(tool.id)"/>
                      </div>
                    </div>
                    <p class="app-hub-hint mt-3">已选择 {{ activeFavoriteIds.length }}/{{ APP_FAVORITES_LIMIT }} 项，按当前路由器分别保存。</p>
                  </v-card-text>
                  <v-card-actions>
                    <v-spacer/>
                    <v-btn color="primary" variant="tonal" @click="favoriteEditorOpen = false">完成</v-btn>
                  </v-card-actions>
                </v-card>
              </v-dialog>
            </template>
            <template v-else>
              <!-- Back and refresh moved into the top app toolbar. -->
              <v-card rounded="xl" elevation="1" class="network-card app-subpage">

                <v-progress-linear v-if="toolLoading" indeterminate class="mb-3"/>
                <v-alert v-if="['process','startup','routes'].includes(toolPanel) && legacyLoadStatus[toolPanel] === 'loading'"
                  type="info" variant="tonal" density="compact" class="mb-3" role="status">
                  正在读取{{ toolPanel === 'process' ? '进程' : toolPanel === 'startup' ? '启动项' : '路由表' }}数据…
                </v-alert>
                <CompactManagementLists
                v-else-if="['process','startup','routes'].includes(toolPanel) && legacyLoadStatus[toolPanel] === 'ready'"
                :kind="toolPanel"
                :processes="processData.processes"
                :services="serviceData.services"
                :static-routes="routeData.routes"
                :live-routes="liveRoutes.lines"
                :route-available="routeData.available || liveRoutes.available"
              />
              <div v-if="toolPanel === 'wol'" class="mt-3">
                <h3>网络唤醒</h3>
                <p class="muted-hint mb-2">支持已保存目标和 QWRT 当前邻居表中的设备。</p>
                <v-alert v-if="wolLoadStatus === 'loading' || wolLoadStatus === 'idle'"
                  type="info" variant="tonal" density="compact" class="mb-3">
                  正在读取网络唤醒配置与服务状态…
                </v-alert>
                <template v-else-if="wolLoadStatus === 'ready'">
                <v-btn-toggle v-model="wolTab" mandatory density="compact" variant="tonal" rounded="lg" color="primary" class="wol-tabs">
                  <v-btn value="targets" size="small">已保存目标 {{ wolData.targets.length }}</v-btn>
                  <v-btn value="neighbors" size="small">网络邻居 {{ wolData.neighbors.length }}</v-btn>
                </v-btn-toggle>
                <template v-if="wolTab === 'targets'">
                  <v-list v-if="wolData.targets.length" density="compact">
                    <v-list-item v-for="target in wolData.targets" :key="target.id" :title="target.name" :subtitle="target.mac + (target.iface ? ' · ' + target.iface : '')">
                      <template #append>
                        <v-btn size="small" color="primary" variant="tonal" :loading="wolBusy" @click="sendWakePacket(target)">唤醒</v-btn>
                        <v-btn icon="mdi-delete-outline" color="error" variant="text" size="small" aria-label="删除 WOL 目标" @click="wolDeleteTarget = target; wolDeleteDialog = true"/>
                      </template>
                    </v-list-item>
                  </v-list>
                  <v-alert v-else type="info" variant="tonal" density="compact" class="mt-2">暂无已保存的网络唤醒目标。</v-alert>
                  <v-alert v-if="wolData.statusKnown && !wolData.available" type="warning" density="compact" variant="tonal">WOL 唤醒工具未启用，无法在 APP 内直接唤醒设备。</v-alert>
                  <v-alert v-else-if="!wolData.statusKnown" type="info" density="compact" variant="tonal">尚未确认 WOL RPC 状态，请检查路由器是否安装 WOL 插件及当前账号权限。</v-alert>
                  <template v-if="wolData.available">
                    <h3 class="mt-4">添加网络唤醒目标</h3>
                    <form @submit.prevent="submitWolTarget">
                      <v-text-field v-model.trim="wolForm.name" label="名称" density="compact" variant="outlined" class="mt-2" required/>
                      <v-text-field v-model.trim="wolForm.mac" label="MAC 地址" placeholder="AA:BB:CC:DD:EE:FF" density="compact" variant="outlined" required/>
                      <v-select v-model="wolForm.iface" label="发送接口" density="compact" variant="outlined" :items="wolData.interfaces" clearable/>
                      <v-checkbox v-model="wolForm.broadcast" label="广播方式" density="compact" hide-details/>
                      <v-btn type="submit" block color="primary" variant="tonal" :loading="wolBusy" class="mt-2">保存 WOL 设备</v-btn>
                    </form>
                  </template>
                </template>
                <template v-else>
                  <div class="wol-neighbors-header">
                    <div><strong>已发现的网络设备</strong><span>{{ wolData.neighbors.length }} 台</span></div>
                    <p>来源为 QWRT 主机地址记录，可能包含已离线设备。</p>
                  </div>
                  <v-text-field v-if="wolData.neighbors.length" v-model="wolNeighborSearch"
                    aria-label="搜索网络邻居" label="搜索名称、IP 或 MAC"
                    prepend-inner-icon="mdi-magnify" density="compact" variant="outlined"
                    clearable hide-details class="wol-neighbors-search"/>
                  <div v-if="filteredWolNeighbors.length" class="wol-neighbor-list" role="list" aria-label="网络邻居设备列表">
                    <div v-for="neighbor in filteredWolNeighbors" :key="neighbor.mac"
                      class="wol-neighbor-card" role="listitem">
                      <div class="wol-neighbor-card__icon" aria-hidden="true">
                        <v-icon icon="mdi-laptop" size="21"/>
                      </div>
                      <div class="wol-neighbor-card__body">
                        <div class="wol-neighbor-card__header">
                          <strong class="wol-neighbor-card__name">{{ neighbor.name || '未命名设备' }}</strong>
                          <v-btn class="wol-neighbor-card__wake" size="small" color="primary" variant="tonal"
                            prepend-icon="mdi-power" :disabled="!wolData.available || wolBusy"
                            :loading="wolBusy" :aria-label="'唤醒 ' + (neighbor.name || neighbor.mac)"
                            @click="sendWakePacket({ name: neighbor.name, mac: neighbor.mac })">唤醒</v-btn>
                        </div>
                        <div class="wol-neighbor-card__details" aria-label="IP 和 MAC 地址">
                          <span class="wol-neighbor-card__address"><b>IP</b>{{ neighbor.ip || '暂无地址' }}</span>
                          <span class="wol-neighbor-card__address"><b>MAC</b>{{ neighbor.mac }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <v-alert v-else type="info" variant="tonal" density="compact" class="mt-2">
                    {{ wolData.neighbors.length ? '没有匹配的网络邻居，请更换搜索关键词。' : 'QWRT 当前没有可识别的网络邻居。' }}
                  </v-alert>
                  <v-alert v-if="wolData.statusKnown && !wolData.available" type="warning" density="compact" variant="tonal">WOL 唤醒工具未启用，仍可查看邻居，但不能发送唤醒包。</v-alert>
                  <v-alert v-else-if="!wolData.statusKnown" type="info" density="compact" variant="tonal">尚未确认 WOL RPC 状态，请检查插件安装情况及账号权限。</v-alert>
                </template>
                </template>
              </div>
              <AppFilterPanel v-if="toolPanel === 'parental' && client" :client="client"/>
              <RouterAppsPanel v-if="routerAppToolIds.includes(toolPanel) && client"
                ref="routerAppsPanel" :client="client" :kind="toolPanel"/>
              <LuckyPanel v-if="toolPanel === 'lucky' && client" ref="luckyPanel" :client="client"/>
              <VlmcsdPanel v-if="toolPanel === 'vlmcsd' && client" ref="vlmcsdPanel" :client="client"/>
              <SoftwarePackagesPanel v-if="toolPanel === 'packages' && client" ref="softwarePackagesPanel" :client="client"/>
              <RouterOperationsPanel v-if="routerOperationsToolIds.includes(toolPanel) && client"
                ref="routerOperationsPanel" :client="client" :kind="toolPanel"/>
              <AdvancedManagementPanel v-if="advancedToolIds.includes(toolPanel) && client"
                ref="advancedManagementPanel" :client="client" :kind="toolPanel" :device-id="selectedDeviceId"/>
              </v-card>
            </template>
          </template>
        </template>
      </v-container>
    </v-main>

    <v-snackbar :model-value="Boolean(errorMessage)" location="bottom" :timeout="5500"
      :style="{ bottom: '77px' }" color="error" role="alert"
      @update:model-value="!$event && (errorMessage = '')">
      {{ errorMessage }}
      <template #actions><v-btn size="small" variant="text" @click="errorMessage = ''">关闭</v-btn></template>
    </v-snackbar>
    <v-snackbar v-model="generalFeedbackOpen" location="bottom" :timeout="5200"
      :style="{ bottom: '77px' }" :color="generalFeedbackColor" role="status" aria-live="polite"
      class="router-app-floating-feedback">
      {{ generalFeedbackText }}
      <template #actions>
        <v-btn size="small" variant="text" @click="dismissGeneralFeedback">关闭</v-btn>
      </template>
    </v-snackbar>
    <v-snackbar v-model="toolFeedbackOpen" location="bottom" :timeout="toolWaiting ? -1 : 5000"
      :style="{ bottom: '77px' }" color="primary" role="status" aria-live="polite"
      class="router-app-floating-feedback">
      <div class="d-flex align-center ga-3">
        <v-progress-circular v-if="toolWaiting" indeterminate size="18" width="2"/>
        <span>{{ toolFeedbackText }}</span>
      </div>
      <template #actions>
        <v-btn v-if="!toolWaiting" variant="text" size="small" @click="dismissToolFeedback">关闭</v-btn>
      </template>
    </v-snackbar>
    <v-bottom-navigation v-if="(viewMode === 'list' || connected) && navStyle === 'standard'"
      mandatory :model-value="currentNavTab" :height="68" grow bg-color="surface"
      class="standard-bottom" color="primary" elevation="6">
      <v-btn v-for="item in pages" :key="item.id" :value="item.id" density="comfortable"
        :disabled="viewMode === 'list' && item.id !== 'home' && item.id !== 'more'"
        :aria-label="item.label" :aria-current="currentNavTab === item.id ? 'page' : undefined"
        @click="navigateBottomTab(item.id)">
        <v-icon :icon="item.icon" size="23"/><span class="nav-label">{{ item.label }}</span>
      </v-btn>
    </v-bottom-navigation>
    <div v-else-if="viewMode === 'list' || connected" class="liquid-bottom">
      <VGlass v-if="effectiveMotion" :blur="9" :scale="22" :base-frequency="0.016" class="glass-host">
        <div class="glass-nav">
          <v-btn v-for="item in pages" :key="item.id" class="glass-tab" :class="{ selected: currentNavTab === item.id }" variant="text" rounded="xl" density="compact" :aria-label="item.label" :disabled="viewMode === 'list' && item.id !== 'home' && item.id !== 'more'" @click="navigateBottomTab(item.id)">
            <v-icon :icon="item.icon" size="23"/><span>{{ item.label }}</span>
          </v-btn>
        </div>
      </VGlass>
      <div v-else class="glass-host">
        <div class="glass-nav">
          <v-btn v-for="item in pages" :key="item.id" class="glass-tab"
            :class="{selected:currentNavTab===item.id}" variant="text" rounded="xl"
            density="compact" :aria-label="item.label" :disabled="viewMode === 'list' && item.id !== 'home' && item.id !== 'more'" @click="navigateBottomTab(item.id)">
            <v-icon :icon="item.icon" size="23"/><span>{{item.label}}</span>
          </v-btn>
        </div>
      </div>
    </div>
    <OpenSourceLicensesDialog v-model="openSourceDialog"/>
    <v-dialog v-model="versionDetailsDialog" max-width="440" aria-label="应用版本详情">
      <v-card rounded="xl" class="about-info-dialog">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon icon="mdi-information-outline" color="primary"/>应用版本详情
        </v-card-title>
        <v-card-text>
          <div class="settings-detail-row"><span>应用名称</span><strong>XX-WRT</strong></div>
          <div class="settings-detail-row"><span>版本号</span><strong>v{{ installedVersion }}</strong></div>
          <div class="settings-detail-row"><span>构建号</span><strong>{{ installedBuild || '仅 Android 安装包可查询' }}</strong></div>
          <div class="settings-detail-row"><span>构建日期</span><strong>{{ installedBuildDate }}</strong></div>
          <div class="settings-detail-row"><span>应用包名</span><strong class="about-package-id" data-localize-ignore>{{ installedPackageId }}</strong></div>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" prepend-icon="mdi-content-copy" @click="copyAboutVersion">复制版本信息</v-btn>
          <v-spacer/>
          <v-btn color="primary" variant="tonal" @click="versionDetailsDialog = false">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="privacyDialog" max-width="560" scrollable aria-label="隐私与免责声明">
      <v-card rounded="xl" class="about-info-dialog">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon icon="mdi-shield-check-outline" color="primary"/>隐私与免责声明
        </v-card-title>
        <v-card-text class="about-privacy-copy">
          <h3>本地存储</h3>
          <p>已保存路由器的名称、管理地址、用户名及界面偏好保存在本机。Android 版仅在用户选择记住密码时，通过系统安全存储保存密码；不会把路由器密码写入普通的本地存储。</p>
          <h3>网络访问</h3>
          <p>路由器状态查询及管理操作通过用户配置的路由器地址进行。更新检查会访问阿里云版本服务，在不可用时访问 GitHub；点击项目或反馈入口会打开相应网站。</p>
          <h3>安全提示</h3>
          <p>使用 HTTP 管理地址、忽略 TLS 证书错误或开放远程管理入口均可能增加风险。涉及路由器配置修改时，请确认权限并提前备份。下载更新后仍需经过 Android 系统安装确认。</p>
          <h3>免责声明</h3>
          <p>本应用按现状提供路由管理功能，操作效果取决于设备固件、插件及授权。使用前请核实操作影响；第三方组件分别遵守其开源许可与使用条款。</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn color="primary" variant="tonal" @click="privacyDialog = false">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="selectedClient" :fullscreen="smAndDown" max-width="480" :persistent="terminalSaving" class="v3-terminal-detail-dialog xxwrt-v3" :class="{ 'theme-is-dark': dark }">
      <v-card v-if="selectedClient" rounded="xl" class="v3-terminal-detail">
        <v-card-title class="v3-terminal-detail-title">
          <v-btn icon="mdi-arrow-left" size="small" variant="text" color="primary"
            :disabled="terminalSaving" aria-label="返回终端列表"
            @click="selectedClient = null; terminalRequestId++"/>
          <span>终端详情</span>
        </v-card-title>
        <v-card-text>
          <header class="v3-terminal-detail-hero">
            <div class="v3-terminal-detail-heading">
              <h2>{{ selectedClient.displayName || selectedClient.name || '未知终端' }}</h2>
              <v-chip size="small" variant="tonal"
                :color="selectedClient.online ? 'success' : selectedClient.onlineKnown ? 'error' : undefined">
                {{ selectedClient.online ? '在线' : selectedClient.onlineKnown ? '离线' : '待确认' }}
              </v-chip>
            </div>
            <p>IPv4　{{ selectedClient.ip || '--' }}</p>
            <p>MAC　{{ selectedClient.mac || '--' }}</p>
            <small>连接证据：{{ selectedClient.online
              ? (selectedClient.sources?.includes('wireless') ? 'Wi-Fi 关联' : '网络邻居或可达性')
              : selectedClient.onlineKnown ? '路由器检测为离线' : '尚无可靠的在线证据' }}</small>
          </header>
          <h3 class="v3-terminal-detail-section">设备信息</h3>
          <div class="v3-terminal-detail-info">
            <div><span>设备类型</span><strong>{{ selectedClient.kind || '未知' }}</strong></div>
            <div><span>数据来源</span><strong>{{ selectedClient.sources?.join(' / ') || '--' }}</strong></div>
            <div><span>IPv6 地址</span><strong>{{ selectedClient.ip6 || '未读取' }}</strong></div>
            <div><span>MAC 地址</span><strong>{{ selectedClient.mac || '--' }}</strong></div>
          </div>
          <h3 class="v3-terminal-detail-section">常用操作</h3>
          <div class="v3-terminal-detail-actions" role="group" aria-label="终端管理操作">
            <button type="button" :disabled="!terminalSettings || terminalSaving"
              :aria-expanded="terminalDetailEditor === 'qos'"
              @click="terminalDetailEditor = terminalDetailEditor === 'qos' ? '' : 'qos'">
              <span class="v3-terminal-action-icon"><v-icon icon="mdi-speedometer" size="22"/></span>
              <span><strong>限速设置</strong><small>下载 / 上传速率限制</small></span>
              <v-icon :icon="terminalDetailEditor === 'qos' ? 'mdi-chevron-up' : 'mdi-chevron-right'" size="21"/>
            </button>
            <button type="button" :disabled="!terminalSettings || terminalSaving"
              :aria-expanded="terminalDetailEditor === 'static'"
              @click="terminalDetailEditor = terminalDetailEditor === 'static' ? '' : 'static'">
              <span class="v3-terminal-action-icon"><v-icon icon="mdi-ip-network" size="22"/></span>
              <span><strong>固定 IP</strong><small>为该终端设置静态地址</small></span>
              <v-icon :icon="terminalDetailEditor === 'static' ? 'mdi-chevron-up' : 'mdi-chevron-right'" size="21"/>
            </button>
          </div>
          <v-progress-linear v-if="terminalSettingsBusy" indeterminate color="primary" class="my-4"/>
          <v-alert v-if="terminalError" type="error" variant="tonal" density="compact" class="mt-3">{{ terminalError }}</v-alert>
          <v-alert v-if="terminalNotice" type="success" variant="tonal" density="compact" class="mt-3">{{ terminalNotice }}</v-alert>
          <template v-if="terminalSettings">
            <div v-if="terminalDetailEditor === 'static'" class="v3-terminal-detail-editor">
            <v-divider class="my-4"/>
            <div class="d-flex align-center ga-2 mb-2">
              <v-icon icon="mdi-ip-network" color="primary"/>
              <strong>静态 IPv4 绑定</strong>
            </div>
            <v-switch v-model="terminalForm.staticEnabled" label="为该 MAC 固定分配 IPv4"
              color="primary" density="compact" hide-details :disabled="terminalSaving"/>
            <v-text-field v-model.trim="terminalForm.staticIp" label="绑定 IPv4 地址"
              placeholder="例如：192.168.100.50" variant="outlined" density="compact"
              :disabled="!terminalForm.staticEnabled || terminalSaving" class="mt-2" />
            <v-text-field v-model.trim="terminalForm.name" label="DHCP 主机名"
              variant="outlined" density="compact" maxlength="63"
              :disabled="!terminalForm.staticEnabled || terminalSaving"/>
            <p class="muted-hint mb-2">使用路由器 DHCP 固定租约，不修改终端系统的网卡配置。主机名只支持英文、数字和连字符，可留空自动生成；生效后可能需要终端重新连接网络。</p>
            <v-btn color="primary" variant="tonal" block :loading="terminalSaving"
              :disabled="terminalSettingsBusy" @click="saveTerminalStatic">
              {{ terminalForm.staticEnabled ? '保存静态 IP' : '取消静态 IP 绑定' }}
            </v-btn>
            </div>
            <div v-if="terminalDetailEditor === 'qos'" class="v3-terminal-detail-editor">
            <v-divider class="my-4"/>
            <div class="d-flex align-center ga-2 mb-2">
              <v-icon icon="mdi-speedometer" color="primary"/>
              <strong>终端网速限制</strong>
            </div>
            <v-alert v-if="terminalSettings.hqosStatus?.installed"
              :type="terminalSettings.hqosStatus.error ? 'warning' : 'info'"
              density="compact" variant="tonal" class="mb-3">
              QWRT HQoS：{{ terminalSettings.hqosStatus.enabled ? '已启用' : '未启用' }}；
              {{ terminalSettings.hqosStatus.running ? '引擎运行中' : '引擎未运行' }}；
              后端 {{ terminalSettings.hqosStatus.effectiveBackend || terminalSettings.hqosStatus.mode }}；
              接口 {{ terminalSettings.hqosStatus.interface || '未指定' }}。
              <span v-if="terminalSettings.hqosStatus.error">{{ terminalSettings.hqosStatus.error }}</span>
            </v-alert>
            <v-btn v-if="terminalSettings.hqosStatus?.rpcReady" size="small" variant="outlined"
              class="mb-3" prepend-icon="mdi-cog-outline" :disabled="terminalSaving"
              @click="openHqosGlobalSettings">HQoS 全局设置</v-btn>
            <v-select v-if="terminalSettings.qosBackends?.length"
              label="管理 QoS 后端" :model-value="terminalSettings.selectedBackend"
              :items="terminalSettings.qosBackends.map(item => ({
                value: item.id,
                title: item.label + ' · ' + (item.running ? '运行中' :
                  item.enabled ? '配置已启用' : '未启用') +
                  (item.writable ? '' : '（只读）')
              }))" item-title="title" item-value="value"
              variant="outlined" density="comfortable" class="mt-2"
              :disabled="terminalSaving || terminalSettingsBusy"
              @update:model-value="changeTerminalQosBackend"/>
            <v-alert v-if="terminalSettings.activeQosBackends?.length > 1"
              type="warning" variant="tonal" density="compact" class="mb-3">
              检测到多个配置启用的 QoS 服务：{{ terminalSettings.activeQosBackends.join('、') }}。
              这些服务可能操作同一接口或流量，实际是否冲突取决于接口和规则。
            </v-alert>
            <v-alert v-if="terminalSettings.selectedBackend && terminalSettings.conflicts?.length"
              type="warning" variant="tonal" density="compact" class="mb-3">
              其他已启用的服务：{{ terminalSettings.conflicts.join('、') }}。
              新增限速前请确认不会与现有队列或硬件加速冲突。
            </v-alert>
            <template v-if="terminalSettings.backend">
              <v-chip size="x-small" color="primary" variant="tonal" class="mb-3">
                {{ terminalSettings.backendLabel }}
              </v-chip>
              <div class="d-flex ga-2">
                <v-text-field v-model.trim="terminalForm.download"
                  :label="terminalSettings.backend === 'hqos' ? '下载限速 (kbps)' : '下载限速 (Mbps)'"
                  :placeholder="terminalSettings.backend === 'hqos' ? '0 表示不限速' : '不限速'"
                  type="number" :min="terminalSettings.backend === 'hqos' ? 0 : 1"
                  :max="terminalSettings.backend === 'hqos' ? terminalSettings.hqosStatus.maxRate : 10000"
                  step="1" variant="outlined" density="compact" :disabled="terminalSaving" hide-details="auto"/>
                <v-text-field v-model.trim="terminalForm.upload"
                  :label="terminalSettings.backend === 'hqos' ? '上传限速 (kbps)' : '上传限速 (Mbps)'"
                  :placeholder="terminalSettings.backend === 'hqos' ? '0 表示不限速' : '不限速'"
                  type="number" :min="terminalSettings.backend === 'hqos' ? 0 : 1"
                  :max="terminalSettings.backend === 'hqos' ? terminalSettings.hqosStatus.maxRate : 10000"
                  step="1" variant="outlined" density="compact" :disabled="terminalSaving" hide-details="auto"/>
              </div>
              <template v-if="terminalSettings.backend === 'hqos'">
                <v-text-field v-model.trim="terminalForm.connections" label="并发连接数"
                  placeholder="0 表示不限" type="number" min="0" max="65535" step="1"
                  variant="outlined" density="compact" class="mt-3"
                  :disabled="terminalSaving" hide-details="auto"/>
                <p class="muted-hint my-2">
                  与 Web 端 HQoS 使用同一套 MAC 规则，IPv4 / IPv6 共享上传、下载及连接数额度。
                  单位 kbps，0 表示不限速；三项均为 0 可清除该 MAC 的 QoS 规则。
                  {{ terminalSettings.hqosStatus.enabled ? '' : '当前 HQoS 未启用，保存非零限额将自动启用全局 HQoS，操作前再次确认。' }}
                  <span v-if="terminalSettings.hqosRule?.enabled === false">
                    原规则已禁用，重新保存非零额度会将其启用。
                  </span>
                </p>
              </template>
              <p v-else class="muted-hint my-2">
                留空表示不限速，清空两项并保存可取消规则。
                {{ terminalSettings.backend === 'eqos' ? 'EQOS 需要上下行同时设置。' : '' }}
                限速按 IPv4 生效，建议先绑定静态 IP，避免 DHCP 续租后限制到其他设备。
              </p>
              <v-btn color="primary" variant="tonal" block :loading="terminalSaving"
                :disabled="terminalSettingsBusy || (terminalSettings.backend !== 'hqos' && !terminalSettings.activeIP)"
                  @click="saveTerminalQos()">保存终端限速</v-btn>
            </template>
            <v-alert v-else type="info" density="compact" variant="tonal" class="mt-2">
              {{ terminalSettings.reason }}。静态 IP 绑定仍可独立使用。
            </v-alert>
            </div>
          </template>
        </v-card-text>
        <v-card-actions><v-spacer/><v-btn variant="text" :disabled="terminalSaving"
          @click="selectedClient = null; terminalRequestId++">关闭</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="hqosGlobalDialog" max-width="540" persistent>
      <v-card rounded="xl">
        <v-card-title>HQoS 全局设置</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-3">
            这组设置影响所有客户端。更改硬件/CPU 后端和 QoS 接口可能中断转发或影响硬件加速；
            切换前请核对路由器设备是否支持。
          </v-alert>
          <v-switch v-model="hqosGlobalForm.enabled" label="启用 HQoS" color="primary"
            :disabled="hqosGlobalBusy" hide-details density="comfortable"/>
          <v-select v-model="hqosGlobalForm.backend" label="QoS 后端"
            :items="hqosBackendOptions" item-title="title" item-value="value"
            density="comfortable" variant="outlined" :disabled="hqosGlobalBusy"/>
          <v-select v-model="hqosGlobalForm.interface" label="QoS 接口"
            :items="hqosInterfaceOptions" density="comfortable" variant="outlined"
            :disabled="hqosGlobalBusy"/>
          <p class="muted-hint">自动模式优先使用支持的硬件后端，否则使用 CPU。
            如果选择硬件后端，只能使用 LAN / br-lan；CPU 模式可能需要关闭硬件流量加速。</p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" :disabled="hqosGlobalBusy" @click="hqosGlobalDialog = false">取消</v-btn>
          <v-spacer/>
          <v-btn color="primary" :disabled="hqosGlobalBusy" @click="hqosGlobalConfirm = true">保存并应用…</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="hqosGlobalConfirm" max-width="430" persistent>
      <v-card rounded="xl">
        <v-card-title>确认修改所有客户端的 QoS？</v-card-title>
        <v-card-text>
          启用状态：{{ hqosGlobalForm.enabled ? '启用' : '禁用' }}。
          后端：{{ hqosGlobalForm.backend }}；接口：{{ hqosGlobalForm.interface }}。
          保存后会应用原生 HQoS 服务，失败时尝试自动恢复原配置。
          <v-alert v-if="hqosGlobalForm.enabled && terminalSettings?.qosBackends?.some(item => item.id !== 'hqos' && item.enabled)"
            type="warning" variant="tonal" density="compact" class="mt-3">
            其他 QoS 服务正在配置为启用：
            {{ terminalSettings.qosBackends.filter(item => item.id !== 'hqos' && item.enabled).map(item => item.label).join('、') }}。
            可能存在重复整形或硬件加速冲突；确认后只更改 HQoS 全局配置。
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="hqosGlobalConfirm = false">取消</v-btn>
          <v-spacer/>
          <v-btn color="warning" @click="persistHqosGlobalSettings">确认修改</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="qosWriteConfirm" max-width="430" persistent>
      <v-card rounded="xl">
        <v-card-title>确认 QoS 变更风险</v-card-title>
        <v-card-text>
          <p v-if="terminalSettings?.backend === 'hqos' && !terminalSettings.hqosStatus.enabled">
            当前 HQoS 已关闭。设置此 MAC 的非零限额会由原生 hqos.set 自动启用全局 HQoS，
            可能影响其他客户端、转发路径与硬件加速。
          </p>
          <v-alert v-if="terminalSettings?.conflicts?.length" type="warning" variant="tonal"
            density="compact" class="my-3">
            其他已启用的 QoS 服务：{{ terminalSettings.conflicts.join('、') }}。
            不同服务可能在同一接口或相同数据流上重复整形。
            请先核对服务的作用接口和规则；确认后才会向所选后端写入限额。
          </v-alert>
          <p class="mt-2">本操作只修改当前选择的 {{ terminalSettings?.backendLabel }} 后端规则，
            不会自动关闭或迁移其他 QoS 配置。</p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="qosWriteConfirm = false">取消</v-btn>
          <v-spacer/>
          <v-btn color="warning" :loading="terminalSaving"
            @click="qosWriteConfirm = false; saveTerminalQos(true)">确认风险并保存</v-btn>
        </v-card-actions>
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
            <v-checkbox v-if="isNative && deviceForm.address.startsWith('https://')"
              v-model="deviceForm.ignoreTlsErrors" color="warning" hide-details
              label="忽略此设备 HTTPS 证书错误（不安全）"/>
            <p class="muted-hint">设备地址可以是 HTTPS 公网域名。更换地址时会自动取消此前的证书例外。</p>
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
            <v-checkbox v-if="isNative && selectedDevice?.address?.startsWith('https://')"
              v-model="loginIgnoreTls" label="忽略此路由器 HTTPS 证书错误（不安全）"
              color="warning" hide-details class="mt-2"/>
            <v-alert v-if="loginIgnoreTls && selectedDevice?.address?.startsWith('https://')"
              type="warning" variant="tonal" density="compact" class="mt-2">
              将跳过此路由器的证书链和域名校验，可能泄露登录密码。仅用于完全可信的自签名路由器；优先修复证书。
            </v-alert>
            <p v-else class="muted-hint">网页预览不保存密码；Android 安装版支持安全存储。</p>
          </form>
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
    <v-dialog v-model="releaseNotesDialog" max-width="620" scrollable>
      <v-card rounded="xl" class="release-notes-dialog">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon icon="mdi-text-box-outline" color="primary"/>
          <span>最新版本变更日志</span>
        </v-card-title>
        <v-card-subtitle v-if="releaseNotesVersion">
          v{{ releaseNotesVersion }} · {{ releaseNotesSource === 'mirror' ? '阿里云' : releaseNotesSource === 'github' ? 'GitHub 备用' : '正在获取日志' }}
        </v-card-subtitle>
        <v-divider class="mt-3"/>
        <v-card-text class="release-notes-scroll">
          <div v-if="releaseNotesLoading" class="d-flex align-center ga-3 py-4" role="status">
            <v-progress-circular indeterminate size="22" color="primary"/>
            <span>正在获取版本日志…</span>
          </div>
          <v-alert v-else-if="releaseNotesError" type="warning" variant="tonal" density="compact">
            {{ releaseNotesError }}
          </v-alert>
          <div v-else class="release-notes-content" role="document">
            <template v-for="(line, index) in releaseNotesBlocks" :key="index">
              <h3 v-if="line.kind === 'heading'" class="release-notes-heading">{{ line.text }}</h3>
              <p v-else-if="line.kind === 'bullet'" class="release-notes-bullet">{{ line.text }}</p>
              <p v-else class="release-notes-paragraph">{{ line.text }}</p>
            </template>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" @click="releaseNotesDialog = false">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="updateDialog" max-width="420" :persistent="downloadBusy">
      <v-card rounded="xl">
        <v-card-title class="d-flex align-center ga-2"><v-icon icon="mdi-update" color="primary"/>发现应用新版本</v-card-title>
        <v-card-text v-if="latestRelease">
          当前版本 v{{ installedVersion }}，正式版已更新至 v{{ latestRelease.version }}。
          <p class="mt-3">在 APP 内下载并校验 APK，完成后自动打开 Android 系统安装确认界面。</p>
          <div v-if="downloadBusy" class="mt-4" role="status">
            <div class="d-flex justify-space-between mb-2"><span>正在下载</span><strong>{{ downloadPercent }}%</strong></div>
            <v-progress-linear :model-value="downloadPercent" height="9" rounded color="primary"/>
            <p class="text-caption text-medium-emphasis mt-2">{{ downloadProgressText }}</p>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn v-if="downloadBusy" variant="text" color="warning" @click="cancelApkDownload">取消下载</v-btn>
          <v-btn v-else variant="text" @click="updateDialog = false">暂不更新</v-btn>
          <v-btn color="primary" prepend-icon="mdi-download" :disabled="downloadBusy"
            @click="downloadLatestApk">{{ isNative ? '下载并安装' : '下载最新 APK' }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>
