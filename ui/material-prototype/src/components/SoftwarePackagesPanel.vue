<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { shortError } from '../services/router.js'
import { readDiskUsage } from '../services/telemetry.js'
import {
  PACKAGE_PAGE_SIZE, packageCollections, parsePackageList, visiblePackages,
  runPackageAction, readPackageListing, readPackageConfigs, savePackageConfig,
  uploadLocalPackage, deleteUploadedPackage, validatePackageTarget
} from '../services/softwarePackages.js'

const props = defineProps({ client: { type: Object, required: true } })
const loading = ref(false)
const busy = ref(false)
const notice = ref('')
const noticeType = ref('info')
const toastOpen = ref(false)
const manager = ref('opkg')
const supported = ref(false)
const packages = ref({ available: [], installed: [], updates: [] })
const disk = ref(null)
const tab = ref('available')
const search = ref('')
const translations = ref('filtered')
const page = ref(0)
const input = ref('')
const actionDialog = ref(false)
const action = ref(null)
const actionPhrase = ref('')
const outputDialog = ref(false)
const outputTitle = ref('')
const outputText = ref('')
const configDialog = ref(false)
const configSaveConfirm = ref(false)
const configFiles = ref([])
const configPath = ref('')
const configText = ref('')
const configOriginal = ref('')
const fileInput = ref(null)
const selectedFile = ref(null)
const uploadPercent = ref(0)
const checked = ref(false)
const list = computed(() => visiblePackages(packages.value[tab.value] || [], search.value, translations.value))
const pages = computed(() => Math.max(1, Math.ceil(list.value.length / PACKAGE_PAGE_SIZE)))
const rows = computed(() => list.value.slice(page.value * PACKAGE_PAGE_SIZE, (page.value + 1) * PACKAGE_PAGE_SIZE))
const showingFrom = computed(() => list.value.length ? page.value * PACKAGE_PAGE_SIZE + 1 : 0)
const showingTo = computed(() => Math.min(list.value.length, (page.value + 1) * PACKAGE_PAGE_SIZE))
const configDirty = computed(() => configText.value !== configOriginal.value)
const activeFile = computed(() => configFiles.value.find(x => x.path === configPath.value))
watch([search, tab, translations], () => { page.value = 0 })
function message(text, type = 'info') {
  notice.value = String(text)
  noticeType.value = type
  toastOpen.value = Boolean(text)
}
function size(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return '未知'
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KiB'
  return (n / 1048576).toFixed(2) + ' MiB'
}
function itemCount(value) { return packages.value[value]?.length || 0 }

async function load() {
  if (busy.value || loading.value) return
  loading.value = true
  checked.value = true
  try {
    const [installed, available, storage] = await Promise.allSettled([
      readPackageListing(props.client, 'list-installed'),
      readPackageListing(props.client, 'list-available'),
      readDiskUsage(props.client)
    ])
    if (storage.status === 'fulfilled') disk.value = storage.value.primary
    if (installed.status !== 'fulfilled') {
      supported.value = false
      throw installed.reason
    }
    supported.value = true
    const installedRaw = installed.value.stdout
    manager.value = installedRaw.trim().startsWith('[') || installedRaw.trim().startsWith('{') ? 'apk' : 'opkg'
    const current = parsePackageList(installedRaw, true)
    const availablePkgs = available.status === 'fulfilled'
      ? parsePackageList(available.value.stdout, false) : []
    packages.value = packageCollections(availablePkgs, current)
    page.value = Math.min(page.value, pages.value - 1)
    if (available.status === 'rejected')
      message('已加载已安装软件包，但获取可用列表失败。请先更新列表：' + shortError(available.reason), 'warning')
  } catch (e) {
    message('无法读取软件包：' + shortError(e) +
      '。请检查路由器是否提供 /usr/libexec/package-manager-call、rpcd file.exec 权限及软件源状态。', 'error')
  } finally {
    loading.value = false
  }
}

function chooseFile(event) {
  selectedFile.value = event.target?.files?.[0] || null
  if (selectedFile.value) message('已选择 ' + selectedFile.value.name + '（' + size(selectedFile.value.size) + '）')
}
function propose(kind, item = null) {
  if (busy.value || loading.value || !supported.value) return
  const target = kind === 'install-text' ? input.value.trim() : kind === 'upload'
    ? selectedFile.value?.name : item?.name || ''
  if (kind === 'install-text') {
    try { validatePackageTarget(target, { allowUrl: true, manager: manager.value }) }
    catch (e) { message(shortError(e), 'warning'); return }
  }
  if (kind === 'upload' && !selectedFile.value) {
    message('请先选择本地软件包文件', 'warning'); return
  }
  action.value = { kind, target, item }
  actionPhrase.value = ''
  actionDialog.value = true
}
const actionLabel = computed(() => ({
  install: '安装', 'install-text': '下载并安装', remove: '移除',
  upgrade: '升级', 'upgrade-all': '全部升级', update: '更新软件源列表', upload: '上传并安装'
})[action.value?.kind] || '执行')
const actionWarning = computed(() => {
  const kind = action.value?.kind
  if (kind === 'upgrade-all')
    return '批量升级可能损坏系统依赖或引起路由器无法启动。建议通过固件升级更新核心包；如仍需执行，请输入“确认批量升级”。'
  if (kind === 'remove')
    return '移除软件包可能导致依赖组件和路由器服务被删除，请核实目标软件包。'
  if (kind === 'upgrade')
    return '升级核心软件包可能与当前固件不兼容，建议优先升级整套固件。'
  if (kind === 'install-text' && /^https:\/\//i.test(action.value?.target || ''))
    return '将从非软件源 URL 下载第三方代码并安装到路由器。请确认 URL 来源可信，且软件包与固件架构匹配。'
  if (kind === 'upload')
    return '本地 IPK/APK 将上传至路由器并安装。请确认文件可信、架构和固件版本一致。'
  if (kind === 'update') return '将连接软件源并刷新可用软件包索引。'
  return '安装会修改路由器文件系统，并可能启动或重启服务。'
})
const canConfirm = computed(() => !busy.value &&
  (action.value?.kind !== 'upgrade-all' || actionPhrase.value === '确认批量升级'))

async function perform() {
  if (!action.value || !canConfirm.value) return
  const choice = action.value
  actionDialog.value = false
  busy.value = true
  outputText.value = ''
  outputTitle.value = actionLabel.value + '软件包'
  uploadPercent.value = 0
  outputDialog.value = true
  try {
    let result
    if (choice.kind === 'upload') {
      const path = await uploadLocalPackage(props.client, selectedFile.value, manager.value,
        progress => { uploadPercent.value = progress })
      try { result = await runPackageAction(props.client, 'install', [path], manager.value) }
      finally { await deleteUploadedPackage(props.client, manager.value) }
    } else {
      const kind = choice.kind === 'install-text' ? 'install' :
        choice.kind === 'upgrade-all' ? 'upgrade' : choice.kind
      const targets = ['update', 'upgrade-all'].includes(choice.kind) ? [] : [choice.target]
      result = await runPackageAction(props.client, kind, targets, manager.value)
    }
    outputText.value = ((result.pkmcmd || '') + '\n' +
      (result.stdout || '') + '\n' + (result.stderr || '')).trim().slice(-48000) ||
      '执行成功，命令没有输出内容'
    message(actionLabel.value + '完成，正在重新读取软件包列表', 'success')
    if (choice.kind === 'install-text') input.value = ''
    if (choice.kind === 'upload') {
      selectedFile.value = null
      if (fileInput.value) fileInput.value.value = ''
    }
  } catch (e) {
    outputText.value = '操作未确认成功：' + shortError(e) +
      '\n\n如果 RPC 超时或路由器断线，操作可能仍在执行；请检查实际状态，不要立即重复安装、删除或升级。'
    message('软件包操作失败或状态未确认，请查看执行结果', 'error')
  } finally {
    busy.value = false
    await load()
  }
}

async function openConfig() {
  if (busy.value) return
  busy.value = true
  try {
    const files = await readPackageConfigs(props.client, manager.value)
    configFiles.value = files
    configPath.value = files.find(f => f.exists)?.path || files[0]?.path || ''
    chooseConfig(configPath.value)
    configDialog.value = true
  } catch (e) { message('读取配置失败：' + shortError(e), 'error') }
  finally { busy.value = false }
}
function chooseConfig(path) {
  const file = configFiles.value.find(f => f.path === path)
  configPath.value = path
  configText.value = file?.content || ''
  configOriginal.value = configText.value
}
async function saveConfig() {
  if (busy.value || !configDirty.value || !activeFile.value) return
  configSaveConfirm.value = false
  busy.value = true
  try {
    await savePackageConfig(props.client, manager.value, configPath.value, configText.value)
    configOriginal.value = configText.value
    message('配置已保存。请点击“更新列表”让新的软件源生效', 'success')
  } catch (e) { message('保存失败：' + shortError(e), 'error') }
  finally { busy.value = false }
}
onMounted(() => { void load() })
watch(() => props.client, () => {
  packages.value = { available: [], installed: [], updates: [] }
  supported.value = false
  void load()
})
defineExpose({ refreshAction: load })
</script>

<template>
  <section class="package-manager-panel">
    <v-snackbar v-model="toastOpen" location="bottom" :timeout="5500" :color="noticeType"
      :style="{ bottom: '77px' }" role="status" aria-live="polite">
      {{ notice }}
      <template #actions><v-btn variant="text" size="small" @click="toastOpen = false">关闭</v-btn></template>
    </v-snackbar>

    <div class="package-manager-heading">
      <div><h3>软件包</h3><p class="muted-hint">OpenWrt 系统软件包 · {{ manager }}</p></div>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :disabled="busy" :loading="loading"
        @click="load">刷新</v-btn>
    </div>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="my-2"/>
    <v-alert type="warning" variant="tonal" density="compact" class="mb-3">
      警告：直接操作或升级系统核心软件包可能损坏固件。请确保已备份配置。
    </v-alert>
    <div v-if="disk" class="package-disk mb-4">
      <div class="d-flex justify-space-between ga-2"><strong>磁盘空间</strong><strong>{{ disk.percent }}% 已使用</strong></div>
      <p class="muted-hint">{{ disk.usedText }} / {{ disk.totalText }} · {{ disk.mount }}</p>
      <v-progress-linear :model-value="disk.percent" rounded color="primary" height="7"/>
    </div>
    <v-alert v-if="checked && !supported && !loading" type="error" variant="tonal" density="compact" class="mb-3">
      尚未获取到软件包管理器。请确认 QWRT 已安装 LuCI 软件包管理组件并允许 RPC 调用 file.exec。
    </v-alert>

    <div class="package-form-line">
      <v-text-field v-model="search" label="过滤器" placeholder="按名称、版本、描述筛选"
        density="compact" variant="outlined" clearable hide-details/>
      <v-btn variant="outlined" :disabled="!search" @click="search = ''">清除</v-btn>
    </div>
    <div class="package-form-line mt-3">
      <v-text-field v-model.trim="input" label="下载并安装软件包"
        placeholder="软件包名称或 HTTPS URL" density="compact" variant="outlined" hide-details/>
      <v-btn color="primary" variant="tonal" :disabled="busy || !supported || !input.trim()"
        @click="propose('install-text')">确认</v-btn>
    </div>
    <div class="package-actions mt-4">
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh"
        :disabled="busy || !supported" @click="propose('update')">更新列表</v-btn>
      <v-btn variant="outlined" prepend-icon="mdi-upload"
        :disabled="busy || !supported" @click="fileInput?.click()">上传软件包</v-btn>
      <v-btn variant="outlined" prepend-icon="mdi-cog-outline"
        :disabled="busy || !supported" @click="openConfig">配置 {{ manager }}</v-btn>
    </div>
    <input ref="fileInput" type="file" :accept="manager === 'apk' ? '.apk' : '.ipk'"
      class="package-hidden-file" aria-label="选择本地软件包" @change="chooseFile"/>
    <div v-if="selectedFile" class="package-selected-file mt-2">
      <span>{{ selectedFile.name }}（{{ size(selectedFile.size) }}）</span>
      <v-btn color="primary" size="small" :disabled="busy" @click="propose('upload')">安装选中文件</v-btn>
    </div>

    <div class="package-translations mt-4">
      <span>显示 LuCI 翻译包：</span>
      <v-radio-group v-model="translations" inline density="compact" hide-details>
        <v-radio label="已过滤" value="filtered"/><v-radio label="全部" value="all"/>
        <v-radio label="不显示" value="none"/>
      </v-radio-group>
    </div>

    <v-tabs v-model="tab" color="primary" density="compact" class="mt-3 package-tabs">
      <v-tab value="available">可用 <small>{{ itemCount('available') }}</small></v-tab>
      <v-tab value="installed">已安装 <small>{{ itemCount('installed') }}</small></v-tab>
      <v-tab value="updates">更新 <small>{{ itemCount('updates') }}</small></v-tab>
    </v-tabs>
    <div class="package-list-meta mt-3">
      <span>正在显示 {{ showingFrom }}–{{ showingTo }}，共 {{ list.length }}</span>
      <div class="d-flex align-center ga-1">
        <v-btn icon="mdi-chevron-double-left" variant="tonal" size="small" aria-label="上一页"
          :disabled="page === 0" @click="page--"/>
        <span>{{ page + 1 }}/{{ pages }}</span>
        <v-btn icon="mdi-chevron-double-right" variant="tonal" size="small" aria-label="下一页"
          :disabled="page >= pages - 1" @click="page++"/>
      </div>
    </div>
    <v-btn v-if="tab === 'updates' && packages.updates.length" class="my-2" size="small"
      color="warning" variant="outlined" :disabled="busy" @click="propose('upgrade-all')">
      全部升级（高风险）
    </v-btn>
    <div v-if="rows.length" class="package-list mt-3" role="list" aria-label="软件包列表">
      <div v-for="pkg in rows" :key="pkg.name + pkg.version" class="package-entry" role="listitem">
        <div class="package-entry-head">
          <strong class="package-entry-name">{{ pkg.name }}</strong>
          <v-chip size="x-small" variant="tonal" color="secondary">{{ size(pkg.size) }}</v-chip>
        </div>
        <div class="package-entry-version">
          <span>版本 {{ pkg.version }}</span>
          <span v-if="pkg.currentVersion">当前 {{ pkg.currentVersion }}</span>
        </div>
        <p v-if="pkg.description" class="package-entry-description">{{ pkg.description }}</p>
        <v-btn v-if="tab === 'available'" size="small" block variant="tonal" color="primary"
          :disabled="busy || pkg.installed" @click="propose('install', pkg)">
          {{ pkg.installed ? '已安装' : '安装…' }}
        </v-btn>
        <v-btn v-else-if="tab === 'installed'" size="small" block variant="outlined" color="warning"
          :disabled="busy" @click="propose('remove', pkg)">移除…</v-btn>
        <v-btn v-else size="small" block variant="tonal" color="primary"
          :disabled="busy" @click="propose('upgrade', pkg)">升级…</v-btn>
      </div>
    </div>
    <v-alert v-else-if="!loading" type="info" density="compact" variant="tonal" class="mt-3">
      {{ supported ? '当前筛选条件下没有软件包，请尝试清空过滤器或更新列表。' : '暂无可显示的软件包。' }}
    </v-alert>

    <v-dialog v-model="actionDialog" max-width="480">
      <v-card rounded="xl">
        <v-card-title>确认{{ actionLabel }}？</v-card-title>
        <v-card-text>
          <p class="mb-3" style="overflow-wrap:anywhere">{{ action?.target }}</p>
          <v-alert type="warning" density="compact" variant="tonal">{{ actionWarning }}</v-alert>
          <v-text-field v-if="action?.kind === 'upgrade-all'" v-model="actionPhrase"
            class="mt-3" label="输入：确认批量升级" variant="outlined" density="compact"/>
        </v-card-text>
        <v-card-actions>
          <v-spacer/><v-btn variant="text" @click="actionDialog = false">取消</v-btn>
          <v-btn color="primary" :disabled="!canConfirm" @click="perform">确认执行</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="outputDialog" max-width="620" scrollable>
      <v-card rounded="xl">
        <v-card-title>{{ outputTitle }}</v-card-title>
        <v-card-text>
          <v-progress-linear v-if="busy" indeterminate color="primary" class="mb-3"/>
          <p v-if="uploadPercent && busy">上传进度：{{ uploadPercent }}%</p>
          <pre class="package-exec-output">{{ outputText || (busy ? '正在执行，请勿重复操作…' : '无执行输出') }}</pre>
        </v-card-text>
        <v-card-actions><v-spacer/><v-btn variant="tonal" @click="outputDialog = false">关闭</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="configDialog" max-width="650" scrollable>
      <v-card rounded="xl">
        <v-card-title>配置 {{ manager }}</v-card-title>
        <v-card-text>
          <v-select :model-value="configPath" label="配置文件" :items="configFiles.map(f => ({
              title: f.path + (f.exists ? '' : '（不存在）'), value: f.path
            }))" variant="outlined" density="compact"
            @update:model-value="chooseConfig"/>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-3">
            修改软件源地址前请备份原内容。错误的配置可能造成无法更新列表或安装软件包。
          </v-alert>
          <v-textarea v-model="configText" class="package-config-editor" label="配置内容"
            variant="outlined" density="compact" rows="12" auto-grow
            :disabled="!activeFile?.exists || busy"/>
          <p v-if="!activeFile?.exists" class="muted-hint">该文件不存在或当前账号没有读取权限，因此暂不可编辑。</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer/><v-btn variant="text" @click="configDialog = false">关闭</v-btn>
          <v-btn color="primary" :disabled="busy || !activeFile?.exists || !configDirty"
            :loading="busy" @click="configSaveConfirm = true">保存配置</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="configSaveConfirm" max-width="430">
      <v-card rounded="xl">
        <v-card-title>确认覆盖软件源配置？</v-card-title>
        <v-card-text>
          将修改路由器上的 <strong style="overflow-wrap:anywhere">{{ configPath }}</strong>。
          配置错误可能导致软件包更新和安装失败，请确保已备份原配置。
        </v-card-text>
        <v-card-actions>
          <v-spacer/><v-btn variant="text" @click="configSaveConfirm = false">取消</v-btn>
          <v-btn color="warning" :disabled="busy" @click="saveConfig">确认保存配置</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.package-manager-panel{min-width:0}
.package-manager-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
.package-manager-heading h3{font-size:17px;margin:0}
.package-manager-heading p{font-size:11px}
.package-disk strong{font-size:12px}
.package-disk p{margin:4px 0 9px;font-size:11px}
.package-form-line{display:flex;align-items:center;gap:8px;min-width:0}
.package-form-line .v-input{min-width:0;flex:1}
.package-form-line .v-btn{flex:0 0 auto;min-width:65px}
.package-actions{display:flex;flex-wrap:wrap;gap:8px}
.package-actions .v-btn{flex:1 1 auto;min-width:120px}
.package-hidden-file{display:none}
.package-selected-file{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;overflow-wrap:anywhere}
.package-translations{display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:12px}
.package-translations .v-selection-control{margin-right:7px}
.package-tabs small{margin-left:4px;opacity:.7}
.package-list-meta{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px}
.package-list{display:flex;flex-direction:column;gap:9px}
.package-entry{padding:11px 12px;border-radius:12px;border:1px solid rgba(var(--v-theme-on-surface),.16);background:rgba(var(--v-theme-on-surface),.035);min-width:0}
.package-entry-head{display:flex;gap:8px;align-items:center;justify-content:space-between;min-width:0}
.package-entry-name{font-size:13px;overflow-wrap:anywhere}
.package-entry-version{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:rgb(var(--v-theme-on-surface-variant));margin-top:3px}
.package-entry-description{font-size:12px;line-height:1.45;margin:8px 0 9px;white-space:pre-wrap;overflow-wrap:anywhere}
.package-entry>.v-btn{margin-top:8px}
.package-exec-output{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;max-height:52vh;overflow:auto;padding:12px;border-radius:10px;background:rgba(var(--v-theme-on-surface),.06)}
.package-config-editor :deep(textarea){font-family:ui-monospace,SFMono-Regular,Consolas,monospace!important;font-size:12px;line-height:1.5}
</style>
