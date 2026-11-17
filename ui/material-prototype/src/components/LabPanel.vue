<script setup>
import { computed, ref, watch } from 'vue'
const props = defineProps({
  settings: { type:Object, required:true },
  intervals: { type:Object, required:true },
  cards: { type:Array, required:true },
  router: { type:Object, default:null },
  rpcRecords: { type:Array, default:()=>[] },
  alternate: { type:Object, default:null },
  activeAddress: { type:String, default:'' },
  smartBusy: { type:Boolean, default:false },
  smartMessage: { type:String, default:'' },
  globalMessage: { type:String, default:'' },
  rpcMessage: { type:String, default:'' },
  healthRows: { type:Array, default:()=>[] },
  deepRows: { type:Array, default:()=>[] },
  healthBusy: { type:Boolean, default:false }
})
const emit = defineEmits([
  'set-profile','set-interval','toggle-cards','toggle-card','move-card','reset-cards',
  'toggle-rpc','clear-rpc','copy-rpc','toggle-smart','pair-alternate','remove-alternate',
  'switch-route','toggle-health','check-health','reset-all'
])
const alternateInput = ref('')
const resetConfirmation = ref(false)
watch(()=>props.router?.id,()=>{ alternateInput.value = '' })
const presets = [
  {label:'省电',value:'saver'},{label:'均衡',value:'balanced'},
  {label:'实时',value:'realtime'},{label:'自定义',value:'custom'}
]
const intervalFields = [
  {key:'overview',name:'概览刷新',options:[5000,6000,10000,12000,15000,20000,30000,60000,120000]},
  {key:'telemetry',name:'实时网络采样',options:[1500,2000,3000,5000,8000,10000,15000,30000]},
  {key:'devices',name:'路由器可达性检测',options:[10000,15000,20000,30000,45000,60000,120000]}
]
const latestRpc = computed(()=>[...props.rpcRecords].reverse().slice(0,25))
const isAlternate = computed(()=>Boolean(props.alternate?.address && props.activeAddress === props.alternate.address))
const healthColor = state=>state==='ok'?'success':state==='fail'?'error':state==='warn'?'warning':'secondary'
const rpcColor = result=>result==='success'?'success':result==='error'?'error':'warning'
</script>

<template>
  <div class="lab-page">
    <div class="lab-introduction">
      <v-avatar rounded="lg" color="primary" variant="tonal" size="48"><v-icon icon="mdi-flask-outline" size="28"/></v-avatar>
      <div><h2>实验室</h2><p>试用高级能力。开关仅保存在本机，不修改路由器系统设置。</p></div>
    </div>
    <div class="lab-reset-bar">
      <span>出现异常时，可一键撤销全部实验设置</span>
      <v-btn size="small" variant="outlined" color="primary" prepend-icon="mdi-restore"
        :disabled="smartBusy || healthBusy"
        @click="resetConfirmation = true">恢复默认值</v-btn>
    </div>
    <p v-if="globalMessage" class="lab-reset-notice" role="status">{{ globalMessage }}</p>
    <v-dialog v-model="resetConfirmation" max-width="430">
      <v-card rounded="xl" class="pa-4" title="恢复实验室默认值？">
        <v-card-text class="lab-reset-dialog-text">
          将刷新间隔恢复为均衡模式（概览 12 秒、流量 3 秒、设备 15 秒），
          恢复所有已保存路由器的六张概览卡片及默认顺序，
          关闭 RPC 调试、智能连接切换与健康检测，
          清空本次 RPC 日志，并删除所有路由器的备用入口配对。
          不影响已保存的路由器账号或路由器配置；当前连接不会被强制中断。
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" @click="resetConfirmation = false">取消</v-btn>
          <v-btn color="primary" variant="flat"
            @click="resetConfirmation = false; emit('reset-all')">确认恢复</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-card rounded="xl" elevation="1" class="settings-option-card lab-option">
      <div class="settings-option-heading">
        <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-refresh-auto" size="23"/></v-avatar>
        <div><h2>自定义刷新策略</h2><p>按设备性能和使用场景调整请求频率；切换后立即生效。</p></div>
      </div>
      <v-btn-toggle :model-value="settings.profile" mandatory divided color="primary" variant="outlined" density="comfortable"
        class="lab-profile-toggle" aria-label="实验室刷新策略" @update:model-value="emit('set-profile', $event)">
        <v-btn v-for="entry in presets" :key="entry.value" :value="entry.value" size="small">{{ entry.label }}</v-btn>
      </v-btn-toggle>
      <div class="lab-rate-summary">
        <div v-for="entry in intervalFields" :key="entry.key">
          <span>{{ entry.name }}</span><strong>{{ (intervals[entry.key] / 1000).toLocaleString() }} 秒</strong>
        </div>
      </div>
      <div v-if="settings.profile === 'custom'" class="lab-custom-intervals">
        <v-select v-for="field in intervalFields" :key="field.key" :label="field.name"
          density="comfortable" variant="outlined" hide-details="auto"
          :model-value="settings.custom[field.key]"
          :items="field.options.map(value => ({ title: value/1000 + ' 秒', value }))"
          @update:model-value="emit('set-interval', { key:field.key, value:$event })"/>
      </div>
      <p class="lab-note">省电：30/8/30 秒；均衡：12/3/15 秒；实时：6/2/10 秒（依次为概览、采样、设备）。暂停后台无意义的采样，不设置低于安全下限的间隔。</p>
    </v-card>

    <v-card rounded="xl" elevation="1" class="settings-option-card lab-option">
      <div class="settings-option-heading">
        <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-view-dashboard-edit-outline" size="23"/></v-avatar>
        <div><h2>自定义概览卡片</h2><p>排序、显示或隐藏六项实时指标；不同路由器分别保存。</p></div>
      </div>
      <div class="lab-main-switch">
        <span>启用自定义概览</span>
        <v-switch :model-value="settings.cardsEnabled" color="primary" inset hide-details density="compact"
          aria-label="启用自定义概览" @update:model-value="emit('toggle-cards', $event)"/>
      </div>
      <template v-if="settings.cardsEnabled">
        <p v-if="!router" class="lab-note">请先连接并选择一台路由器后配置。</p>
        <div v-else class="lab-card-list">
          <div v-for="(item,index) in cards" :key="item.id" class="lab-card-row">
            <v-checkbox-btn :model-value="item.visible" color="primary"
              :aria-label="'显示'+item.id" @update:model-value="emit('toggle-card',item.id)"/>
            <span :class="{ 'lab-card-hidden': !item.visible }">{{ item.id }}</span>
            <v-spacer/>
            <v-btn icon="mdi-chevron-up" size="x-small" variant="text" :disabled="index===0"
              :aria-label="'上移'+item.id" @click="emit('move-card',{ id:item.id, direction:-1 })"/>
            <v-btn icon="mdi-chevron-down" size="x-small" variant="text" :disabled="index===cards.length-1"
              :aria-label="'下移'+item.id" @click="emit('move-card',{ id:item.id, direction:1 })"/>
          </div>
        </div>
        <div class="lab-actions"><v-btn variant="tonal" color="primary" size="small" prepend-icon="mdi-restore"
          :disabled="!router" @click="emit('reset-cards')">恢复六张默认卡片</v-btn></div>
      </template>
    </v-card>

    <v-card rounded="xl" elevation="1" class="settings-option-card lab-option">
      <div class="settings-option-heading">
        <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-code-json" size="23"/></v-avatar>
        <div><h2>RPC 调试模式</h2><p>记录接口名、执行时长、结果状态，用于排查 API 兼容与延迟问题。</p></div>
      </div>
      <div class="lab-main-switch"><span>记录本次运行的 RPC</span>
        <v-switch :model-value="settings.rpcDebug" color="primary" inset hide-details density="compact"
          aria-label="记录 RPC 调试日志" @update:model-value="emit('toggle-rpc', $event)"/>
      </div>
      <template v-if="settings.rpcDebug">
        <div class="lab-actions">
          <v-btn size="small" variant="tonal" prepend-icon="mdi-content-copy" @click="emit('copy-rpc')">复制脱敏日志</v-btn>
          <v-btn size="small" variant="text" prepend-icon="mdi-delete-outline" @click="emit('clear-rpc')">清空</v-btn>
        </div>
        <p v-if="rpcMessage" class="lab-note" role="status">{{ rpcMessage }}</p>
        <div v-if="latestRpc.length" class="lab-rpc-log" role="log" aria-label="RPC 请求诊断记录">
          <div v-for="(item,index) in latestRpc" :key="index" class="lab-rpc-row">
            <div><strong>{{ item.object }}.{{ item.method }}</strong><small>{{ item.at.slice(11,19) }}</small></div>
            <span>{{ item.ms }} ms</span>
            <v-chip size="x-small" variant="tonal" :color="rpcColor(item.status)">{{ item.status }}</v-chip>
          </div>
        </div>
        <p v-else class="lab-note">暂无请求记录，刷新任意路由器页面即可采集。</p>
      </template>
      <p class="lab-note">最多保留 80 条内存记录，关闭后立即清空；不保存 URL、请求体、响应体、密码、会话令牌。</p>
    </v-card>

    <v-card rounded="xl" elevation="1" class="settings-option-card lab-option">
      <div class="settings-option-heading">
        <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-lan-connect" size="23"/></v-avatar>
        <div><h2>智能连接切换</h2><p>为同一台路由器配对备用访问入口，当前连接失败时尝试切换。</p></div>
      </div>
      <div class="lab-main-switch"><span>启用已配对入口自动切换</span>
        <v-switch :model-value="settings.smartSwitch" color="primary" inset hide-details density="compact"
          aria-label="启用智能连接切换" @update:model-value="emit('toggle-smart', $event)"/>
      </div>
      <div v-if="settings.smartSwitch">
        <div v-if="router && activeAddress" class="lab-detail-line"><span>当前入口</span><strong>{{ activeAddress }}</strong></div>
        <div v-if="alternate" class="lab-detail-line"><span>已验证备用入口</span><strong>{{ alternate.address }}</strong></div>
        <v-text-field v-model="alternateInput" class="mt-3" density="comfortable" variant="outlined" hide-details="auto"
          label="备用访问地址" placeholder="https://router.example.com" autocapitalize="off"
          :disabled="!router || smartBusy"/>
        <div class="lab-actions mt-3">
          <v-btn color="primary" size="small" variant="tonal" prepend-icon="mdi-shield-check-outline"
            :loading="smartBusy" :disabled="!router || !activeAddress || !alternateInput.trim()"
            @click="emit('pair-alternate',alternateInput)">验证并配对</v-btn>
          <v-btn v-if="alternate" variant="outlined" size="small" prepend-icon="mdi-swap-horizontal"
            :loading="smartBusy" :disabled="!router" @click="emit('switch-route')">{{ isAlternate ? '切回主入口' : '切换至备用入口' }}</v-btn>
          <v-btn v-if="alternate" variant="text" size="small" color="warning"
            :disabled="smartBusy" @click="emit('remove-alternate')">解除配对</v-btn>
        </div>
        <p v-if="smartMessage" class="lab-note" role="status">{{ smartMessage }}</p>
        <p class="lab-note">只支持可信 HTTPS 或私有 IPv4 HTTP 地址。配对会将当前短期 RPC 会话发送到你明确填写的备用入口，并核验设备硬件身份；请确保地址由你控制。验证失败不会切换；初次登录仍使用主入口。</p>
      </div>
    </v-card>

    <v-card rounded="xl" elevation="1" class="settings-option-card lab-option">
      <div class="settings-option-heading">
        <v-avatar color="primary" variant="tonal" rounded="lg"><v-icon icon="mdi-heart-pulse" size="23"/></v-avatar>
        <div><h2>高级网络健康检测</h2><p>聚合 WAN/WAN6、网关、DNS、联网监测与按需 Ping 的检测结果。</p></div>
      </div>
      <div class="lab-main-switch"><span>开启健康诊断面板</span>
        <v-switch :model-value="settings.healthEnabled" color="primary" inset hide-details density="compact"
          aria-label="开启高级网络健康检测" @update:model-value="emit('toggle-health', $event)"/>
      </div>
      <template v-if="settings.healthEnabled">
        <p v-if="!router || !healthRows.length" class="lab-note">连接路由器并读取到网络状态后显示检测项。</p>
        <div v-else class="lab-health-list">
          <div v-for="check in healthRows" :key="check.label" class="lab-health-row">
            <div><strong>{{ check.label }}</strong><small>{{ check.value }}</small></div>
            <v-icon :icon="check.status==='ok'?'mdi-check-circle-outline':check.status==='fail'?'mdi-alert-circle-outline':check.status==='warn'?'mdi-alert-outline':'mdi-help-circle-outline'"
              :color="healthColor(check.status)" size="19"/>
          </div>
        </div>
        <div class="lab-actions mt-3">
          <v-btn color="primary" variant="tonal" size="small" prepend-icon="mdi-radar"
            :loading="healthBusy" :disabled="!router || !activeAddress" @click="emit('check-health')">运行深度检测</v-btn>
        </div>
        <div v-if="deepRows.length" class="lab-health-list mt-2">
          <div v-for="check in deepRows" :key="check.label" class="lab-health-row">
            <div><strong>{{ check.label }}</strong><small>{{ check.value }}</small></div>
            <v-icon :icon="check.status==='ok'?'mdi-check-circle-outline':'mdi-information-outline'"
              :color="healthColor(check.status)" size="19"/>
          </div>
        </div>
        <p class="lab-note">深度检测仅在点击后使用路由器的 /bin/ping 对已配置网关和 DNS 进行最多三次探测；若 RPC 权限受限，明确显示未知，不推测丢包率。</p>
      </template>
    </v-card>
  </div>
</template>

<style scoped>
.lab-page{display:flex;flex-direction:column;gap:14px;padding-bottom:24px}
.lab-introduction{display:flex;align-items:center;gap:13px;padding:12px 3px 5px}
.lab-reset-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:rgba(var(--v-theme-primary),.055);border:1px solid rgba(var(--v-theme-primary),.1);border-radius:13px;font-size:11px;color:var(--ui-text-muted)}
.lab-reset-bar :deep(.v-btn){flex:none;letter-spacing:0}
.lab-reset-notice{margin:0;padding:8px 10px;font-size:12px;line-height:1.6;color:rgb(var(--v-theme-primary))}
.lab-reset-dialog-text{font-size:13px;line-height:1.8}
.lab-introduction h2{font-size:18px;line-height:26px;font-weight:750}
.lab-introduction p{font-size:12px;line-height:1.6;color:var(--ui-text-muted);margin-top:3px}
.lab-option{padding:17px}
.lab-profile-toggle{display:flex;width:100%;margin-top:12px}
.lab-profile-toggle :deep(.v-btn){flex:1 1 0;min-width:0;padding:0 6px;font-size:12px;letter-spacing:0}
.lab-rate-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:13px}
.lab-rate-summary>div{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:10px 7px;background:rgba(var(--v-theme-primary),.055);border-radius:10px;min-width:0}
.lab-rate-summary span{font-size:10px;color:var(--ui-text-muted);line-height:1.5}
.lab-rate-summary strong{font-size:13px;color:rgb(var(--v-theme-primary));line-height:1.5}
.lab-custom-intervals{display:flex;flex-direction:column;gap:9px;margin-top:13px}
.lab-note{font-size:11px;line-height:1.7;color:var(--ui-text-muted);margin:12px 0 0}
.lab-main-switch{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:13px;font-size:13px;font-weight:650}
.lab-main-switch :deep(.v-switch){flex:none}
.lab-card-list{border:1px solid var(--ui-border);border-radius:13px;overflow:hidden;margin-top:12px}
.lab-card-row{display:flex;align-items:center;gap:5px;padding:4px 6px;min-height:44px;font-size:12px}
.lab-card-row+.lab-card-row{border-top:1px solid var(--ui-border)}
.lab-card-hidden{color:var(--ui-text-muted);text-decoration:line-through}
.lab-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.lab-actions :deep(.v-btn){letter-spacing:0;white-space:normal}
.lab-rpc-log{margin-top:12px;border:1px solid var(--ui-border);border-radius:10px;max-height:320px;overflow:auto}
.lab-rpc-row{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 10px;font-size:11px}
.lab-rpc-row+ .lab-rpc-row{border-top:1px solid var(--ui-border)}
.lab-rpc-row>div{display:flex;flex-direction:column;min-width:0;gap:2px}
.lab-rpc-row strong{overflow-wrap:anywhere;font-size:11px}
.lab-rpc-row small{color:var(--ui-text-muted)}
.lab-rpc-row>span{white-space:nowrap;font-variant-numeric:tabular-nums}
.lab-detail-line{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-top:12px;font-size:12px}
.lab-detail-line span{color:var(--ui-text-muted);white-space:nowrap}
.lab-detail-line strong{font-size:11px;text-align:right;overflow-wrap:anywhere}
.lab-health-list{border:1px solid var(--ui-border);border-radius:12px;overflow:hidden;margin-top:12px}
.lab-health-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px}
.lab-health-row+.lab-health-row{border-top:1px solid var(--ui-border)}
.lab-health-row>div{display:flex;flex-direction:column;gap:3px;min-width:0}
.lab-health-row strong{font-size:12px;line-height:1.45}
.lab-health-row small{font-size:11px;line-height:1.5;color:var(--ui-text-muted);overflow-wrap:anywhere}
</style>
