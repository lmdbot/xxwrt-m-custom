<script setup>
import { computed } from 'vue'
import { formatBytes } from '../services/router.js'

const props = defineProps({
  device: { type: Object, required: true },
  summary: { type: Object, default: null },
  status: { type: String, default: 'checking' },
  index: { type: Number, required: true },
  layout: { type: String, default: 'card' },
  showNames: { type: Boolean, default: true },
  showAddress: { type: Boolean, default: true }
})
const emit = defineEmits(['open', 'edit', 'remove'])

const displayName = computed(() => props.showNames ? props.device.name : '路由器 ' + (props.index + 1))
const displayAddress = computed(() => props.showAddress ? props.device.address : '•••.•••.•••.•••')
const connectionLabel = computed(() => ({
  online: '已登录 · 在线', reachable: '网络可达 · 待登录',
  offline: '无法连接', checking: '检测中'
})[props.status] || '检测中')
const connectionColor = computed(() =>
  props.status === 'online' ? 'success' :
  props.status === 'reachable' ? 'primary' :
  props.status === 'offline' ? 'error' : 'secondary')
const hasTelemetry = computed(() => props.status === 'online' && props.summary != null)
const percent = value => Number.isFinite(Number(value)) && value !== null
  ? Math.max(0, Math.min(100, Number(value))) : 0
const percentText = value => value == null ? '--' : Math.round(percent(value)) + '%'
const rate = value => Number.isFinite(Number(value)) && value != null
  ? formatBytes(Math.max(0, Number(value))) + '/s' : '--'
</script>

<template>
  <v-card class="saved-device-card router-list-card"
          :class="{ 'router-list-compact': layout === 'list' }"
          rounded="xl" elevation="1"
          tabindex="0" role="button"
          :aria-label="'进入 ' + displayName"
          @click="emit('open', device)" @keydown.enter.prevent="emit('open', device)">
    <div class="router-top">
      <v-avatar color="primary" variant="tonal" rounded="lg" :size="layout === 'list' ? 39 : 46" class="router-icon">
        <v-icon icon="mdi-router-wireless" :size="layout === 'list' ? 23 : 26"/>
      </v-avatar>
      <div class="router-main">
        <div class="router-name-row">
          <h2 class="router-name">{{ displayName }}</h2>
          <span v-if="hasTelemetry" class="router-uptime">{{ summary.uptime }}</span>
        </div>
        <div class="router-address">{{ displayAddress }}</div>
      </div>
      <v-icon icon="mdi-chevron-right" size="20" class="router-chevron"/>
    </div>

    <div class="router-meta-line">
      <v-chip size="x-small" variant="tonal" :color="connectionColor"
              :prepend-icon="status === 'online' ? 'mdi-check-circle' : status === 'offline' ? 'mdi-alert-circle-outline' : 'mdi-lan-connect'">
        {{ connectionLabel }}
      </v-chip>
      <div v-if="hasTelemetry" class="router-temp">
        <v-icon size="15" icon="mdi-thermometer"/>
        {{ summary.temperature || '--' }}
      </div>
    </div>

    <template v-if="hasTelemetry">
      <div class="router-model-line">
        {{ summary.model || 'OpenWrt' }} · {{ summary.version || '--' }}
      </div>
      <div class="router-stat-block">
        <div class="router-network-strip">
          <div class="router-stat-metric" aria-label="上传速率">
            <span class="router-metric-label"><v-icon icon="mdi-arrow-up" size="13"/> 上传</span>
            <strong>{{ rate(summary.txBps) }}</strong>
          </div>
          <div class="router-stat-metric" aria-label="下载速率">
            <span class="router-metric-label"><v-icon icon="mdi-arrow-down" size="13"/> 下载</span>
            <strong>{{ rate(summary.rxBps) }}</strong>
          </div>
          <div class="router-stat-metric">
            <span class="router-metric-label">连接数</span>
            <strong>{{ summary.connUsed ?? '--' }}</strong>
          </div>
          <div class="router-stat-metric">
            <span class="router-metric-label">终端</span>
            <strong>{{ summary.users ?? '--' }}</strong>
          </div>
        </div>
        <div class="router-utilization" v-if="layout === 'card'">
          <div class="router-meter">
            <div class="router-meter-heading">
              <span>CPU</span><strong>{{ percentText(summary.cpuPercent) }}</strong>
            </div>
            <v-progress-linear :model-value="percent(summary.cpuPercent)" height="4" rounded color="primary"/>
          </div>
          <div class="router-meter">
            <div class="router-meter-heading">
              <span>内存</span><strong>{{ percentText(summary.memoryPercent) }}</strong>
            </div>
            <v-progress-linear :model-value="percent(summary.memoryPercent)" height="4" rounded color="teal"/>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="router-no-stats">
      {{ status === 'reachable' ? '路由器可达，登录后显示详细状态' : status === 'offline' ? '路由器暂时无法连接' : '登录并刷新后显示实时指标' }}
    </div>

    <div v-if="layout === 'card'" class="router-footer">
      <span class="router-account">
        {{ showNames ? '用户：' + device.username : '用户名已隐藏' }}
        · {{ device.rememberPassword ? '凭据加密保存' : '每次验证' }}
      </span>
      <div class="router-actions">
        <v-btn icon="mdi-pencil-outline" size="small" variant="text"
               :aria-label="'编辑' + displayName" @click.stop="emit('edit', device)"/>
        <v-btn icon="mdi-delete-outline" size="small" color="error" variant="text"
               :aria-label="'删除' + displayName" @click.stop="emit('remove', device)"/>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.router-list-card{padding:15px!important;min-width:0;overflow:hidden}
.router-top{display:flex;align-items:center;gap:11px;min-width:0}
.router-icon{flex:none}
.router-main{min-width:0;flex:1}
.router-name-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;min-width:0}
.router-name{font-size:16px;font-weight:680;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.router-uptime{font-size:10px;opacity:.6;white-space:nowrap;flex:none}
.router-address{font-size:12px;opacity:.61;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.router-chevron{opacity:.45;flex:none}
.router-meta-line{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:13px}
.router-temp{display:flex;align-items:center;gap:3px;font-weight:650;font-size:12px;white-space:nowrap}
.router-model-line{font-size:11px;opacity:.65;margin-top:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.router-stat-block{border-radius:13px;background:rgba(104,123,178,.055);padding:11px;margin-top:12px}
.router-network-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.router-stat-metric{min-width:0;display:flex;flex-direction:column;gap:5px}
.router-metric-label{font-size:10px;opacity:.65;display:flex;align-items:center;gap:1px}
.router-stat-metric strong{font-size:12px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.router-utilization{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:13px}
.router-meter{min-width:0}
.router-meter-heading{display:flex;justify-content:space-between;gap:8px;font-size:11px;margin-bottom:6px}
.router-meter-heading span{opacity:.7}
.router-no-stats{font-size:11px;opacity:.62;margin-top:12px;line-height:1.5}
.router-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(120,135,160,.13)}
.router-account{font-size:10px;opacity:.61;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.router-actions{display:flex;flex:none}
.router-actions .v-btn{width:32px!important;height:32px!important}
.router-list-compact{padding:12px 14px!important}
.router-list-compact .router-meta-line{margin-top:8px}
.router-list-compact .router-model-line{margin-top:5px}
.router-list-compact .router-stat-block{padding:9px 10px;margin-top:9px}
@media(max-width:400px){.router-stat-metric strong{font-size:11px}.router-list-card{padding:12px!important}.router-uptime{font-size:9px}}
</style>
