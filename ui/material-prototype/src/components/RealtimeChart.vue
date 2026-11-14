<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps({
  series: { type: Array, default: () => [] },
  samples: { type: Array, default: () => [] },
  unit: { type: String, default: '' },
  title: { type: String, default: '实时曲线' }
})
const root = ref(null)
let chart = null
let observer = null

function render() {
  if (!chart || !root.value) return
  const timeLabels = props.samples.map(p => p.time || '')
  const series = props.series.map((entry, i) => ({
    name: entry.title, type: 'line', smooth: true, showSymbol: false,
    connectNulls: false, symbol: 'circle', lineStyle: { width: 2 },
    areaStyle: { opacity: i === 0 ? 0.11 : 0.025 },
    data: props.samples.map(point => point[entry.key] ?? null)
  }))
  chart.setOption({
    animationDuration: 250,
    // Reduce reserved y-axis space so both mobile charts can use more width.
    grid: { top: 38, bottom: 30, left: 32, right: 12, containLabel: false },
    legend: { top: 2, icon: 'roundRect', itemWidth: 13, textStyle: { fontSize: 11 } },
    tooltip: { trigger: 'axis', confine: true, valueFormatter: n => {
      return n == null ? '--' : Number(n).toFixed(1) + props.unit
    }},
    xAxis: { type: 'category', data: timeLabels, boundaryGap: false,
      axisLabel: { fontSize: 10, interval: 'auto' }, axisLine: { lineStyle: { color: '#a1a8b6' } } },
    yAxis: { type: 'value', min: 0, scale: true, splitNumber: 3,
      axisLabel: { fontSize: 10, margin: 5 }, splitLine: { lineStyle: { color: '#8795b21a' } } },
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
watch(() => [props.samples, props.series, props.unit], render, { deep: true })
onUnmounted(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>
<template>
  <div ref="root" class="realtime-chart" role="img" :aria-label="title + '（最近 ' + samples.length + ' 个采样点）'"/>
</template>
<style scoped>
.realtime-chart{height:230px;width:100%;min-width:0;touch-action:pan-y}
@media(max-width:390px){.realtime-chart{height:205px}}
</style>
