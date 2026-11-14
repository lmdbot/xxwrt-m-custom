<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { useTheme } from 'vuetify'
import { VGlass } from '@daisigu/vue-liquid-glass'
import { Browser } from '@capacitor/browser'
import {
  RouterClient, readDashboard, readClients, readServices,
  shortError
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
const form = reactive({
  address: localStorage.getItem(storage.host) || 'http://192.168.100.1',
  username: 'root',
  password: '',
  showPassword: false
})
const navStyle = ref(localStorage.getItem(storage.nav) === 'liquid' ? 'liquid' : 'standard')
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
const actionBusy = ref(false)
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
let mediaQuery, systemListener, refreshTimer

watch(navStyle, v => localStorage.setItem(storage.nav, v))
watch(colorMode, v => localStorage.setItem(storage.theme, v))
watch(dark, v => { theme.global.name.value = v ? 'dark' : 'light' }, { immediate: true })
watch(activeTab, () => { if (connected.value) refreshCurrent() })

function resetSession() {
  client.value?.logout()
  client.value = null
  connected.value = false
  snapshot.value = null
  clientData.value = { data: [], ipv6: [], leasesAvailable: false }
  serviceData.value = { services: [], available: false }
  form.password = ''
  errorMessage.value = ''
  activeTab.value = 'home'
}

async function connect() {
  if (connecting.value) return
  connecting.value = true
  errorMessage.value = ''
  try {
    const api = new RouterClient(form.address)
    await api.login(form.username, form.password)
    client.value = api
    connected.value = true
    localStorage.setItem(storage.host, api.baseUrl)
    form.address = api.baseUrl
    form.password = '' // never keep the router password in browser storage
    await refreshDashboard()
  } catch (e) {
    errorMessage.value = shortError(e)
    resetConnectionOnError()
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

async function openRouterWeb() {
  if (!client.value) return
  try {
    await Browser.open({ url: client.value.baseUrl + '/cgi-bin/luci/', windowName: '_blank' })
  } catch (e) {
    handleRpcError(e)
  }
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
  refreshTimer = setInterval(() => {
    if (connected.value && activeTab.value === 'home' && !refreshing.value) refreshDashboard()
  }, 12000)
})
onUnmounted(() => {
  mediaQuery?.removeEventListener?.('change', systemListener)
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <v-app class="material-demo" :class="{ 'theme-is-dark': dark }">
    <v-app-bar flat color="surface" height="64" class="top-bar">
      <v-toolbar-title class="app-name">QWRT</v-toolbar-title>
      <v-spacer />
      <v-btn-toggle v-model="navStyle" density="compact" mandatory variant="outlined" divided class="style-choice" color="primary" aria-label="底栏样式">
        <v-btn value="standard" size="small" aria-label="标准底栏">标准</v-btn>
        <v-btn value="liquid" size="small" aria-label="液态底栏">液态</v-btn>
      </v-btn-toggle>
      <v-btn v-if="connected" icon="mdi-logout" size="small" aria-label="退出登录" @click="resetSession"/>
    </v-app-bar>

    <v-main>
      <v-container class="main-container">
        <template v-if="!connected">
          <div class="eyebrow">MATERIAL UI · QWRT REAL RPC</div>
          <div class="page-head"><h1>连接路由器</h1></div>
          <v-card rounded="xl" elevation="1" class="login-card">
            <div class="device-heading mb-5">
              <v-avatar color="primary" variant="tonal" rounded="lg" size="54"><v-icon icon="mdi-router-wireless" size="30"/></v-avatar>
              <div class="device-heading-label">
                <h2>登录 QWRT / OpenWrt</h2>
                <p>使用路由器自身的 ubus / rpcd 认证</p>
              </div>
            </div>
            <form @submit.prevent="connect">
              <v-text-field v-model.trim="form.address" variant="outlined" density="comfortable" label="设备地址" placeholder="http://192.168.100.1" prepend-inner-icon="mdi-lan" autocapitalize="off" autocomplete="url" required />
              <v-text-field v-model.trim="form.username" variant="outlined" density="comfortable" label="用户名" prepend-inner-icon="mdi-account-outline" autocomplete="username" required />
              <v-text-field v-model="form.password" variant="outlined" density="comfortable" label="登录密码" prepend-inner-icon="mdi-lock-outline" :type="form.showPassword ? 'text' : 'password'" :append-inner-icon="form.showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" @click:append-inner="form.showPassword = !form.showPassword" autocomplete="current-password" required />
              <v-btn type="submit" color="primary" size="large" rounded="xl" :loading="connecting" block prepend-icon="mdi-login">连接并读取路由器</v-btn>
            </form>
            <p class="login-hint">地址、端口可修改。只保存路由器地址，密码不会保存到本地。HTTP 登录信息在局域网内明文传输，远程访问建议使用可信 HTTPS 或 VPN。</p>
          </v-card>
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
            <v-card class="network-card" rounded="xl" elevation="1">
              <div class="section-heading"><h2>DHCP 终端租约</h2><v-chip color="primary" variant="tonal" size="small">{{ clientData.data.length }} 条</v-chip></div>
              <p class="muted-hint">DHCP 租约不等于设备当前在线状态。此页直接读取路由器返回的终端地址与主机名。</p>
              <v-list v-if="clientData.data.length" bg-color="transparent">
                <v-list-item v-for="item in clientData.data" :key="item.mac || item.ip" class="client-item" prepend-icon="mdi-laptop">
                  <v-list-item-title>{{ item.name }}</v-list-item-title>
                  <v-list-item-subtitle>{{ item.ip }} · {{ item.mac }}</v-list-item-subtitle>
                </v-list-item>
              </v-list>
              <v-empty-state v-else icon="mdi-devices" :title="clientData.leasesAvailable ? '暂无 DHCP 租约' : '无法获取 DHCP 租约'" text="确认固件包含 luci-rpc.getDHCPLeases 接口并授权访问"/>
            </v-card>
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
              <h2>路由器维护</h2>
              <v-btn variant="tonal" color="error" class="mt-3" prepend-icon="mdi-restart" @click="confirmReboot = true">重启路由器</v-btn>
            </v-card>
          </template>

          <v-card rounded="xl" elevation="0" class="preferences mt-4">
            <div class="preferences-head"><v-icon icon="mdi-cog-outline" size="20"/><strong>管理与外观</strong></div>
            <v-btn block variant="outlined" color="primary" prepend-icon="mdi-open-in-new" @click="openRouterWeb">打开路由器 LuCI 管理页面</v-btn>
            <v-select v-model="colorMode" class="mt-3" density="compact" variant="outlined" label="主题" :items="[
              { title: '跟随系统', value: 'system' },
              { title: '浅色', value: 'light' },
              { title: '深色', value: 'dark' }
            ]" item-title="title" item-value="value" hide-details/>
            <p>底栏：{{ navStyle === 'liquid' ? '液态玻璃' : 'Material 标准' }} · 仅设备地址保存在本地</p>
          </v-card>
        </template>
        <v-alert v-if="errorMessage && !connected" class="mt-4" type="error" variant="tonal">{{ errorMessage }}</v-alert>
        <p class="demo-notice">非官方 Material UI · 通过真实 QWRT ubus 接口读取数据</p>
      </v-container>
    </v-main>

    <v-bottom-navigation v-if="connected && navStyle === 'standard'" v-model="activeTab" :height="68" grow bg-color="surface" class="standard-bottom" color="primary" elevation="6">
      <v-btn v-for="item in pages" :key="item.id" :value="item.id" density="comfortable">
        <v-icon :icon="item.icon" size="23"/><span class="nav-label">{{ item.label }}</span>
      </v-btn>
    </v-bottom-navigation>
    <div v-else-if="connected" class="liquid-bottom">
      <VGlass :blur="9" :scale="22" :base-frequency="0.016" class="glass-host">
        <div class="glass-nav">
          <v-btn v-for="item in pages" :key="item.id" class="glass-tab" :class="{ selected: activeTab === item.id }" variant="text" rounded="xl" density="compact" :aria-label="item.label" @click="activeTab = item.id">
            <v-icon :icon="item.icon" size="23"/><span>{{ item.label }}</span>
          </v-btn>
        </div>
      </VGlass>
    </div>
    <v-dialog v-model="confirmReboot" max-width="360">
      <v-card rounded="xl" title="确认重启 QWRT">
        <v-card-text>此操作将断开所有连接并重启路由器。确定执行吗？</v-card-text>
        <v-card-actions><v-spacer/><v-btn variant="text" @click="confirmReboot = false">取消</v-btn><v-btn color="error" :loading="actionBusy" @click="rebootRouter">确认重启</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>
