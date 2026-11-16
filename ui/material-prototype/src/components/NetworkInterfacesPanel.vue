<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { shortError } from '../services/router.js'
import {
  EDITABLE_PROTOCOLS, NETWORK_APPLY_TIMEOUT, PROTOCOL_LABELS,
  buildInterfaceChanges, confirmInterfaceChanges, formFromConfig,
  isCriticalInterface, rollbackInterfaceChanges, setInterfaceRuntime,
  stageAndApplyInterface
} from '../services/networkInterfaceConfig.js'

const props = defineProps({
  client: { type: Object, required: true },
  interfaces: { type: Array, default: () => [] },
  formatUptime: { type: Function, required: true },
  validSeconds: { type: Function, required: true }
})
const emit = defineEmits(['refresh'])
const networkConfig = ref(null)
const dhcpConfig = ref(null)
const loading = ref(false)
const busy = ref(false)
const message = ref('')
const messageKind = ref('info')
const toastOpen = ref(false)
const editorOpen = ref(false)
const activeTab = ref('general')
const editor = ref(null)
const current = ref('')
const pending = ref(false)
const applyingUnknown = ref(false)
const runtimeTarget = ref(null)
const closeWarning = ref(false)
let loadToken = 0

const protocols = EDITABLE_PROTOCOLS.map(value => ({ title: PROTOCOL_LABELS[value], value }))
const ipv6RequestOptions = ['try', 'force', 'none']
const modeOptions = ['disabled', 'server', 'relay', 'hybrid']
const optionItems = values => values.map(value => ({ title: value, value }))
const hasDhcpConfig = computed(() => Boolean(dhcpConfig.value?.values))
const canConfigure = name => Boolean(networkConfig.value && formFromConfig(name, networkConfig.value, dhcpConfig.value)?.editable)
const isWan = name => /^wan(?:6|_6)?$/i.test(name)
const dhcpEditable = computed(() => editor.value && editor.value.proto === 'static' &&
  !isWan(current.value))
const pendingPrompt = computed(() => pending.value
  ? '配置已暂时生效，请在 ' + NETWORK_APPLY_TIMEOUT + ' 秒内确认保留。若无法重新连接，OpenWrt 会自动回滚本次修改。'
  : '')

function alert(text, kind = 'info') {
  message.value = text
  messageKind.value = kind
  toastOpen.value = Boolean(text)
}
async function load() {
  if (!props.client || loading.value || pending.value) return
  const token = ++loadToken
  loading.value = true
  try {
    const [network, dhcp] = await Promise.allSettled([
      props.client.call('uci', 'get', { config: 'network' }),
      props.client.call('uci', 'get', { config: 'dhcp' })
    ])
    if (token !== loadToken) return
    if (network.status === 'fulfilled' && network.value?.values) {
      networkConfig.value = network.value
    } else {
      networkConfig.value = null
      alert('无法读取 /etc/config/network；请检查当前账号是否具有 UCI 读取权限', 'warning')
    }
    dhcpConfig.value = dhcp.status === 'fulfilled' && dhcp.value?.values ? dhcp.value : null
  } finally { if (token === loadToken) loading.value = false }
}
async function refreshAction() {
  if (busy.value || pending.value) return
  await load()
  if (networkConfig.value) alert('网络接口配置已刷新', 'success')
}
function openEditor(name) {
  const selected = formFromConfig(name, networkConfig.value, dhcpConfig.value)
  if (!selected?.editable) {
    alert('该接口未定义在 UCI network 中，或使用高级协议。请在 LuCI 中调整。', 'warning')
    return
  }
  editor.value = selected
  current.value = name
  activeTab.value = 'general'
  applyingUnknown.value = false
  editorOpen.value = true
}
async function saveAndApply() {
  if (busy.value || pending.value || !editor.value) return
  let mutations
  try {
    mutations = buildInterfaceChanges(current.value, networkConfig.value, dhcpConfig.value, editor.value)
  } catch (e) {
    alert(shortError(e), 'warning')
    return
  }
  if (!mutations.length) {
    alert('配置没有变化', 'info')
    return
  }
  busy.value = true
  applyingUnknown.value = false
  try {
    await stageAndApplyInterface(props.client, mutations)
    pending.value = true
    alert('配置已提交临时生效，请确认保留；逾时自动回滚', 'warning')
    emit('refresh')
  } catch (e) {
    // The network may have gone away after rpcd started applying the change.
    // Do not claim success or force a second apply: the router's rollback
    // timeout is the only safe recovery in this ambiguous state.
    applyingUnknown.value = true
    alert('配置提交未获得完整确认：' + shortError(e) + '。如网络已断开，请等待路由器自动回滚，勿重复提交。', 'warning')
  } finally { busy.value = false }
}
async function confirmChanges() {
  if (!pending.value || busy.value) return
  busy.value = true
  try {
    await confirmInterfaceChanges(props.client)
    pending.value = false
    editorOpen.value = false
    editor.value = null
    await load()
    emit('refresh')
    alert('已确认保留接口配置', 'success')
  } catch (e) {
    alert('确认失败：' + shortError(e) + '。超时后将由路由器自动回滚，请核对连接状态。', 'warning')
  } finally { busy.value = false }
}
async function rollbackChanges() {
  if (!pending.value || busy.value) return
  busy.value = true
  try {
    await rollbackInterfaceChanges(props.client)
    pending.value = false
    editorOpen.value = false
    editor.value = null
    await load()
    emit('refresh')
    alert('已请求恢复应用前的网络配置', 'info')
  } catch (e) {
    alert('主动回滚失败：' + shortError(e) + '。请等待自动回滚后重新连接。', 'warning')
  } finally { busy.value = false }
}
function requestRuntime(name, action) {
  if (busy.value || pending.value) return
  runtimeTarget.value = { name, action }
}
async function performRuntime() {
  const item = runtimeTarget.value
  if (!item || busy.value || pending.value) return
  runtimeTarget.value = null
  busy.value = true
  try {
    await setInterfaceRuntime(props.client, item.name, item.action)
    alert('已向路由器提交 ' + item.name + (item.action === 'up' ? ' 连接' : ' 断开') +
      '命令；请刷新确认实际状态', 'success')
    emit('refresh')
  } catch (e) { alert('接口操作失败：' + shortError(e), 'warning') }
  finally { busy.value = false }
}
function closeEditor() {
  if (pending.value || busy.value) return
  editorOpen.value = false
  editor.value = null
}
// Called by the parent Android Back/gesture handler before route navigation.
// The panel owns its dialogs, so it must consume the Back action first.
function handleBack() {
  if (editorOpen.value) {
    if (pending.value) {
      alert('网络配置正在等待确认，请先选择“确认保留配置”或“立即回滚”', 'warning')
      return 'busy'
    }
    if (busy.value) return 'busy'
    closeEditor()
    return 'dialog'
  }
  if (runtimeTarget.value) {
    if (busy.value) return 'busy'
    runtimeTarget.value = null
    return 'dialog'
  }
  return null
}
watch(() => props.client, () => {
  loadToken++
  loading.value = false
  networkConfig.value = null
  dhcpConfig.value = null
  editorOpen.value = false
  editor.value = null
  pending.value = false
  void load()
})
onMounted(() => { void load() })
defineExpose({ refreshAction, handleBack })
</script>

<template>
  <section class="network-interfaces-panel">
    <v-snackbar v-model="toastOpen" :timeout="pending ? -1 : 5200" :color="messageKind"
      location="bottom" :style="{ bottom: '77px' }" role="status" aria-live="polite">
      {{ message }}
      <template #actions><v-btn variant="text" size="small" @click="toastOpen = false">关闭</v-btn></template>
    </v-snackbar>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3"/>
    <v-alert v-if="!networkConfig && !loading" type="warning" variant="tonal" density="compact" class="mb-3">
      无法读取网络配置，仍可查看接口运行状态。配置功能需要 UCI network 读写权限。
      <v-btn size="small" variant="text" @click="refreshAction">重试</v-btn>
    </v-alert>
    <v-alert v-if="pending" type="warning" variant="tonal" class="mb-3" role="status">
      {{ pendingPrompt }}
      <div class="d-flex flex-wrap ga-2 mt-3">
        <v-btn color="success" :loading="busy" @click="confirmChanges">确认保留配置</v-btn>
        <v-btn variant="outlined" :disabled="busy" @click="rollbackChanges">立即回滚</v-btn>
      </div>
    </v-alert>
    <v-alert v-if="applyingUnknown" type="warning" variant="tonal" density="compact" class="mb-3">
      接口可能已发生变更，但当前 RPC 未返回完整确认。不要重复操作；如失联请等待回滚后重新连接。
    </v-alert>

    <v-card v-for="nic in interfaces" :key="nic.interface" rounded="xl" elevation="1" class="interface-card mb-3">
      <div class="section-heading">
        <div><strong>{{ nic.interface }}</strong>
          <div class="muted-hint">{{ nic.proto || 'unknown' }} · {{ nic.device || nic.l3_device || '--' }}</div>
        </div>
        <v-chip size="small" variant="tonal" :color="nic.up ? 'success' : 'error'">{{ nic.up ? '已连接' : '未连接' }}</v-chip>
      </div>
      <div class="network-interface-details">
        <div><span>IPv4</span><strong>{{ nic['ipv4-address']?.map(x => x.address + '/' + x.mask).join(', ') || '--' }}</strong></div>
        <div><span>IPv6</span><strong>{{ nic['ipv6-address']?.map(x => x.address + '/' + x.mask).join(', ') || '--' }}</strong></div>
        <div v-if="nic['ipv6-prefix']?.length"><span>IPv6-PD</span><strong>{{ nic['ipv6-prefix'].map(x => x.address + '/' + x.mask).join(', ') }}</strong></div>
        <div v-if="['wan6','wan_6'].includes(nic.interface) && validSeconds(nic) !== null"><span>剩余有效期</span><strong>{{ formatUptime(validSeconds(nic)) }}</strong></div>
        <div v-if="nic['ipv6-prefix-assignment']?.length"><span>IPv6-PD 分配</span><strong>{{ nic['ipv6-prefix-assignment'].map(x => x.address + '/' + x.mask).join(', ') }}</strong></div>
        <div v-if="nic['dns-server']?.length"><span>DNS</span><strong>{{ nic['dns-server'].join(' / ') }}</strong></div>
        <div v-if="nic.mtu"><span>MTU</span><strong>{{ nic.mtu }}</strong></div>
        <div v-if="nic.uptime !== undefined && nic.uptime !== null"><span>运行时间</span><strong>{{ formatUptime(nic.uptime) }}</strong></div>
        <div v-if="nic.route?.length"><span>路由</span><strong>{{ nic.route.map(x => x.target + '/' + x.mask + ' → ' + (x.nexthop || '--')).join('; ') }}</strong></div>
      </div>
      <div class="d-flex flex-wrap ga-2 mt-3">
        <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-cog-outline"
          :disabled="loading || busy || pending || !canConfigure(nic.interface)"
          :aria-label="'配置接口 ' + nic.interface" @click="openEditor(nic.interface)">配置</v-btn>
        <v-btn size="small" variant="outlined" prepend-icon="mdi-lan-connect"
          :disabled="loading || busy || pending || !canConfigure(nic.interface) || nic.up"
          :aria-label="'连接接口 ' + nic.interface"
          @click="requestRuntime(nic.interface, 'up')">连接</v-btn>
        <v-btn size="small" variant="outlined" color="warning" prepend-icon="mdi-lan-disconnect"
          :disabled="loading || busy || pending || !canConfigure(nic.interface) || !nic.up || isCriticalInterface(nic.interface)"
          :aria-label="'断开接口 ' + nic.interface"
          @click="requestRuntime(nic.interface, 'down')">断开</v-btn>
      </div>
      <p v-if="isCriticalInterface(nic.interface)" class="text-caption text-medium-emphasis mt-2">
        关键 LAN/WAN 接口禁止即时断开；可在配置中设置开机启用状态，通过自动回滚机制安全应用。
      </p>
      <p v-if="networkConfig && !canConfigure(nic.interface)" class="text-caption text-medium-emphasis mt-2">
        系统自动创建的接口或特殊协议，当前仅支持查看；请使用原生 LuCI 管理其高级参数。
      </p>
    </v-card>
    <v-alert v-if="!interfaces.length" type="info" variant="tonal" density="compact">暂未获取到网络接口。</v-alert>

    <v-dialog v-model="editorOpen" max-width="590" persistent>
      <v-card v-if="editor" rounded="xl" class="network-interface-editor">
        <v-card-title class="d-flex align-center justify-space-between ga-2">
          <span>配置网络接口 · {{ current }}</span>
          <v-btn icon="mdi-close" variant="text" size="small" :disabled="pending || busy"
            aria-label="关闭接口配置" @click="closeEditor"/>
        </v-card-title>
        <v-card-subtitle>对应 /etc/config/network{{ hasDhcpConfig ? ' 与 /etc/config/dhcp' : '' }}</v-card-subtitle>
        <v-divider class="mt-3"/>
        <v-tabs v-model="activeTab" color="primary" show-arrows class="mb-2" density="comfortable">
          <v-tab value="general">常规</v-tab>
          <v-tab value="ipv6">IPv6 / 高级</v-tab>
          <v-tab value="dhcp">DHCP 服务端</v-tab>
        </v-tabs>
        <v-card-text class="network-interface-form">
          <template v-if="activeTab === 'general'">
            <v-switch v-model="editor.auto" label="开机自动启用接口" color="primary" hide-details inset class="mb-3"
              :disabled="pending || busy"/>
            <v-select v-model="editor.proto" label="接口协议" :items="protocols"
              variant="outlined" density="comfortable" :disabled="pending || busy"/>
            <v-text-field :model-value="editor.device || '由系统动态指定'" label="关联设备（仅展示）" readonly
              variant="outlined" density="comfortable"/>
            <template v-if="editor.proto === 'static'">
              <v-text-field v-model.trim="editor.ipaddr" label="IPv4 地址" placeholder="192.168.100.1"
                variant="outlined" density="comfortable"/>
              <v-text-field v-model.trim="editor.netmask" label="IPv4 子网掩码" placeholder="255.255.255.0"
                variant="outlined" density="comfortable"/>
              <v-text-field v-model.trim="editor.gateway" label="IPv4 网关（可留空）"
                variant="outlined" density="comfortable"/>
            </template>
            <template v-if="editor.proto === 'pppoe'">
              <v-text-field v-model="editor.pppoeUsername" label="PPPoE 用户名"
                variant="outlined" density="comfortable" autocomplete="off"/>
              <v-text-field v-model="editor.pppoePassword" type="password"
                :placeholder="editor.pppoePasswordSaved ? '留空保持原密码' : '请输入拨号密码'"
                label="PPPoE 密码（不回显已保存密码）" variant="outlined" density="comfortable" autocomplete="new-password"/>
            </template>
            <v-switch v-if="['dhcp','dhcpv6','pppoe'].includes(editor.proto)"
              v-model="editor.peerdns" label="使用运营商/上级下发的 DNS" color="primary" inset hide-details class="mb-3"/>
            <v-switch v-if="['dhcp','dhcpv6','pppoe'].includes(editor.proto)"
              v-model="editor.defaultroute" label="使用此接口的默认路由" color="primary" inset hide-details class="mb-3"/>
            <v-textarea v-model="editor.dns" label="自定义 DNS（每行一个 IPv4 或 IPv6）"
              rows="2" auto-grow variant="outlined" density="comfortable"/>
            <v-text-field v-model.trim="editor.metric" label="路由跃点数 Metric（可留空）"
              type="number" min="0" max="65535" variant="outlined" density="comfortable"/>
          </template>
          <template v-else-if="activeTab === 'ipv6'">
            <template v-if="editor.proto === 'static'">
              <v-text-field v-model.trim="editor.ip6assign" label="IPv6 前缀分配长度（如 64，可留空）"
                variant="outlined" density="comfortable"/>
              <v-text-field v-model.trim="editor.ip6addr" label="静态 IPv6 地址/前缀（可留空）"
                variant="outlined" density="comfortable"/>
            </template>
            <template v-else-if="editor.proto === 'dhcpv6'">
              <v-select v-model="editor.reqaddress" label="DHCPv6 地址请求"
                :items="optionItems(ipv6RequestOptions)" variant="outlined" density="comfortable"/>
              <v-text-field v-model.trim="editor.reqprefix" label="DHCPv6 前缀请求（auto / no / 0～64）"
                variant="outlined" density="comfortable"/>
            </template>
            <p v-else class="text-body-2 text-medium-emphasis">当前协议的 IPv6 高级参数请使用原生 LuCI 设置，以免覆盖 PPPoE、隧道等协议的专用选项。</p>
          </template>
          <template v-else>
            <v-alert type="info" variant="tonal" density="compact" class="mb-3">
              这里配置的是路由器向 LAN 设备分配地址的 DHCP 服务器，不是上级网络的 DHCP 客户端。
            </v-alert>
            <v-alert v-if="!dhcpEditable" type="warning" variant="tonal" density="compact">
              只有非 WAN 的静态地址接口才能在这里启用 DHCP 服务端。
            </v-alert>
            <v-alert v-else-if="!hasDhcpConfig" type="warning" variant="tonal" density="compact">
              未取得 /etc/config/dhcp 读取权限，因此禁用 DHCP 服务端修改。
            </v-alert>
            <template v-else>
              <v-switch v-model="editor.dhcpEnabled" label="启用 DHCPv4 地址分配服务"
                color="primary" inset hide-details class="mb-3"/>
              <v-text-field v-model.trim="editor.dhcpStart" type="number" label="地址池起始偏移（例如 100）"
                variant="outlined" density="comfortable"/>
              <v-text-field v-model.trim="editor.dhcpLimit" type="number" label="地址池可分配数量（例如 150）"
                variant="outlined" density="comfortable"/>
              <v-text-field v-model.trim="editor.dhcpLease" label="租期（12h / 1d / 30m）"
                variant="outlined" density="comfortable"/>
              <v-select v-model="editor.dhcpv6Mode" label="DHCPv6 服务模式"
                :items="optionItems(modeOptions)" variant="outlined" density="comfortable"/>
              <v-select v-model="editor.raMode" label="IPv6 RA 通告模式"
                :items="optionItems(modeOptions)" variant="outlined" density="comfortable"/>
              <p class="text-caption text-medium-emphasis">地址池起始偏移与数量会按本接口的 IPv4 掩码验证；VLAN、桥接、DHCP 高级选项请到 LuCI 配置。</p>
            </template>
          </template>
          <v-alert type="warning" variant="tonal" density="compact" class="mt-3">
            应用网络配置可能暂时中断连接。提交后须在 {{ NETWORK_APPLY_TIMEOUT }} 秒内确认；否则由 OpenWrt 自动回滚。
            不要在远程维护时随意修改 LAN IP、WAN 协议或关闭接口。
          </v-alert>
          <v-alert v-if="pending" type="warning" variant="tonal" class="mt-3">
            {{ pendingPrompt }}
          </v-alert>
          <v-alert v-if="applyingUnknown" type="warning" variant="tonal" density="compact" class="mt-3">
            RPC 未确认应用结果，请检查网络后等待自动回滚，暂勿再次提交。
          </v-alert>
        </v-card-text>
        <v-divider/>
        <v-card-actions class="d-flex flex-wrap ga-2 pa-3">
          <v-btn v-if="!pending" variant="text" :disabled="busy" @click="closeEditor">取消</v-btn>
          <v-spacer/>
          <template v-if="pending">
            <v-btn variant="outlined" :disabled="busy" @click="rollbackChanges">立即回滚</v-btn>
            <v-btn color="success" :loading="busy" @click="confirmChanges">确认保留配置</v-btn>
          </template>
          <v-btn v-else color="primary" :loading="busy" :disabled="applyingUnknown"
            @click="saveAndApply">保存并应用（可回滚）</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(runtimeTarget)" max-width="420"
      @update:model-value="!$event && (runtimeTarget = null)">
      <v-card rounded="xl">
        <v-card-title>确认{{ runtimeTarget?.action === 'up' ? '连接' : '断开' }}网络接口？</v-card-title>
        <v-card-text>
          即将向 netifd 提交 {{ runtimeTarget?.name }} 接口的运行操作。
          <template v-if="runtimeTarget?.action === 'down'">断开会立即中断此接口的网络连接，且不会自动恢复。</template>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" @click="runtimeTarget = null">取消</v-btn>
          <v-btn color="warning" :loading="busy" @click="performRuntime">确认执行</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.network-interface-form{max-height:min(62vh,570px);overflow-y:auto;overscroll-behavior:contain}
.network-interface-editor :deep(.v-card-title){white-space:normal;word-break:break-word;font-size:17px}
.network-interface-editor :deep(.v-card-subtitle){white-space:normal}
</style>
