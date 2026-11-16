<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { shortError } from '../services/router.js'
import {
  filterPackageList, installPackageUrl, readDiskSpace, readOpkgConfig,
  readPackageList, runPackageAction, saveOpkgConfig, validatePackageName,
  uploadPackageFile
} from '../services/packageManager.js'

const props = defineProps({ client: { type: Object, required: true } })
const activeTab = ref('available')
const rows = ref({ available: [], installed: [], upgradable: [] })
const loaded = ref({ available: false, installed: false, upgradable: false })
const loading = ref(false)
const busy = ref(false)
const search = ref('')
const page = ref(1)
const showTranslations = ref('filtered')
const installInput = ref('')
const uploadFile = ref(null)
const disk = ref(null)
const configOpen = ref(false)
const configPath = ref('/etc/opkg.conf')
const configText = ref('')
const configLoading = ref(false)
const confirmation = ref(null)
const feedback = ref('')
const feedbackType = ref('info')
const toast = ref(false)
const output = ref('')
const pageData = computed(() => filterPackageList(
  rows.value[activeTab.value].filter(row =>
    showTranslations.value === 'all' || (showTranslations.value === 'filtered'
      ? !/^luci-i18n-/.test(row.name) : /^luci-i18n-/.test(row.name))),
  search.value, page.value))
const tabs = [
  { value: 'available', label: '可用' },
  { value: 'installed', label: '已安装' },
  { value: 'upgradable', label: '更新' }
]
const busyAction = computed(() => busy.value || loading.value)
const packageAction = computed(() => activeTab.value === 'installed' ? 'remove' :
  activeTab.value === 'upgradable' ? 'upgrade' : 'install')
function notify(message, type = 'info') {
  feedback.value = message
  feedbackType.value = type
  toast.value = true
}
async function load(kind = activeTab.value, force = false) {
  if (busy.value || loading.value) return
  if (loaded.value[kind] && !force) return
  loading.value = true
  try {
    const [packages, space] = await Promise.all([
      readPackageList(props.client, kind),
      readDiskSpace(props.client).catch(() => null)
    ])
    rows.value[kind] = packages
    loaded.value[kind] = true
    if (space) disk.value = space
  } catch (e) {
    notify('软件包列表读取失败：' + shortError(e), 'error')
  } finally { loading.value = false }
}
function refreshAction() { return load(activeTab.value, true) }
function invalidate() {
  loaded.value = { available: false, installed: false, upgradable: false }
}
function requestAction(action, name = '') {
  if (busyAction.value) return
  confirmation.value = { action, name }
}
async function performAction() {
  const item = confirmation.value
  if (!item || busy.value) return
  confirmation.value = null
  busy.value = true
  output.value = ''
  try {
    if (item.action === 'url') output.value = await installPackageUrl(props.client, item.name)
    else if (item.action === 'upload') output.value = await uploadPackageFile(props.client, uploadFile.value)
    else output.value = await runPackageAction(props.client, item.action, item.name)
    notify('软件包操作完成' + (item.name ? '：' + item.name : ''), 'success')
    invalidate()
  } catch (e) {
    notify('操作失败或结果不确定：' + shortError(e) + '。若连接超时，请刷新已安装列表核对后再重试。', 'error')
  } finally {
    busy.value = false
    await load(activeTab.value, true)
  }
}
function submitInstall() {
  const value = installInput.value.trim()
  if (!value) { notify('请输入软件包名称或 HTTPS .ipk URL', 'warning'); return }
  try {
    if (/^https?:\/\//i.test(value)) requestAction('url', value)
    else requestAction('install', validatePackageName(value))
  } catch (e) { notify(shortError(e), 'warning') }
}
function chooseFile(event) {
  uploadFile.value = event.target.files?.[0] || null
}
async function openConfig() {
  configOpen.value = true
  await loadConfig()
}
async function loadConfig() {
  configLoading.value = true
  try { configText.value = await readOpkgConfig(props.client, configPath.value) }
  catch (e) { configText.value = ''; notify('读取配置失败：' + shortError(e), 'error') }
  finally { configLoading.value = false }
}
async function saveConfig() {
  if (busy.value) return
  busy.value = true
  try {
    const changed = await saveOpkgConfig(props.client, configPath.value, configText.value)
    notify(changed ? 'opkg 配置已保存，原文件备份为 .bak' : '配置未变化', 'success')
    configOpen.value = false
    invalidate()
  } catch (e) { notify('保存失败：' + shortError(e), 'error') }
  finally { busy.value = false }
}
watch(activeTab, async () => { search.value = ''; page.value = 1; await load() })
watch([search, showTranslations], () => { page.value = 1 })
watch(() => props.client, () => { invalidate(); void load() })
onMounted(() => { void load() })
defineExpose({ refreshAction })
</script>

<template>
  <section class="opkg-panel">
    <v-snackbar v-model="toast" :color="feedbackType" location="bottom" :timeout="6500"
      :style="{ bottom: '77px' }" role="status">{{ feedback }}
      <template #actions><v-btn variant="text" @click="toast = false">关闭</v-btn></template>
    </v-snackbar>
    <div class="d-flex align-center justify-space-between mb-3 ga-2">
      <div><h3>软件包</h3><p class="text-caption text-medium-emphasis">管理 OpenWrt / QWRT 的 opkg 软件包（.ipk）</p></div>
      <v-btn icon="mdi-refresh" variant="tonal" color="primary" :loading="loading"
        :disabled="busy" aria-label="刷新软件包列表" @click="refreshAction"/>
    </div>
    <v-alert type="warning" variant="tonal" density="compact" class="mb-3">
      直接安装、删除或升级软件包可能损坏系统。请确认软件包来源、架构及依赖关系。
      不支持将整个系统通过“全部升级”操作升级。
    </v-alert>
    <v-progress-linear v-if="busyAction" indeterminate color="primary" class="mb-3"/>
    <div v-if="disk" class="mb-4">
      <div class="d-flex justify-space-between text-body-2">
        <span>磁盘空间（/overlay）</span>
        <span>{{ Math.round(disk.usedKiB / Math.max(1, disk.totalKiB) * 100) }}% 已使用 · 剩余 {{ (disk.freeKiB / 1024).toFixed(1) }} MiB</span>
      </div>
      <v-progress-linear :model-value="disk.usedKiB / Math.max(1, disk.totalKiB) * 100"
        height="7" rounded color="primary" class="mt-2"/>
    </div>
    <v-text-field v-model="search" label="过滤器" placeholder="输入以筛选软件包…"
      prepend-inner-icon="mdi-magnify" clearable density="comfortable" variant="outlined" class="mb-2"/>
    <div class="mb-3">
      <p class="text-body-2 mb-2">下载并安装软件包</p>
      <div class="d-flex ga-2">
        <v-text-field v-model="installInput" label="软件包名称或 HTTPS .ipk URL"
          hide-details density="comfortable" variant="outlined" :disabled="busyAction"
          @keydown.enter="submitInstall"/>
        <v-btn color="primary" :disabled="busyAction" @click="submitInstall">确认</v-btn>
      </div>
    </div>
    <div class="d-flex flex-wrap ga-2 mb-3">
      <v-btn color="success" variant="tonal" :disabled="busyAction" @click="requestAction('update')">更新列表…</v-btn>
      <v-btn color="primary" variant="tonal" :disabled="busyAction" @click="$refs.packageUpload.click()">上传软件包…</v-btn>
      <v-btn variant="tonal" :disabled="busyAction" @click="openConfig">配置 opkg</v-btn>
      <input ref="packageUpload" type="file" accept=".ipk" style="display:none" @change="chooseFile"/>
    </div>
    <div v-if="uploadFile" class="d-flex align-center ga-2 mb-3">
      <span class="text-caption">{{ uploadFile.name }} · {{ (uploadFile.size / 1024 / 1024).toFixed(2) }} MiB</span>
      <v-btn color="primary" size="small" :disabled="busyAction" @click="requestAction('upload', uploadFile.name)">安装上传文件</v-btn>
      <v-btn size="small" variant="text" @click="uploadFile = null">取消</v-btn>
    </div>
    <div class="d-flex align-center ga-2 flex-wrap mb-2">
      <span class="text-body-2">显示 LuCI 翻译包</span>
      <v-btn-toggle v-model="showTranslations" mandatory density="compact" color="primary">
        <v-btn value="filtered" size="small">已过滤</v-btn>
        <v-btn value="all" size="small">全部</v-btn>
        <v-btn value="only" size="small">仅翻译包</v-btn>
      </v-btn-toggle>
    </div>
    <v-tabs v-model="activeTab" color="primary" class="mb-3" density="comfortable">
      <v-tab v-for="tab in tabs" :key="tab.value" :value="tab.value">{{ tab.label }}</v-tab>
    </v-tabs>
    <div v-if="loaded[activeTab]" class="d-flex align-center justify-space-between mb-3">
      <v-btn size="small" variant="tonal" :disabled="pageData.page <= 1" @click="page = pageData.page - 1">«</v-btn>
      <span class="text-body-2">正在显示 {{ pageData.total ? (pageData.page - 1) * 100 + 1 : 0 }}–{{ Math.min(pageData.total, pageData.page * 100) }}，共 {{ pageData.total }}</span>
      <v-btn size="small" variant="tonal" :disabled="pageData.page >= pageData.pages" @click="page = pageData.page + 1">»</v-btn>
    </div>
    <v-alert v-if="!loading && loaded[activeTab] && !pageData.total" type="info" variant="tonal" density="compact">没有匹配的软件包</v-alert>
    <v-card v-for="item in pageData.items" :key="item.name" rounded="xl" elevation="1" class="mb-3">
      <v-card-text>
        <div class="d-flex align-start justify-space-between ga-2">
          <div style="min-width:0;overflow-wrap:anywhere">
            <strong>{{ item.name }}</strong>
            <div class="text-caption text-medium-emphasis">{{ item.version }}</div>
          </div>
          <v-btn size="small" variant="tonal"
            :color="packageAction === 'remove' ? 'error' : 'primary'"
            :disabled="busyAction" @click="requestAction(packageAction, item.name)">
            {{ packageAction === 'remove' ? '卸载…' : packageAction === 'upgrade' ? '更新…' : '安装…' }}
          </v-btn>
        </div>
        <div v-if="item.description" class="text-body-2 mt-2" style="white-space:pre-wrap;overflow-wrap:anywhere">{{ item.description }}</div>
      </v-card-text>
    </v-card>
    <v-expansion-panels v-if="output" class="mt-3">
      <v-expansion-panel title="查看 opkg 执行输出">
        <v-expansion-panel-text><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px">{{ output }}</pre></v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <v-dialog v-model="configOpen" max-width="620">
      <v-card rounded="xl">
        <v-card-title>配置 opkg</v-card-title>
        <v-card-text>
          <v-select v-model="configPath" label="配置文件"
            :items="['/etc/opkg.conf','/etc/opkg/distfeeds.conf','/etc/opkg/customfeeds.conf']"
            density="comfortable" variant="outlined" @update:model-value="loadConfig"/>
          <v-textarea v-model="configText" label="配置内容" rows="12" auto-grow
            variant="outlined" :loading="configLoading" :disabled="configLoading || busy"
            style="font-family:monospace"/>
          <p class="text-caption text-medium-emphasis">保存前自动备份为 .bak。更改软件源后请执行“更新列表”。</p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="configOpen = false">取消</v-btn>
          <v-spacer/>
          <v-btn color="primary" :loading="busy" :disabled="configLoading" @click="saveConfig">保存配置</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog :model-value="Boolean(confirmation)" max-width="430" persistent>
      <v-card rounded="xl">
        <v-card-title>确认软件包操作</v-card-title>
        <v-card-text>
          <p>操作：{{ confirmation?.action }}</p>
          <p v-if="confirmation?.name" style="overflow-wrap:anywhere">{{ confirmation.name }}</p>
          <v-alert type="warning" variant="tonal" density="compact" class="mt-3">
            可能修改依赖包、服务或网络功能；执行期间请勿断电。
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="confirmation = null">取消</v-btn>
          <v-spacer/>
          <v-btn color="primary" @click="performAction">确认执行</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>
