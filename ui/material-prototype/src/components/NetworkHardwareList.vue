<script setup>
import { computed } from 'vue'

const props = defineProps({
  wired: { type: Array, default: () => [] },
  wireless: { type: Array, default: () => [] }
})
const upCount = computed(() => [...props.wired, ...props.wireless].filter(n => n.up).length)
function formatBytes(raw) {
  if (raw == null || raw === '') return '--'
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return '--'
  if (n < 1024) return n.toFixed(0) + ' B'
  const scales = ['KB', 'MB', 'GB', 'TB', 'PB']
  const magnitude = Math.min(Math.floor(Math.log(n) / Math.log(1024)), scales.length)
  return (n / 1024 ** magnitude).toFixed(magnitude >= 3 ? 2 : 1) + ' ' + scales[magnitude - 1]
}
</script>

<template>
  <section class="hardware-list" aria-label="网络硬件设备">
    <div class="hardware-heading">
      <div>
        <h2>网络硬件设备</h2>
        <p>点击设备可查看详细参数</p>
      </div>
      <v-chip size="small" variant="tonal" color="success">{{ upCount }} / {{ wired.length + wireless.length }} 在线</v-chip>
    </div>

    <div v-if="wired.length" class="hardware-group">
      <div class="hardware-group-title">
        <v-icon icon="mdi-ethernet" size="17"/>
        <span>有线接口</span>
        <span class="hardware-group-count">{{ wired.length }}</span>
      </div>
      <v-expansion-panels variant="accordion" class="hardware-panels">
        <v-expansion-panel v-for="nic in wired" :key="'wired-'+nic.name" class="hardware-panel" elevation="0">
          <v-expansion-panel-title class="hardware-panel-title">
            <v-avatar size="35" rounded="lg" color="primary" variant="tonal" class="hardware-avatar">
              <v-icon icon="mdi-ethernet" size="18"/>
            </v-avatar>
            <div class="hardware-main">
              <div class="hardware-name">{{ nic.name }}</div>
              <div class="hardware-sub">{{ nic.type && nic.type !== '--' ? nic.type + ' · ' : '' }}{{ nic.mac || '--' }}</div>
            </div>
            <v-chip size="x-small" variant="tonal" :color="nic.up ? 'success' : 'secondary'" class="hardware-state-chip">
              {{ nic.up ? '在线' : '未连接' }}
            </v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="hardware-specs">
              <div><span>MAC</span><strong>{{ nic.mac || '--' }}</strong></div>
              <div><span>类型</span><strong>{{ nic.type || '--' }}</strong></div>
              <div v-if="nic.mtu"><span>MTU</span><strong>{{ nic.mtu }}</strong></div>
              <div v-if="nic.ports?.length"><span>网桥端口</span><strong>{{ nic.ports.join(', ') }}</strong></div>
              <div v-if="nic.rxBytes !== null"><span>累计接收</span><strong>{{ formatBytes(nic.rxBytes) }}</strong></div>
              <div v-if="nic.txBytes !== null"><span>累计发送</span><strong>{{ formatBytes(nic.txBytes) }}</strong></div>
              <div v-if="nic.rxPackets !== null"><span>接收包数</span><strong>{{ nic.rxPackets }}</strong></div>
              <div v-if="nic.txPackets !== null"><span>发送包数</span><strong>{{ nic.txPackets }}</strong></div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

    <div v-if="wireless.length" class="hardware-group">
      <div class="hardware-group-title">
        <v-icon icon="mdi-wifi" size="17"/>
        <span>无线接口</span>
        <span class="hardware-group-count">{{ wireless.length }}</span>
      </div>
      <v-expansion-panels variant="accordion" class="hardware-panels">
        <v-expansion-panel v-for="nic in wireless" :key="'wifi-'+nic.name" class="hardware-panel" elevation="0">
          <v-expansion-panel-title class="hardware-panel-title">
            <v-avatar size="35" rounded="lg" color="primary" variant="tonal" class="hardware-avatar">
              <v-icon icon="mdi-wifi" size="18"/>
            </v-avatar>
            <div class="hardware-main">
              <div class="hardware-name">{{ nic.ssid || nic.name }}</div>
              <div class="hardware-sub">{{ nic.name }}{{ nic.band ? ' · ' + nic.band : '' }}</div>
            </div>
            <v-chip size="x-small" variant="tonal" :color="nic.up ? 'success' : 'secondary'" class="hardware-state-chip">
              {{ nic.up ? '在线' : '未连接' }}
            </v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="hardware-specs">
              <div><span>接口</span><strong>{{ nic.name }}</strong></div>
              <div><span>MAC / BSSID</span><strong>{{ nic.bssid || nic.mac || '--' }}</strong></div>
              <div v-if="nic.ssid"><span>SSID</span><strong>{{ nic.ssid }}</strong></div>
              <div v-if="nic.mode"><span>模式</span><strong>{{ nic.mode }}</strong></div>
              <div v-if="nic.band"><span>频段</span><strong>{{ nic.band }}</strong></div>
              <div v-if="nic.channel"><span>信道</span><strong>{{ nic.channel }}</strong></div>
              <div v-if="nic.speed"><span>速率</span><strong>{{ nic.speed }}</strong></div>
              <div v-if="nic.encryption"><span>加密</span><strong>{{ typeof nic.encryption === 'string' ? nic.encryption : '已加密' }}</strong></div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>
  </section>
</template>

<style scoped>
.hardware-list{width:100%;min-width:0}
.hardware-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}
.hardware-heading h2{font-size:16px;font-weight:650;margin:0}
.hardware-heading p{margin-top:4px;font-size:11px;opacity:.6}
.hardware-heading .v-chip{flex:none}
.hardware-group{margin-top:17px}
.hardware-group-title{display:flex;align-items:center;gap:8px;margin-bottom:9px;font-size:12px;font-weight:650;opacity:.78}
.hardware-group-count{border-radius:8px;background:rgba(115,140,183,.1);padding:1px 7px;font-size:10px}
.hardware-panels{gap:8px;display:flex;flex-direction:column}
.hardware-panel{border-radius:13px!important;border:1px solid rgba(119,138,163,.2)!important;background:rgb(var(--v-theme-surface));overflow:hidden}
.hardware-panel:before{box-shadow:none!important}
.hardware-panel-title{min-height:65px!important;padding:11px 12px!important;gap:10px}
.hardware-panel-title :deep(.v-expansion-panel-title__overlay){opacity:0}
.hardware-panel-title :deep(.v-expansion-panel-title__icon){margin-inline-start:4px!important}
.hardware-avatar{flex:none}
.hardware-main{min-width:0;flex:1}
.hardware-name{font-size:14px;font-weight:650;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hardware-sub{font-size:11px;opacity:.55;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hardware-state-chip{flex:none;max-width:68px;font-size:10px!important;margin-left:3px}
.hardware-panel :deep(.v-expansion-panel-text__wrapper){padding:0 12px 14px!important}
.hardware-specs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:12px;row-gap:11px;padding:13px 5px 0;border-top:1px solid rgba(120,135,160,.15)}
.hardware-specs>div{display:flex;flex-direction:column;gap:4px;min-width:0}
.hardware-specs span{font-size:10px;opacity:.62}
.hardware-specs strong{font-size:12px;line-height:1.5;font-weight:600;overflow-wrap:anywhere}
@media(max-width:370px){.hardware-panel-title{gap:7px;padding:9px!important}.hardware-state-chip{font-size:9px!important}.hardware-avatar{width:31px!important;height:31px!important}}
</style>
