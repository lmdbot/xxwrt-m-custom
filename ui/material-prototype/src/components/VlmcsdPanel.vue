<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { shortError } from '../services/router.js'

const props = defineProps({ client: { type: Object, required: true } })
const tab = ref('general')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const warning = ref('')
const floatingNoticeOpen = ref(false)
const floatingNoticeText = computed(() => error.value || warning.value || notice.value)
const floatingNoticeColor = computed(() => error.value ? 'error' : warning.value ? 'warning' : 'success')
watch(floatingNoticeText, text => { floatingNoticeOpen.value = Boolean(text) })
function dismissFloatingNotice() {
  floatingNoticeOpen.value = false
  error.value = ''
  warning.value = ''
  notice.value = ''
}
const available = ref(false)
const section = ref('')
const serviceRunning = ref(null)
const configLoaded = ref(false)
const fileAvailable = ref(false)
const fileOriginal = ref('')
const fileText = ref('')
const configOriginal = ref(null)
const flags = reactive({ enabled: false, auto_activate: false, internet_access: false })
const dirtyConfig = computed(() => configOriginal.value && Object.keys(flags)
  .some(key => flags[key] !== configOriginal.value[key]))
const dirtyFile = computed(() => fileAvailable.value && fileText.value !== fileOriginal.value)
const canSave = computed(() => !busy.value && (dirtyConfig.value || dirtyFile.value))
const FILE = '/etc/vlmcsd.ini'
const MAX_FILE_BYTES = 256 * 1024
function valueIsTrue(value) { return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase()) }
function bytes(s) { return new TextEncoder().encode(String(s || '')).length }
function sectionFrom(data) {
  const entries = Object.entries(data?.values || {})
  const match = entries.find(([id, item]) => id === 'config' || item?.['.name'] === 'config')
    || entries.find(([, item]) => item?.['.type'] === 'vlmcsd')
  return match ? { id: String(match[1]['.name'] || match[0]), data: match[1] } : null
}
async function readConfig() {
  const [config, service] = await Promise.all([
    props.client.call('uci', 'get', { config: 'vlmcsd' }, true),
    props.client.call('service', 'list', { name: 'vlmcsd' }, true)
  ])
  const found = sectionFrom(config)
  section.value = found?.id || ''
  available.value = Boolean(found)
  if (found) {
    for (const key of Object.keys(flags)) flags[key] = valueIsTrue(found.data[key])
    configOriginal.value = { ...flags }
    configLoaded.value = true
  } else {
    configLoaded.value = false
    configOriginal.value = null
  }
  const instances = service?.vlmcsd?.instances || {}
  serviceRunning.value = service == null ? null
    : Object.values(instances).some(instance => instance?.running === true)
}
async function readFile() {
  fileAvailable.value = false
  const file = await props.client.call('file', 'read', { path: FILE }, true)
  if (typeof file?.data === 'string' && !file.truncated) {
    fileText.value = file.data
    fileOriginal.value = file.data
    fileAvailable.value = true
  }
}
async function refresh() {
  if (busy.value || loading.value && configLoaded.value) return
  loading.value = true
  error.value = ''; notice.value = ''; warning.value = ''
  try {
    const results = await Promise.allSettled([readConfig(), readFile()])
    if (results[0].status === 'rejected') error.value = '读取服务配置失败：' + shortError(results[0].reason)
    if (results[1].status === 'rejected') warning.value = '配置文件读取失败：' + shortError(results[1].reason)
  } finally { loading.value = false }
}
async function save(apply) {
  if (!canSave.value || !available.value) return
  busy.value = true
  error.value = ''; notice.value = ''; warning.value = ''
  let configSaved = false, fileSaved = false
  try {
    if (dirtyConfig.value) {
      const values = Object.fromEntries(Object.entries(flags).map(([key, value]) => [key, value ? '1' : '0']))
      await props.client.call('uci', 'set', { config: 'vlmcsd', section: section.value, values })
      await props.client.call('uci', 'commit', { config: 'vlmcsd' })
      configSaved = true
      configOriginal.value = { ...flags }
    }
    if (dirtyFile.value) {
      const normalized = fileText.value.replace(/\r\n/g, '\n').trimEnd() + '\n'
      if (bytes(normalized) > MAX_FILE_BYTES) throw new Error('配置文件超过 256 KiB 的限制')
      const result = await props.client.call('file', 'write', { path: FILE, data: normalized })
      if (result?.error) throw new Error(String(result.error))
      fileSaved = true
      fileText.value = normalized
      fileOriginal.value = normalized
    }
    if (apply) {
      const action = flags.enabled ? 'restart' : 'stop'
      const restarted = await props.client.call('rc', 'init', { name: 'vlmcsd', action }, true)
      if (restarted == null) {
        warning.value = '配置已保存，但当前 RPC 没有 vlmcsd 服务控制权限。请通过 LuCI 点击“保存并应用”，或者核对服务状态。'
      } else {
        notice.value = '配置已保存，已提交服务' + (flags.enabled ? '重启' : '停止') + '操作'
      }
      await readConfig().catch(() => { warning.value += ' 服务状态刷新未完成。' })
    } else {
      notice.value = '配置已保存，尚未应用到正在运行的服务'
    }
  } catch (e) {
    error.value = (configSaved || fileSaved ? '部分更改已经保存；' : '') + shortError(e)
    if (configSaved || fileSaved) warning.value = '请先重新读取并检查实际配置，避免重复覆盖。'
  } finally { busy.value = false }
}
function reset() {
  if (configOriginal.value) Object.assign(flags, configOriginal.value)
  fileText.value = fileOriginal.value
  notice.value = '已恢复到上次读取或保存的内容（未修改路由器）'
  error.value = ''; warning.value = ''
}
onMounted(() => { void refresh() })
async function refreshAction() {
  if (busy.value || loading.value) return
  if (dirtyConfig.value || dirtyFile.value) {
    warning.value = '存在未保存的修改，请先保存或复位后再刷新，避免覆盖编辑内容。'
    return
  }
  await refresh()
  if (!error.value && !warning.value) notice.value = 'Vlmcsd 状态已刷新'
}
defineExpose({ refresh, refreshAction })
</script>

<template>
  <section class="vlmcsd-panel">
    <v-snackbar v-model="floatingNoticeOpen" :timeout="5200" :color="floatingNoticeColor"
      location="bottom" :style="{ bottom: '77px' }" role="status" aria-live="polite"
      class="router-app-floating-feedback">
      {{ floatingNoticeText }}
      <template #actions>
        <v-btn variant="text" size="small" @click="dismissFloatingNotice">关闭</v-btn>
      </template>
    </v-snackbar>
    <div class="d-flex align-center justify-space-between ga-2 mb-3">
      <div><h2 class="text-h6 font-weight-bold">Vlmcsd KMS 服务器</h2><p class="text-body-2 text-medium-emphasis">服务状态、常规设置与配置文件</p></div>
    </div>
    <div class="router-app-summary mb-3">
      <div><span>服务状态</span><strong>{{ serviceRunning === true ? '运行中' : serviceRunning === false ? '未运行' : '待确认' }}</strong></div>
    </div>
    <v-progress-linear v-if="loading" indeterminate class="mb-3"/>
    <v-alert v-if="!available && !loading" type="info" variant="tonal" density="compact" class="mb-3">
      未检测到 vlmcsd UCI 配置；请确认路由器已安装 luci-app-vlmcsd 且账号有读取权限。
    </v-alert>
    <v-tabs v-model="tab" color="primary" class="mb-3">
      <v-tab value="general">常规设置</v-tab>
      <v-tab value="file">配置文件</v-tab>
    </v-tabs>
    <v-card v-if="tab === 'general'" variant="outlined" rounded="xl" class="pa-3 mb-3">
      <v-switch v-model="flags.enabled" :disabled="busy || !configLoaded" label="启用 Vlmcsd KMS 服务器" color="primary" hide-details inset/>
      <v-divider class="my-3"/>
      <v-switch v-model="flags.auto_activate" :disabled="busy || !configLoaded" label="允许自动激活客户端" color="primary" hide-details inset/>
      <v-divider class="my-3"/>
      <v-switch v-model="flags.internet_access" :disabled="busy || !configLoaded" label="允许来自互联网的连接" color="primary" hide-details inset/>
      <v-alert v-if="flags.internet_access" type="warning" variant="tonal" density="compact" class="mt-3">
        开放公网 KMS 服务可能带来额外风险，请确认防火墙与访问控制策略。
      </v-alert>
    </v-card>
    <v-card v-else rounded="xl" variant="outlined" class="pa-3 mb-3">
      <p class="text-body-2 text-medium-emphasis mb-3">编辑 /etc/vlmcsd.ini 文件的内容。</p>
      <v-textarea v-model="fileText" label="配置文件内容" :disabled="busy || !fileAvailable" rows="6"
        no-resize variant="outlined" spellcheck="false" class="vlmcsd-config-editor"/>
      <p class="text-caption text-medium-emphasis">文件大小：{{ bytes(fileText) }} / {{ MAX_FILE_BYTES }} 字节</p>
      <v-alert v-if="!fileAvailable" type="info" variant="tonal" density="compact">
        无法读取配置文件。请检查 ubus file.read 的 RPC 权限；禁用编辑以避免覆盖未知文件。
      </v-alert>
    </v-card>
    <div class="d-flex flex-wrap ga-2 align-center">
      <v-btn color="primary" :disabled="!canSave || bytes(fileText) > MAX_FILE_BYTES" :loading="busy" @click="save(true)">保存并应用</v-btn>
      <v-btn variant="outlined" :disabled="!canSave" @click="save(false)">保存</v-btn>
      <v-btn variant="tonal" :disabled="busy || (!dirtyConfig && !dirtyFile)" @click="reset">复位</v-btn>
    </div>
    <p class="text-caption text-medium-emphasis mt-3">保存与应用分别执行；若路由器拒绝服务控制 RPC，将保留已保存的配置并提示手动应用。</p>
  </section>
</template>

<style scoped>
.vlmcsd-config-editor :deep(textarea) { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre; overflow-wrap: normal; font-size: 13px; }
</style>
