<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { shortError } from '../services/router.js'
import {
  luckyArch, luckyCore, luckyStatus, luckyService, luckyWatchdog,
  luckyRulesOpen, luckyRulesSave, luckyArchive, luckyDiagnostics,
  luckyVersionAtLeast, luckyRuleBytes, LUCKY_RULE_LIMIT, LUCKY_DEFAULT_LOCALIPS
} from '../services/luckyRpc.js'

const props = defineProps({ client: { type: Object, required: true } })
const tab = ref('overview')
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref('')
const core = ref(null), running = ref(null), arch = ref(''), watchdog = ref(null)
const diagnostics = ref(null), diagnosticsLoading = ref(false), diagnosticsError = ref('')
const ruleEditors = reactive({
  allowlist: { loaded: false, loading: false, token: '', name: 'ip-allowlist.txt', directory: '', text: '', original: '', error: '' },
  localips: { loaded: false, loading: false, token: '', name: 'localips', directory: '', text: '', original: '', error: '' }
})
const version = computed(() => String(core.value?.info?.Version || core.value?.version || '-'))
const supportsAllowlist = computed(() => luckyVersionAtLeast(version.value, 3, 1, 0))
const base = computed(() => core.value?.base?.BaseConfigure || {})
const installed = computed(() => core.value?.status === 'ready')
const working = computed(() => loading.value || busy.value ||
  Object.values(ruleEditors).some(x => x.loading))
const coreHealth = computed(() => ({
  ready: '执行权限正常', missing: '未安装 Lucky 核心',
  permissions: '核心执行权限异常', unsafe: '核心文件路径不安全',
  unknown: '无法确认内核状态'
})[core.value?.status || 'unknown'])

async function refresh() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  const requests = await Promise.allSettled([
    luckyCore(props.client, 'core-status'), luckyStatus(props.client),
    luckyArch(props.client), luckyWatchdog(props.client)
  ])
  const [c, s, a, w] = requests
  if (c.status === 'fulfilled') core.value = c.value
  if (s.status === 'fulfilled') running.value = s.value
  if (a.status === 'fulfilled') arch.value = a.value
  if (w.status === 'fulfilled') watchdog.value = w.value
  const errors = requests.map((r, i) => r.status === 'rejected'
    ? ['内核状态', '运行状态', 'CPU 架构', '恢复设置'][i] + '：' + shortError(r.reason) : '').filter(Boolean)
  if (errors.length) error.value = errors.join('；')
  loading.value = false
}

async function runAction(action, success) {
  if (working.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await action()
    notice.value = success
  } catch (e) { error.value = shortError(e) }
  finally { busy.value = false }
}

async function operateService(action) {
  await runAction(async () => {
    await luckyService(props.client, action)
    running.value = await luckyStatus(props.client).catch(() => null)
  }, { start: '已提交 Lucky 启动操作', stop: '已提交 Lucky 停止操作', restart: 'Lucky 重启命令已执行' }[action])
}

async function toggleWatchdog(enabled) {
  await runAction(async () => {
    watchdog.value = await luckyWatchdog(props.client, enabled ? 'enable' : 'disable')
  }, enabled ? '意外退出自动恢复已开启' : '意外退出自动恢复已关闭')
}

async function repairCore() {
  await runAction(async () => {
    await luckyCore(props.client, 'core-fix')
    core.value = await luckyCore(props.client)
  }, '已修复 Lucky 核心执行权限')
}

async function requestCoreDetail() {
  await runAction(async () => {
    const status = core.value
    if (!status || status.status !== 'ready') throw new Error('Lucky 核心尚未就绪')
    // The packed binary requires at least 128 MiB free memory, just like LuCI.
    if (Number(status.available_memory_kib || 0) < 128 * 1024) {
      throw new Error('空闲内存不足 128 MiB，不运行高内存占用的核心查询')
    }
    const b = status.base?.BaseConfigure ? status.base : await luckyCore(props.client, 'core-base')
    const i = status.info?.Version ? status.info : await luckyCore(props.client, 'core-info')
    core.value = { ...status, info: i.info || i, base: b.base || b }
  }, 'Lucky 内核信息已更新')
}

async function loadRule(type, discard = false) {
  const editor = ruleEditors[type]
  if (!editor || working.value || editor.loading) return
  if (editor.loaded && editor.text !== editor.original && !discard &&
      !window.confirm('重新读取会丢弃此文件的未保存修改，是否继续？')) return
  editor.loading = true; editor.error = ''; error.value = ''; notice.value = ''
  let previousToken = editor.token
  try {
    if (previousToken) await luckyArchive(props.client, 'cleanup', previousToken).catch(() => {})
    editor.token = ''; editor.loaded = false
    const data = await luckyRulesOpen(props.client, type)
    editor.token = data.token
    editor.name = data.name
    editor.directory = data.directory
    editor.original = data.content
    editor.text = data.content
    editor.loaded = true
    notice.value = editor.name + ' 已从路由器读取'
  } catch (e) { editor.error = shortError(e) }
  finally { editor.loading = false }
}

async function saveRule(type) {
  const editor = ruleEditors[type]
  if (!editor?.loaded || !editor.token || working.value) return
  if (editor.text === editor.original) return
  editor.loading = true; editor.error = ''; error.value = ''; notice.value = ''
  let saved = false
  try {
    await luckyRulesSave(props.client, editor.token, editor.text)
    saved = true
    editor.original = editor.text
    notice.value = editor.name + ' 已保存，Lucky 将自动加载规则'
    await luckyArchive(props.client, 'cleanup', editor.token).catch(() => {})
    editor.token = ''; editor.loaded = false
    // Explicitly reload a fresh server snapshot after the one-time token is spent.
    const data = await luckyRulesOpen(props.client, type)
    editor.token = data.token; editor.text = data.content
    editor.original = data.content; editor.directory = data.directory
    editor.loaded = true
  } catch (e) {
    editor.error = saved
      ? '规则已保存，但重新读取失败：' + shortError(e) + '。请点击重新读取。'
      : shortError(e) + '。请检查路由器的 Lucky 页面后再决定是否重试，避免覆盖其他修改。'
  } finally { editor.loading = false }
}

async function readDiagnostics() {
  if (diagnosticsLoading.value || working.value) return
  diagnosticsLoading.value = true; diagnosticsError.value = ''
  try { diagnostics.value = await luckyDiagnostics(props.client) }
  catch (e) { diagnostics.value = null; diagnosticsError.value = shortError(e) }
  finally { diagnosticsLoading.value = false }
}
const diagnosticText = computed(() => {
  const data = diagnostics.value
  if (!data) return ''
  const kinds = { oom: '内存不足终止', crash: '崩溃证据', restart_loop: '反复退出 / 重启限制', exit: '退出记录（原因待确认）' }
  const text = data.sources.map(item => item.name + ': ' + item.status + (item.truncated ? '（日志已截断）' : ''))
  text.push('', data.events?.length ? '相关异常记录：' + data.events.length : '未发现匹配记录（不代表一定没有异常退出）')
  for (const event of data.events || []) {
    text.push('', '[' + String(event.source || '') + ' · ' + (kinds[event.kind] || '退出记录') + ']',
      String(event.text || ''))
  }
  return text.join('\\n')
})

async function openLuci() {
  const address = props.client?.baseUrl
  if (!address) return
  const url = address + '/cgi-bin/luci/admin/services/lucky'
  try {
    if (Capacitor.isNativePlatform()) await Browser.open({ url })
    else window.open(url, '_blank', 'noopener,noreferrer')
  } catch (e) { error.value = '无法打开 LuCI Lucky：' + shortError(e) }
}

async function loadRulesOnDemand() {
  if (tab.value !== 'rules' || working.value) return
  // Read in order: the Lucky archive helper serializes access to its
  // temporary work directory. Do not run both editors concurrently.
  if (!ruleEditors.localips.loaded) await loadRule('localips')
  if (supportsAllowlist.value && !ruleEditors.allowlist.loaded) await loadRule('allowlist')
}
watch([tab, loading], () => { void loadRulesOnDemand() })
onMounted(() => { void refresh() })
defineExpose({ refresh, refreshAction: refresh })
</script>

<template>
  <section class="lucky-app-panel">
    <div class="d-flex align-center justify-space-between ga-2 mb-3">
      <div><h2 class="text-h6 font-weight-bold">Lucky</h2><p class="text-body-2 text-medium-emphasis">服务状态与后台管理</p></div>
      <v-btn prepend-icon="mdi-refresh" variant="tonal" :loading="loading" :disabled="busy" @click="refresh">刷新</v-btn>
    </div>
    <v-tabs v-model="tab" color="primary" grow density="comfortable" class="mb-4">
      <v-tab value="overview">概览</v-tab><v-tab value="rules">访问规则</v-tab><v-tab value="maintenance">维护</v-tab>
    </v-tabs>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3"/>
    <v-alert v-if="error" type="warning" variant="tonal" density="compact" class="mb-3" closable @click:close="error = ''">{{ error }}</v-alert>
    <v-alert v-if="notice" type="success" variant="tonal" density="compact" class="mb-3" closable @click:close="notice = ''">{{ notice }}</v-alert>

    <template v-if="tab === 'overview'">
      <div class="router-app-summary mb-4">
        <div><span>内核状态</span><strong>{{ coreHealth }}</strong></div>
        <div><span>运行状态</span><strong>{{ running === null ? '待确认' : running ? '运行中' : '未运行' }}</strong></div>
        <div><span>版本</span><strong>{{ version }}</strong></div>
      </div>
      <v-card rounded="xl" variant="outlined" class="pa-4 mb-3">
        <h3 class="text-subtitle-1 font-weight-bold mb-3">Lucky 服务</h3>
        <p class="text-body-2 text-medium-emphasis mb-3">CPU 架构：{{ arch || '--' }}　·　构建日期：{{ core?.info?.Date || '--' }}</p>
        <div class="d-flex flex-wrap ga-2">
          <v-btn color="primary" variant="tonal" :disabled="working || !installed" @click="operateService('start')">启动</v-btn>
          <v-btn variant="outlined" :disabled="working || !installed" @click="operateService('stop')">停止</v-btn>
          <v-btn variant="outlined" :disabled="working || !installed" @click="operateService('restart')">重启</v-btn>
        </div>
        <v-divider class="my-4"/>
        <h3 class="text-subtitle-1 font-weight-bold mb-2">后台配置</h3>
        <p class="text-body-2">管理端口：{{ base.AdminWebListenPort || '尚未读取' }}</p>
        <p class="text-body-2">后台外网访问：{{ base.AllowInternetaccess == null ? '尚未读取' : base.AllowInternetaccess ? '允许' : '仅本地' }}</p>
        <p class="text-body-2">安全入口：{{ base.SafeURL == null ? '尚未读取' : base.SafeURL ? '已设置' : '未设置' }}</p>
        <div class="d-flex flex-wrap ga-2 mt-3">
          <v-btn variant="tonal" :disabled="working || !installed" @click="requestCoreDetail">读取详细配置</v-btn>
          <v-btn variant="outlined" prepend-icon="mdi-open-in-new" @click="openLuci">打开 LuCI Lucky</v-btn>
        </div>
      </v-card>
      <v-card rounded="xl" variant="outlined" class="pa-4">
        <h3 class="text-subtitle-1 font-weight-bold mb-2">意外退出自动恢复</h3>
        <v-switch :model-value="Boolean(watchdog?.enabled)" :disabled="working || !watchdog"
          color="primary" hide-details inset label="开启异常退出守护" @update:model-value="toggleWatchdog($event)"/>
        <p class="text-body-2 text-medium-emphasis mt-2">系统每分钟检查一次。主动停止 Lucky 或进行维护时暂停自动恢复；需要新版 Lucky 服务脚本支持。</p>
        <p v-if="watchdog" class="text-caption text-medium-emphasis mt-2">任务：{{ watchdog.scheduled ? '已安装' : '未安装' }} · {{ watchdog.paused ? '当前暂停' : '当前未暂停' }}</p>
      </v-card>
    </template>

    <template v-else-if="tab === 'rules'">
      <p class="text-body-2 text-medium-emphasis mb-3">每行一条，文件保存在 Lucky 当前配置目录中，最大 64 KiB。先从路由器读取再编辑，保存时由 Lucky 插件验证规则格式。</p>
      <v-card v-for="type in ['allowlist','localips']" :key="type" rounded="xl" variant="outlined" class="pa-4 mb-3">
        <div class="d-flex justify-space-between align-center ga-2 mb-2">
          <strong>{{ type === 'allowlist' ? '绝对 IP 白名单' : '局域网网段' }}</strong>
          <v-chip size="x-small" variant="outlined">{{ ruleEditors[type].name }}</v-chip>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-3">{{ type === 'allowlist'
          ? '优先于全局黑名单的独立 IP 白名单，需要 Lucky 3.1.0 及以上版本。仅允许单个 IPv4 / IPv6 地址与注释。'
          : '自定义局域网 IP 和网段；文件非空时，Lucky 默认内网网段会失效。支持 IPv4 / IPv6 CIDR。' }}</p>
        <v-alert v-if="type === 'allowlist' && !supportsAllowlist" type="info" variant="tonal" density="compact" class="mb-3">需要 Lucky 3.1.0 或更高正式版；当前版本为 {{ version }}。</v-alert>
        <template v-else>
          <p v-if="ruleEditors[type].loaded" class="text-caption text-medium-emphasis mb-2">{{ ruleEditors[type].directory }}/{{ ruleEditors[type].name }}</p>
          <v-textarea v-model="ruleEditors[type].text" :label="type === 'allowlist' ? 'IP 白名单文件内容' : '局域网网段文件内容'"
            :disabled="!ruleEditors[type].loaded || working" variant="outlined" rows="8" auto-grow spellcheck="false" class="mb-1"/>
          <p v-if="ruleEditors[type].loaded" class="text-caption text-medium-emphasis text-right mb-2">{{ luckyRuleBytes(ruleEditors[type].text) }} / {{ LUCKY_RULE_LIMIT }} 字节</p>
          <v-alert v-if="ruleEditors[type].error" type="warning" variant="tonal" density="compact" class="mb-3">{{ ruleEditors[type].error }}</v-alert>
          <div class="d-flex flex-wrap ga-2">
            <v-btn color="primary" variant="tonal" :disabled="working || !ruleEditors[type].loaded ||
              ruleEditors[type].text === ruleEditors[type].original ||
              luckyRuleBytes(ruleEditors[type].text) > LUCKY_RULE_LIMIT" @click="saveRule(type)">保存文件</v-btn>
            <v-btn variant="outlined" :disabled="working" :loading="ruleEditors[type].loading" @click="loadRule(type)">读取 / 重新读取</v-btn>
            <v-btn v-if="type === 'localips'" variant="text" :disabled="working || !ruleEditors[type].loaded"
              @click="ruleEditors.localips.text = LUCKY_DEFAULT_LOCALIPS">填入默认内网段</v-btn>
          </div>
        </template>
      </v-card>
    </template>

    <template v-else-if="tab === 'maintenance'">
      <v-card rounded="xl" variant="outlined" class="pa-4 mb-3">
        <h3 class="text-subtitle-1 font-weight-bold mb-3">核心维护</h3>
        <p class="text-body-2 text-medium-emphasis mb-1">核心文件状态</p>
        <p class="font-weight-bold mb-2">{{ coreHealth }}</p>
        <p class="text-body-2 text-medium-emphasis mb-3">可修复执行权限，或通过官方 LuCI 页面上传可信的 Lucky Linux tar.gz 内核升级包。上传内核前应先备份配置。</p>
        <div class="d-flex flex-wrap ga-2">
          <v-btn variant="outlined" :disabled="working || core?.status !== 'permissions'" @click="repairCore">修复执行权限</v-btn>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-open-in-new" @click="openLuci">上传内核（LuCI）</v-btn>
        </div>
      </v-card>
      <v-card rounded="xl" variant="outlined" class="pa-4 mb-3">
        <h3 class="text-subtitle-1 font-weight-bold mb-3">配置与备份</h3>
        <p class="text-body-2 text-medium-emphasis mb-3">备份会保存 Lucky 配置目录中的所有文件。恢复将完整替换配置目录，并可能中断当前服务。备份文件可能包含密码、证书和令牌，请妥善保管。</p>
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-open-in-new" @click="openLuci">下载备份 / 恢复配置（LuCI）</v-btn>
        <v-divider class="my-4"/>
        <v-btn variant="text" prepend-icon="mdi-open-in-new" @click="openLuci">在 LuCI 中查看配置目录与清空配置</v-btn>
      </v-card>
      <v-expansion-panels variant="accordion" class="mb-3">
        <v-expansion-panel title="最近异常退出日志" rounded="xl">
          <v-expansion-panel-text>
            <p class="text-body-2 text-medium-emphasis mb-3">仅从 QWRT 的 logread / dmesg 提取近期与 Lucky 异常退出有关的日志摘要，不读取完整系统日志。</p>
            <v-btn color="primary" variant="tonal" :loading="diagnosticsLoading" :disabled="working"
              prepend-icon="mdi-text-search" @click="readDiagnostics">读取异常日志</v-btn>
            <v-alert v-if="diagnosticsError" type="warning" variant="tonal" density="compact" class="mt-3">{{ diagnosticsError }}</v-alert>
            <v-textarea v-if="diagnostics" :model-value="diagnosticText" label="日志摘要" variant="outlined"
              readonly auto-grow rows="5" spellcheck="false" class="mt-3"/>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
      <v-alert type="info" variant="tonal" density="compact">大文件备份、整目录还原、内核上传及危险清空操作由官方 LuCI 完成，以复用其权限检查、文件校验和操作期间的服务恢复机制。</v-alert>
    </template>
  </section>
</template>
