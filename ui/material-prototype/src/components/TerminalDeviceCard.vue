<script setup>
import { computed } from 'vue'
import { deviceTypeIcon } from '../services/deviceIdentity.js'

const props = defineProps({
  item: { type: Object, required: true }
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
const sourceLabels = computed(() => {
  const labels = []
  if (props.item.sources?.includes('dhcp4')) labels.push('DHCPv4')
  if (props.item.sources?.includes('dhcp6')) labels.push('DHCPv6')
  if (props.item.sources?.includes('wireless')) labels.push('无线')
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
    :aria-label="title"
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
      <div class="terminal-name">{{ item.displayName || item.name || '未知设备' }}</div>
      <div v-if="item.kind" class="terminal-kind">{{ item.kind }}</div>
      <div v-if="item.ip || item.ip6" class="terminal-ip terminal-ip6">
        {{ item.ip || item.ip6 }}
      </div>
      <div v-if="item.mac" class="terminal-mac">{{ item.mac }}</div>
      <div class="terminal-tags">
        <v-chip
          v-for="source in sourceLabels"
          :key="source"
          size="x-small"
          variant="tonal"
          color="secondary"
          class="terminal-tag"
        >{{ source }}</v-chip>
        <v-chip
          v-if="item.wifi"
          size="x-small"
          variant="tonal"
          class="terminal-tag terminal-tag--wifi"
          :title="'无线信号 ' + (item.wifi.signal ?? '--') + ' dBm'"
        >Wi-Fi {{ item.wifi.signal == null ? '' : item.wifi.signal + ' dBm' }}</v-chip>
        <v-chip
          v-if="item.privateMac"
          size="x-small"
          variant="tonal"
          class="terminal-tag terminal-tag--private"
          title="随机/私有 MAC，无法通过 MAC 前缀可靠识别厂商"
        >随机 MAC</v-chip>
      </div>
    </div>
    <div class="terminal-trailing">
      <v-icon icon="mdi-chevron-right" size="19" color="secondary"/>
    </div>
  </v-card>
</template>
