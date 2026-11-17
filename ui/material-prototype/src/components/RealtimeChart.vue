<script setup>
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { useTheme } from 'vuetify'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps({
  series: { type: Array, default: () => [] },
  samples: { type: Array, default: () => [] },
  unit: { type: String, default: '' },
  title: { type: String, default: '实时曲线' },
  // Design A overview uses a sparkline; detailed monitoring keeps axes/legend.
  compact: { type: Boolean, default: false }
})
const root = ref(null)
const theme = useTheme()
const motionEnabled = inject('xxwrt-motion-enabled', ref(true))
let chart = null
let observer = null

function render() {
  if (!chart || !root.value) return
  // Use the same Design A palette as the surrounding Vuetify surfaces.
  // Hardcoded light-only line colors become unreadable in the dark theme.
  const palette = theme.current.value.colors
  const timeLabels = props.samples.map(p => p.time || '')
  const series = props.series.map((entry, i) => ({
    name: entry.title, type: 'line', smooth: true, showSymbol: false,
    connectNulls: false, symbol: 'circle', lineStyle: { width: 2 },
    areaStyle: { opacity: i === 0 ? 0.11 : 0.025 },
    data: props.samples.map(point => point[entry.key] ?? null)
  }))
  chart.setOption({
    animation: motionEnabled.value,
    animationDuration: motionEnabled.value ? 240 : 0,
    animationDurationUpdate: motionEnabled.value ? 180 : 0,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
    color: [palette.primary, palette.success, palette.secondary, palette.info],
    grid: props.compact
      ? { top: 8, bottom: 7, left: 2, right: 2, containLabel: false }
      : { top: 38, bottom: 30, left: 24, right: 6, containLabel: false },
    legend: props.compact ? { show: false }
      : { top: 2, icon: 'roundRect', itemWidth: 13,
          textStyle: { fontSize: 11, color: palette['on-surface-variant'] } },
    tooltip: { trigger: 'axis', confine: true,
      backgroundColor: palette.surface,
      borderColor: palette['on-surface-variant'],
      textStyle: { color: palette['on-surface'], fontSize: 12 },
      valueFormatter: n => {
      return n == null ? '--' : Number(n).toFixed(1) + props.unit
    }},
    xAxis: { type: 'category', data: timeLabels, boundaryGap: false,
      axisLabel: { show: !props.compact, fontSize: 10, interval: 'auto', color: palette['on-surface-variant'] },
      axisLine: { show: !props.compact, lineStyle: { color: palette['on-surface-variant'] } },
      axisTick: { show: !props.compact } },
    yAxis: { type: 'value', min: 0, scale: true, splitNumber: 3,
      axisLabel: { show: !props.compact, fontSize: 10, margin: 3, color: palette['on-surface-variant'] },
      axisLine: { show: !props.compact }, axisTick: { show: !props.compact },
      splitLine: { show: !props.compact, lineStyle: { color: palette['on-surface-variant'], opacity: .12 } } },
    series
  }, { replaceMerge: ['series'] })
}

onMounted(async () => {
  await nextTick()
  if (!root.value) return
  chart = echarts.init(root.value, null, { renderer: 'canvas' })
  render()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => chart?.resize())
    observer.observe(root.value)
  }
})
watch(() => [props.samples, props.series, props.unit, props.compact], render, { deep: true })
watch(motionEnabled, render)
watch(() => theme.global.name.value, render)
onUnmounted(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>
<template>
  <div ref="root" class="realtime-chart" :class="{ 'realtime-chart--compact': compact }" role="img" :aria-label="title + '（最近 ' + samples.length + ' 个采样点）'"/>
</template>
<style scoped>
 .realtime-chart{height:230px;width:calc(100% + 12px);margin-inline:-6px;min-width:0;touch-action:pan-y}
.realtime-chart--compact{height:142px;width:100%;margin-inline:0}
@media(max-width:390px){.realtime-chart{height:205px}.realtime-chart--compact{height:136px}}
</style>
