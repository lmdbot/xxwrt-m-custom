<script setup>
import { computed } from 'vue'
import { deviceTypeIcon } from '../services/deviceIdentity.js'
import { formatTerminalConnectionLabel } from '../services/xiaomiClientData.js'

const props = defineProps({
  item: { type: Object, required: true },
  showAddress: { type: Boolean, default: true }
})
const emit = defineEmits(['click'])
const brand = computed(() => props.item.identity?.brand || null)
const brandStyle = computed(() => {
  const value = brand.value
  if (!value) return {}
  return {
    '--brand-bg': value.bg || 'rgba(var(--v-theme-primary),.12)',
    '--brand-fg': value.fg || '#fff'
  }
})
const typeIcon = computed(() => deviceTypeIcon(props.item.identity?.type))
const onlineState = computed(() => {
  if (props.item.online === true) return 'online'
  return props.item.onlineKnown === false ? 'unknown' : 'offline'
})
const onlineTitle = computed(() => ({
  online: '在线', offline: '离线', unknown: '状态未知'
}[onlineState.value]))
const connectionLabel = computed(() => formatTerminalConnectionLabel(props.item))
const sourceLabels = computed(() => {
  const labels = []
  if (props.item.sources?.includes('dhcp4')) labels.push('DHCPv4')
  if (props.item.sources?.includes('dhcp6')) labels.push('DHCPv6')
  if (props.item.sources?.includes('wireless') && !connectionLabel.value) labels.push('无线')
  if (props.item.sources?.includes('oaf')) labels.push('应用用户')
  return labels
})
const title = computed(() => '查看终端 ' + (props.item.displayName || props.item.name || '未知设备'))
</script>

<template>
  <v-card
    role="listitem"
    rounded="lg"
    variant="outlined"
    class="terminal-tile"
    tabindex="0"
    :aria-label="title + '，' + onlineTitle + (connectionLabel ? '，' + connectionLabel : '')"
    @click="emit('click')"
    @keydown.enter.prevent="emit('click')"
  >
    <div
      class="terminal-identity"
      :class="{
        'terminal-identity--brand': !!brand,
        'terminal-identity--inverse': !!brand?.inv
      }"
      :style="brandStyle"
      :title="brand?.n || item.kind || '未知设备类型'"
      aria-hidden="true"
    >
      <svg v-if="brand?.p" viewBox="0 0 24 24">
        <path :d="brand.p"/>
      </svg>
      <v-icon v-else :icon="typeIcon" size="23"/>
    </div>
    <div class="terminal-meta">
      <div class="terminal-heading">
        <div class="terminal-name-line">
          <span class="terminal-online-dot" :class="'is-' + onlineState"
            :title="onlineTitle" :aria-label="onlineTitle" role="img"/>
          <div class="terminal-name">{{ item.displayName || item.name || '未知设备' }}</div>
        </div>
      </div>
      <div v-if="item.kind" class="terminal-kind">{{ item.kind }}</div>
      <div v-if="(showAddress && (item.ip || item.ip6)) || item.mac" class="terminal-address-line">
        <span v-if="showAddress && (item.ip || item.ip6)" class="terminal-ip terminal-ip6">{{ item.ip || item.ip6 }}</span>
        <span v-if="item.mac" class="terminal-mac">{{ item.mac }}</span>
      </div>
      <div v-if="sourceLabels.length || item.privateMac || connectionLabel || (item.wifi && item.online && item.wifi.signal != null)"
        class="terminal-tags">
        <v-chip v-if="connectionLabel" size="x-small" variant="tonal"
          :color="item.connectionType === 'wireless' ? 'primary' : 'secondary'"
          :prepend-icon="item.connectionType === 'wireless' ? 'mdi-wifi' : 'mdi-ethernet'"
          class="terminal-tag terminal-tag--connection"
          :title="item.connectionSource === 'xiaomi' ? '小米路由器记录的当前或历史连接类型；曾接入不代表当前在线' : '连接方式：' + connectionLabel">{{ connectionLabel }}</v-chip>
        <v-chip v-if="sourceLabels.length" size="x-small" variant="tonal" color="primary"
          class="terminal-tag terminal-main-source">{{ sourceLabels[0] }}</v-chip>
        <v-chip v-if="item.privateMac" size="x-small" variant="tonal"
          class="terminal-tag terminal-tag--private"
          title="随机/私有 MAC，无法通过 MAC 前缀可靠识别厂商">随机 MAC</v-chip>
        <v-chip v-for="source in sourceLabels.slice(1)" :key="source" size="x-small"
          variant="tonal" color="secondary" class="terminal-tag">{{ source }}</v-chip>
        <v-chip v-if="item.wifi && item.online && item.wifi.signal != null"
          size="x-small" variant="tonal" class="terminal-tag terminal-tag--wifi"
          :title="'无线信号 ' + item.wifi.signal + ' dBm'">Wi-Fi {{ item.wifi.signal }} dBm</v-chip>
      </div>
    </div>
    <div class="terminal-trailing">
      <span v-if="onlineState !== 'unknown'" class="v3-client-state"
        :class="'is-' + onlineState">{{ onlineTitle }}</span>
      <v-icon icon="mdi-chevron-right" size="19" color="secondary" aria-hidden="true"/>
    </div>
  </v-card>
</template>
