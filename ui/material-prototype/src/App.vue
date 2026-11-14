<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import { VGlass } from '@daisigu/vue-liquid-glass'

const theme = useTheme()
const pages = [
  { id: 'home', label: '首页', icon: 'mdi-home-outline' },
  { id: 'statistics', label: '统计', icon: 'mdi-chart-box-outline' },
  { id: 'clients', label: '终端', icon: 'mdi-devices' },
  { id: 'network', label: '网络', icon: 'mdi-lan' },
  { id: 'apps', label: '应用', icon: 'mdi-apps' }
]

const internetChecks = [
  { id: 'netease_music', label: '网易云', online: true },
  { id: 'telegram', label: 'Telegram', online: true },
  { id: 'baidu', label: 'Baidu', online: true },
  { id: 'chatgpt', label: 'ChatGPT', online: true },
  { id: 'google', label: 'Google', online: false },
  { id: 'github', label: 'GitHub', online: true },
  { id: 'youtube', label: 'YouTube', online: true },
  { id: 'internet', label: 'Internet', online: true }
]

const storageKey = 'xxwrt_material_nav_style'
const navStyle = ref(localStorage.getItem(storageKey) === 'liquid' ? 'liquid' : 'standard')
const activeTab = ref('home')
const colorMode = ref('system')
const systemDark = ref(false)
const dark = computed(() => colorMode.value === 'dark' || (colorMode.value === 'system' && systemDark.value))
const pageTitle = computed(() => pages.find(p => p.id === activeTab.value)?.label || '首页')
const onlineCount = computed(() => internetChecks.filter(x => x.online).length)
const otherCards = [
  { label: 'CPU 占用', value: '3%', detail: '负载 0.26 / 0.30 / 0.30', icon: 'mdi-chip', progress: 3 },
  { label: '内存占用', value: '10%', detail: '791 MB / 7.6 GB', icon: 'mdi-memory', progress: 10 },
  { label: '内存缓存', value: '6%', detail: '430 MB / 7.6 GB', icon: 'mdi-chart-timeline-variant', progress: 6 },
  { label: '连接数', value: '3%', detail: '1766 / 65535', icon: 'mdi-lan-connect', progress: 3 }
]
let mediaQuery = null
let systemListener = null

watch(navStyle, value => localStorage.setItem(storageKey, value))
watch(dark, value => { theme.global.name.value = value ? 'dark' : 'light' }, { immediate: true })

onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mediaQuery.matches
  systemListener = event => { systemDark.value = event.matches }
  mediaQuery.addEventListener?.('change', systemListener)
})
onUnmounted(() => { mediaQuery?.removeEventListener?.('change', systemListener) })
</script>

<template>
  <v-app class="material-demo" :class="{ 'theme-is-dark': dark }">
    <v-app-bar flat color="surface" height="64" class="top-bar">
      <v-toolbar-title class="app-name">QWRT</v-toolbar-title>
      <v-spacer />
      <v-btn-toggle v-model="navStyle" density="compact" mandatory variant="outlined" divided class="style-choice" color="primary">
        <v-btn value="standard" size="small" aria-label="标准底栏">标准</v-btn>
        <v-btn value="liquid" size="small" aria-label="液态底栏">液态</v-btn>
      </v-btn-toggle>
    </v-app-bar>

    <v-main>
      <v-container class="main-container">
        <div class="eyebrow">MATERIAL UI PREVIEW · 非联网实测</div>
        <div class="page-head">
          <h1>{{ pageTitle }}</h1>
          <v-chip size="small" prepend-icon="mdi-palette-outline" variant="tonal" color="primary">UI 美化分支</v-chip>
        </div>

        <template v-if="activeTab === 'home'">
          <v-card rounded="xl" elevation="1" class="device-card">
            <div class="device-heading">
              <v-avatar color="primary" variant="tonal" rounded="lg" size="52">
                <v-icon icon="mdi-router-wireless" size="30"/>
              </v-avatar>
              <div class="device-heading-label">
                <h2>J4125 SoftRouter</h2>
                <p>QWRT R26.11.13 · x86/64</p>
              </div>
              <v-icon icon="mdi-check-circle" color="success" size="24"/>
            </div>
            <v-divider class="my-3"/>
            <div class="details">
              <div><span>主机名</span><strong>QWRT</strong></div>
              <div><span>CPU</span><strong>Intel Celeron J4125</strong></div>
              <div><span>内核版本</span><strong>7.3.4</strong></div>
              <div><span>设备温度</span><strong>39℃</strong></div>
              <div><span>运行时间</span><strong>0d 18h 49m</strong></div>
            </div>

            <section class="detector-area">
              <div class="section-heading">
                <h3>联网监测</h3>
                <v-chip size="small" variant="tonal" :color="onlineCount === internetChecks.length ? 'success' : 'error'">
                  {{ onlineCount }} / {{ internetChecks.length }} 正常
                </v-chip>
              </div>
              <div class="detector-grid">
                <v-chip
                  v-for="check in internetChecks"
                  :key="check.id"
                  size="small"
                  :color="check.online ? 'success' : 'error'"
                  variant="tonal"
                  class="status-chip"
                >
                  <v-icon start :icon="check.online ? 'mdi-circle' : 'mdi-alert-circle'" size="10" />
                  <span class="chip-name">{{ check.label }}</span>
                  <span class="chip-state">{{ check.online ? '已连接' : '已断开' }}</span>
                </v-chip>
              </div>
            </section>
          </v-card>

          <div class="resource-grid">
            <v-card v-for="item in otherCards" :key="item.label" rounded="xl" elevation="1" class="resource-card">
              <div class="resource-top"><span>{{ item.label }}</span><v-icon :icon="item.icon" color="secondary" size="22"/></div>
              <strong>{{ item.value }}</strong>
              <small>{{ item.detail }}</small>
              <v-progress-linear :model-value="item.progress" rounded height="4" color="primary" class="mt-3"/>
            </v-card>
          </div>
        </template>
        <template v-else>
          <v-card rounded="xl" elevation="1" class="placeholder-card">
            <v-avatar size="64" color="primary" variant="tonal"><v-icon :icon="pages.find(p => p.id === activeTab)?.icon" size="30" /></v-avatar>
            <h2>{{ pageTitle }}</h2>
            <p>当前仅演示组件样式和底部导航切换，尚未连接路由器接口。</p>
          </v-card>
        </template>

        <v-card rounded="xl" elevation="0" class="preferences mt-4">
          <div class="preferences-head"><v-icon icon="mdi-cog-outline" size="20"/><strong>外观偏好</strong></div>
          <v-select v-model="colorMode" density="compact" variant="outlined" label="主题" :items="[
            { title: '跟随系统', value: 'system' },
            { title: '浅色', value: 'light' },
            { title: '深色', value: 'dark' }
          ]" item-title="title" item-value="value" hide-details />
          <p>底栏样式：{{ navStyle === 'liquid' ? '液态玻璃（开源组件）' : 'Material 标准底栏（Vuetify）' }}</p>
        </v-card>
        <p class="demo-notice">原型数据为演示数据；不会连接、修改或控制真实 QWRT 路由器。</p>
      </v-container>
    </v-main>

    <v-bottom-navigation
      v-if="navStyle === 'standard'"
      v-model="activeTab"
      :height="68"
      grow
      bg-color="surface"
      class="standard-bottom"
      color="primary"
      elevation="6"
    >
      <v-btn v-for="item in pages" :key="item.id" :value="item.id" density="comfortable">
        <v-icon :icon="item.icon" size="23"/>
        <span class="nav-label">{{ item.label }}</span>
      </v-btn>
    </v-bottom-navigation>

    <div v-else class="liquid-bottom">
      <VGlass :blur="9" :scale="22" :base-frequency="0.016" class="glass-host">
        <div class="glass-nav">
          <v-btn v-for="item in pages" :key="item.id" class="glass-tab"
                 :class="{ selected: activeTab === item.id }"
                 variant="text" rounded="xl" density="compact"
                 :aria-label="item.label" @click="activeTab = item.id">
            <v-icon :icon="item.icon" size="23" />
            <span>{{ item.label }}</span>
          </v-btn>
        </div>
      </VGlass>
    </div>
  </v-app>
</template>
