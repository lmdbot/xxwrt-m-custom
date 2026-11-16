<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { shortError } from '../services/router.js'
import {
  APPLY_TIMEOUT, SNAPSHOT_CONFIGS, CRITICAL_SERVICES,
  runNetworkDiagnostic, readRouterLogs, filterLogLines,
  readBackupInventory, createConfigSnapshot, previewConfigRestore,
  stageConfigRestore, confirmConfigRestore, rollbackConfigRestore,
  readDhcpEntries, changeDhcpEntry, readRouterServices, changeRouterService
} from '../services/routerOperations.js'

const props = defineProps({
  client: { type: Object, required: true },
  kind: { type: String, required: true }
})
const busy = ref(false)
const message = ref('')
const warning = ref(false)
const toast = ref(false)
const diagType = ref('ping')
const diagTarget = ref('223.5.5.5')
const diagResolver = ref('')
const diagResult = ref(null)
const logKind = ref('system')
const logSearch = ref('')
const logOutput = ref('')
const logSource = ref('')
const backupFiles = ref([])
const backupError = ref('')
const backupConfigs = ref(['dhcp', 'firewall'])
const backupJson = ref('')
const backupFileName = ref('')
const preview = ref(null)
const restorePending = ref(false)
const restoreSecondsLeft = ref(0)
let restoreDeadline = 0
let restoreTimer = null
const restoreUnknown = ref(false)
const restorePhrase = ref('')
const dhcpEntries = ref({ dns: [], leases: [] })
const dhcpTab = ref('dns')
const recordName = ref('')
const recordIp = ref('')
const recordMac = ref('')
const recordDelete = ref(null)
const serviceList = ref([])
const serviceSearch = ref('')
const serviceConfirm = ref(null)
const selectedServices = computed(() => serviceList.value.filter(x =>
  x.name.toLowerCase().includes(String(serviceSearch.value || '').toLowerCase())))
const visibleLogs = computed(() => filterLogLines(logOutput.value, logSearch.value))
function notify(text, danger = false) {
  message.value = text
  warning.value = danger
  toast.value = true
}
function outputError(e) { notify(shortError(e), true) }
async function loadLogs() {
  busy.value = true
  logOutput.value = ''
  logSource.value = ''
  try {
    const result = await readRouterLogs(props.client, logKind.value)
    logOutput.value = result.output || ''
    logSource.value = result.source
    notify('已读取日志：' + (logOutput.value ? '成功' : '目前无日志'))
  } catch (e) { outputError(e) }
  finally { busy.value = false }
}
async function diagnose() {
  busy.value = true
  diagResult.value = null
  try {
    diagResult.value = await runNetworkDiagnostic(props.client,
      diagType.value, diagTarget.value, diagResolver.value)
    notify(diagResult.value.code === 0 ? '诊断已完成' :
      '诊断命令已执行，目标可能不可达（退出码 ' + diagResult.value.code + '）',
      diagResult.value.code !== 0)
  } catch (e) { outputError(e) }
  finally { busy.value = false }
}
async function loadBackup() {
  backupError.value = ''
  try {
    const result = await readBackupInventory(props.client)
    backupFiles.value = result.files
  } catch (e) { backupFiles.value = []; backupError.value = shortError(e) }
}
async function exportBackup() {
  busy.value = true
  backupJson.value = ''
  preview.value = null
  try {
    const snapshot = await createConfigSnapshot(props.client, backupConfigs.value)
    backupJson.value = JSON.stringify(snapshot, null, 2)
    const hostname = new URL(props.client.baseUrl).hostname.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 64)
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    backupFileName.value = 'xxwrt-' + hostname + '-' + now + '.json'
    const blob = new Blob([backupJson.value], { type: 'application/json' })
    const file = new File([blob], backupFileName.value, { type: blob.type })
    // Prefer Android's share sheet if supported. Keep the text visible as a
    // fallback because downloads of blob: URLs vary across Android WebViews.
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      try { await navigator.share({ title: 'XX-WRT 配置快照', files: [file] }) }
      catch (e) {
        if (e?.name !== 'AbortError') notify('分享未完成；下方仍可复制配置 JSON', true)
      }
    } else {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = backupFileName.value
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    }
    notify('配置快照已生成。请确认文件已保存到安全位置；内容可能包含宽带密码等凭据。')
  } catch (e) { outputError(e) }
  finally { busy.value = false }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); notify('内容已复制到剪贴板') }
  catch (e) { outputError(e) }
}
async function importBackup(e) {
  const file = e?.target?.files?.[0]
  if (!file) return
  preview.value = null
  backupJson.value = ''
  restoreUnknown.value = false
  if (file.size > 2 * 1024 * 1024) {
    notify('配置文件不可超过 2MB', true)
    e.target.value = ''
    return
  }
  busy.value = true
  try {
    const text = await file.text()
    preview.value = await previewConfigRestore(props.client, text)
    restorePhrase.value = ''
    notify('恢复预览已生成：' + preview.value.count + ' 个配置字段存在差异')
  } catch (error) { outputError(error) }
  finally { busy.value = false; e.target.value = '' }
}
async function applyRestore() {
  if (!preview.value?.changes.length || restorePhrase.value !== '恢复配置') return
  busy.value = true
  try {
    await stageConfigRestore(props.client, preview.value)
    restorePending.value = true
    restoreDeadline = Date.now() + APPLY_TIMEOUT * 1000
    restoreSecondsLeft.value = APPLY_TIMEOUT
    notify('配置已临时生效，必须在 ' + APPLY_TIMEOUT + ' 秒内确认保留，否则自动回滚', true)
  } catch (e) {
    // A dropped connection after UCI apply is an unknown outcome. Never
    // automatically retry, as it could apply the change twice.
    restoreUnknown.value = true
    outputError(e)
  } finally { busy.value = false }
}
async function finishRestore(confirm) {
  busy.value = true
  try {
    if (confirm) await confirmConfigRestore(props.client)
    else await rollbackConfigRestore(props.client)
    restorePending.value = false
    restoreDeadline = 0
    restoreSecondsLeft.value = 0
    restoreUnknown.value = false
    preview.value = null
    restorePhrase.value = ''
    notify(confirm ? '配置恢复已确认保存' : '已请求回滚配置')
  } catch (e) { outputError(e) }
  finally { busy.value = false }
}
async function loadDhcp() {
  busy.value = true
  try { dhcpEntries.value = await readDhcpEntries(props.client) }
  catch (e) { outputError(e) }
  finally { busy.value = false }
}
async function addRecord() {
  busy.value = true
  try {
    const result = await changeDhcpEntry(props.client, dhcpTab.value, 'add', {
      name: recordName.value, ip: recordIp.value, mac: recordMac.value
    }, dhcpEntries.value)
    recordName.value = ''; recordIp.value = ''; recordMac.value = ''
    await loadDhcp()
    notify(result.applied ? '记录已保存并申请重载 dnsmasq' :
      '记录已保存，但无法确认 dnsmasq 已重载，请到路由器检查', !result.applied)
  } catch (e) { outputError(e) }
  finally { busy.value = false }
}
async function deleteRecord() {
  const record = recordDelete.value
  recordDelete.value = null
  if (!record) return
  busy.value = true
  try {
    const result = await changeDhcpEntry(props.client, dhcpTab.value, 'delete', record)
    await loadDhcp()
    notify(result.applied ? '记录已删除并申请重载 dnsmasq' :
      '记录已删除，但无法确认 dnsmasq 已重载', !result.applied)
  } catch (e) { outputError(e) }
  finally { busy.value = false }
}
async function loadServices() {
  busy.value = true
  try { serviceList.value = await readRouterServices(props.client) }
  catch (e) { outputError(e) }
  finally { busy.value = false }
}
async function operateService() {
  const target = serviceConfirm.value
  serviceConfirm.value = null
  if (!target) return
  busy.value = true
  try {
    serviceList.value = await changeRouterService(props.client,
      target.name, target.action, serviceList.value)
    notify('已提交 ' + target.name + ' ' + target.action + '；列表已重新读取')
  } catch (e) { outputError(e) }
  finally { busy.value = false }
}
async function refreshAction() {
  if (busy.value || restorePending.value) return
  if (props.kind === 'logs') return loadLogs()
  if (props.kind === 'backup') return loadBackup()
  if (props.kind === 'dnsdhcp') return loadDhcp()
  if (props.kind === 'services') return loadServices()
}
function handleBack() {
  if (restorePending.value) {
    notify('恢复配置尚未确认，请选择保留或回滚', true)
    return 'busy'
  }
  if (busy.value) return 'busy'
  if (recordDelete.value) { recordDelete.value = null; return 'dialog' }
  if (serviceConfirm.value) { serviceConfirm.value = null; return 'dialog' }
  return null
}
defineExpose({ refreshAction, handleBack })
watch(() => props.kind, () => {
  toast.value = false
  backupJson.value = ''
  preview.value = null
  void refreshAction()
})
onMounted(() => {
  void refreshAction()
  restoreTimer = setInterval(() => {
    if (!restorePending.value || !restoreDeadline) return
    restoreSecondsLeft.value = Math.max(0, Math.ceil((restoreDeadline - Date.now()) / 1000))
    if (restoreSecondsLeft.value === 0 && !busy.value) {
      restorePending.value = false
      restoreUnknown.value = true
      notify('配置确认时限已过：路由器通常会自动回滚，请检查当前配置和连接', true)
    }
  }, 1000)
})
onUnmounted(() => { if (restoreTimer) clearInterval(restoreTimer) })
</script>

<template>
  <section class="router-operations pa-2">
    <v-snackbar v-model="toast" :color="warning ? 'warning' : 'success'"
      :timeout="restorePending ? -1 : 4800" location="top" variant="tonal">
      {{ message }}
      <template #actions><v-btn variant="text" @click="toast = false">关闭</v-btn></template>
    </v-snackbar>
    <v-progress-linear v-if="busy" indeterminate color="primary" class="mb-3"/>
    <template v-if="kind === 'diagnostics'">
      <h3 class="mb-1">网络诊断</h3>
      <p class="text-caption text-medium-emphasis mb-3">检测从路由器发起，而非从手机发起；使用固定命令和参数，不开放 Shell。</p>
      <v-select v-model="diagType" label="检测类型" density="compact" variant="outlined"
        :items="[{title:'Ping 丢包与延迟',value:'ping'},{title:'Traceroute 路径追踪',value:'trace'},{title:'DNS 解析',value:'dns'}]"/>
      <v-text-field v-model.trim="diagTarget" label="目标域名 / IPv4 / IPv6" density="compact" variant="outlined"/>
      <v-text-field v-if="diagType === 'dns'" v-model.trim="diagResolver"
        label="指定 DNS 服务器（留空使用系统 DNS）" density="compact" variant="outlined"/>
      <v-btn color="primary" block :loading="busy" @click="diagnose">开始诊断</v-btn>
      <template v-if="diagResult">
        <div class="d-flex align-center ga-2 mt-4 mb-2">
          <strong>执行结果</strong>
          <v-chip size="x-small" :color="diagResult.code === 0 ? 'success':'warning'">
            退出码 {{ diagResult.code }}
          </v-chip>
          <v-spacer/>
          <v-btn size="small" variant="text" @click="copyText(diagResult.output)">复制</v-btn>
        </div>
        <v-textarea :model-value="diagResult.output" readonly variant="outlined" rows="10" auto-grow/>
      </template>
    </template>
    <template v-else-if="kind === 'logs'">
      <h3 class="mb-1">系统日志中心</h3>
      <p class="text-caption text-medium-emphasis mb-3">日志从路由器实时读取，不进行本地长期存储。</p>
      <v-btn-toggle v-model="logKind" mandatory density="compact" color="primary"
        variant="tonal" class="mb-3" @update:model-value="loadLogs">
        <v-btn value="system">系统日志</v-btn>
        <v-btn value="kernel">内核日志</v-btn>
      </v-btn-toggle>
      <v-text-field v-model="logSearch" label="搜索日志" prepend-inner-icon="mdi-magnify"
        density="compact" variant="outlined" clearable/>
      <div class="d-flex align-center ga-2 mb-2">
        <v-chip size="small" variant="tonal">{{ visibleLogs.length }} 条</v-chip>
        <span class="text-caption text-medium-emphasis">{{ logSource || '未读取' }}</span>
        <v-spacer/>
        <v-btn size="small" variant="text" @click="copyText(visibleLogs.join('\n'))">复制</v-btn>
        <v-btn size="small" variant="tonal" :loading="busy" @click="loadLogs">刷新</v-btn>
      </div>
      <v-alert v-if="!visibleLogs.length" type="info" variant="tonal">没有日志或没有匹配内容</v-alert>
      <div v-else class="pa-2 rounded border" style="max-height: 65vh; overflow:auto; background: rgba(100,100,100,.06)">
        <pre style="white-space: pre-wrap; overflow-wrap:anywhere; font-size: 11px; line-height: 1.55">{{ visibleLogs.join('\n') }}</pre>
      </div>
    </template>
    <template v-else-if="kind === 'backup'">
      <h3 class="mb-1">配置备份与恢复</h3>
      <v-alert type="info" density="compact" variant="tonal" class="my-3">
        此处是可移植的 UCI 配置快照，不是 sysupgrade 全量系统归档。
        恢复时仅修改目标路由器现有同名、同类型配置节的字段，不删除其他配置节。
        快照可能包含宽带账号密码，请安全保存。
      </v-alert>
      <div class="d-flex align-center ga-2 mb-2">
        <strong>系统原生备份文件清单</strong>
        <v-spacer/>
        <v-btn size="small" variant="text" :loading="busy" @click="loadBackup">刷新</v-btn>
      </div>
      <v-alert v-if="backupError" type="warning" variant="tonal" density="compact">
        原生清单不可读取：{{ backupError }}。UCI 快照可独立使用。
      </v-alert>
      <v-expansion-panels v-else-if="backupFiles.length" density="compact" class="mb-4">
        <v-expansion-panel :title="'预计纳入系统备份的文件：' + backupFiles.length + ' 项'">
          <v-expansion-panel-text>
            <div style="max-height: 140px; overflow:auto; font-size:12px">
              <div v-for="file in backupFiles" :key="file">{{ file }}</div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
      <strong>创建 UCI 配置快照</strong>
      <v-checkbox v-for="config in SNAPSHOT_CONFIGS" :key="config"
        v-model="backupConfigs" :value="config" :label="config"
        density="compact" hide-details/>
      <v-btn class="mt-3 mb-2" color="primary" block :loading="busy"
        :disabled="!backupConfigs.length || restorePending" @click="exportBackup">
        生成并导出 JSON
      </v-btn>
      <v-expansion-panels v-if="backupJson" class="mb-4">
        <v-expansion-panel title="查看 / 复制配置快照（可能包含密码）">
          <v-expansion-panel-text>
            <v-btn size="small" class="mb-2" @click="copyText(backupJson)">复制 JSON</v-btn>
            <v-textarea :model-value="backupJson" readonly rows="5" variant="outlined"/>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
      <v-divider class="my-4"/>
      <strong>从配置快照恢复</strong>
      <p class="text-caption text-medium-emphasis my-2">
        仅支持本 APP 生成的 JSON；恢复前逐项比较，应用后必须在 90 秒内确认，否则尝试自动回滚。
      </p>
      <input type="file" accept="application/json,.json" aria-label="选择配置快照文件"
        :disabled="busy || restorePending" @change="importBackup"/>
      <template v-if="preview">
        <v-alert type="warning" variant="tonal" class="mt-3">
          计划修改 {{ preview.changes.length }} 个配置节中的 {{ preview.count }} 个字段；
          跳过 {{ preview.skipped.length }} 个配置节。未出现在快照中的配置保持不变。
        </v-alert>
        <v-expansion-panels class="mt-2">
          <v-expansion-panel title="查看配置差异（仅显示字段名，不显示密码）">
            <v-expansion-panel-text>
              <div v-for="item in preview.changes" :key="item.config + item.section"
                class="text-caption mb-1">
                {{ item.config }}.{{ item.section }}：{{ Object.keys(item.values).join(', ') }}
              </div>
              <div v-for="item in preview.skipped" :key="item" class="text-caption">{{ item }}</div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
        <v-text-field v-if="preview.count && !restorePending" v-model="restorePhrase"
          class="mt-3" label="输入“恢复配置”以确认临时应用" density="compact" variant="outlined"/>
        <v-btn v-if="!restorePending && preview.count" color="warning" block
          :disabled="restorePhrase !== '恢复配置' || busy || restoreUnknown"
          @click="applyRestore">临时应用配置（可回滚）</v-btn>
      </template>
      <v-alert v-if="restorePending" type="warning" variant="tonal" class="mt-3">
        已提交临时应用：请立即确认连通性。剩余 {{ restoreSecondsLeft }} 秒，超时由路由器自动回滚。
      </v-alert>
      <div v-if="restorePending" class="d-flex ga-2 mt-3">
        <v-btn variant="outlined" :loading="busy" @click="finishRestore(false)">立即回滚</v-btn>
        <v-btn color="success" :loading="busy" @click="finishRestore(true)">确认保留</v-btn>
      </div>
      <v-alert v-if="restoreUnknown" type="warning" variant="tonal" class="mt-3">
        提交结果不确定，请检查连接及路由器配置，不要重复提交；必要时等待自动回滚。
      </v-alert>
    </template>
    <template v-else-if="kind === 'dnsdhcp'">
      <h3 class="mb-1">DNS / DHCP 静态记录</h3>
      <p class="text-caption text-medium-emphasis mb-3">
        管理 /etc/config/dhcp 中的域名解析记录和静态租约；原有接口 DHCP 地址池在“网络 → 接口”管理。
      </p>
      <v-btn-toggle v-model="dhcpTab" mandatory variant="tonal" density="compact"
        color="primary" class="mb-3">
        <v-btn value="dns">本地域名 {{ dhcpEntries.dns.length }}</v-btn>
        <v-btn value="lease">静态租约 {{ dhcpEntries.leases.length }}</v-btn>
      </v-btn-toggle>
      <div v-for="record in (dhcpTab === 'dns' ? dhcpEntries.dns : dhcpEntries.leases)"
        :key="record.id" class="d-flex align-center ga-2 py-2"
        style="border-bottom:1px solid rgba(120,120,120,.2)">
        <div style="min-width:0; flex:1">
          <strong style="overflow-wrap:anywhere">{{ record.name || '未命名' }}</strong>
          <div class="text-caption text-medium-emphasis">{{ record.ip }}{{ record.mac ? ' · ' + record.mac : '' }}</div>
        </div>
        <v-btn icon="mdi-delete-outline" size="small" variant="text"
          color="warning" :disabled="busy" @click="recordDelete = record"/>
      </div>
      <v-alert v-if="!(dhcpTab === 'dns' ? dhcpEntries.dns : dhcpEntries.leases).length"
        type="info" density="compact" variant="tonal" class="my-2">暂无记录</v-alert>
      <h4 class="mt-4 mb-2">新增{{ dhcpTab === 'dns' ? '域名解析' : '静态租约' }}</h4>
      <v-text-field v-model.trim="recordName" label="主机名 / 域名" density="compact" variant="outlined"/>
      <v-text-field v-model.trim="recordIp" label="目标 IP 地址" density="compact" variant="outlined"/>
      <v-text-field v-if="dhcpTab === 'lease'" v-model.trim="recordMac"
        label="设备 MAC 地址" density="compact" variant="outlined"/>
      <v-btn color="primary" block :loading="busy" @click="addRecord">保存记录并重载 dnsmasq</v-btn>
      <v-dialog :model-value="!!recordDelete" max-width="420" persistent>
        <v-card>
          <v-card-title>删除静态记录？</v-card-title>
          <v-card-text>删除 {{ recordDelete?.name }} 后需要重新加载 dnsmasq。</v-card-text>
          <v-card-actions>
            <v-spacer/>
            <v-btn variant="text" @click="recordDelete = null">取消</v-btn>
            <v-btn color="error" @click="deleteRecord">确认删除</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>
    <template v-else-if="kind === 'services'">
      <h3 class="mb-1">系统服务管理</h3>
      <p class="text-caption text-medium-emphasis mb-3">
        基于路由器 rc.list / rc.init 和 LuCI 授权接口；关键管理服务禁止危险的停止或禁用操作。
      </p>
      <v-text-field v-model="serviceSearch" label="搜索服务" prepend-inner-icon="mdi-magnify"
        density="compact" variant="outlined" clearable/>
      <div v-for="service in selectedServices" :key="service.name" class="py-3"
        style="border-bottom:1px solid rgba(120,120,120,.2)">
        <div class="d-flex align-center ga-2 mb-2">
          <strong>{{ service.name }}</strong>
          <v-chip size="x-small" :color="service.running ? 'success' : 'secondary'">
            {{ service.running ? '运行中' : '未运行' }}
          </v-chip>
          <v-chip size="x-small" variant="tonal">
            {{ service.enabled ? '开机启用' : '未开机启用' }}
          </v-chip>
        </div>
        <div class="d-flex flex-wrap ga-2">
          <v-btn size="x-small" variant="tonal" :disabled="busy || service.running"
            @click="serviceConfirm = { name:service.name, action:'start' }">启动</v-btn>
          <v-btn size="x-small" variant="tonal" :disabled="busy || CRITICAL_SERVICES.includes(service.name)"
            @click="serviceConfirm = { name:service.name, action:'restart' }">重启</v-btn>
          <v-btn size="x-small" color="warning" variant="tonal"
            :disabled="busy || !service.running || CRITICAL_SERVICES.includes(service.name)"
            @click="serviceConfirm = { name:service.name, action:'stop' }">停止</v-btn>
          <v-btn size="x-small" variant="text" :disabled="busy || service.enabled"
            @click="serviceConfirm = { name:service.name, action:'enable' }">开机启用</v-btn>
          <v-btn size="x-small" color="warning" variant="text"
            :disabled="busy || !service.enabled || CRITICAL_SERVICES.includes(service.name)"
            @click="serviceConfirm = { name:service.name, action:'disable' }">取消自启</v-btn>
        </div>
      </div>
      <v-alert v-if="!selectedServices.length" type="info" variant="tonal">暂无匹配的服务</v-alert>
      <v-dialog :model-value="!!serviceConfirm" max-width="400" persistent>
        <v-card>
          <v-card-title>确认服务操作</v-card-title>
          <v-card-text>将向路由器提交 {{ serviceConfirm?.name }} 的 {{ serviceConfirm?.action }} 操作。
            部分服务重启可能导致网络暂时中断。</v-card-text>
          <v-card-actions>
            <v-spacer/>
            <v-btn variant="text" @click="serviceConfirm = null">取消</v-btn>
            <v-btn color="primary" @click="operateService">确认操作</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>
  </section>
</template>
