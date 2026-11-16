<script setup>
import {computed} from 'vue'
import {buildTrendChart} from '../services/trendVisualization.js'
const props=defineProps({
  points:{type:Array,default:()=>[]},
  metric:{type:String,default:'cpu'},
  title:{type:String,default:'CPU'},
  rangeLabel:{type:String,default:'24 小时'},
  rangeValue:{type:String,default:'h24'}
})
const chart=computed(()=>buildTrendChart(props.points,props.metric,props.rangeValue))
const unit=computed(()=>props.metric==='load1'?'':'%')
const display=v=>v==null?'--':v.toFixed(props.metric==='load1'?2:1)+unit.value
function clock(time){
  return time==null?'--':new Date(time).toLocaleString('zh-CN',{
    month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
}
</script>
<template>
  <div class="trend-visual-card">
    <div class="trend-visual-heading">
      <div>
        <strong>{{title}} 趋势</strong>
        <small>{{rangeLabel}}内的真实数据 · {{points.length}} 个时间桶</small>
      </div>
      <span class="trend-visual-state">{{chart.flat?'数据平稳':'按采样时段缩放'}}</span>
    </div>

    <div v-if="chart.points.length" class="trend-visual-plot">
      <svg viewBox="0 0 360 220" width="100%" role="img"
        :aria-label="title+'真实采样趋势，共'+chart.points.length+'个数据点'"
        preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="trendBlueFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#428bff" stop-opacity=".26"/>
            <stop offset="100%" stop-color="#428bff" stop-opacity=".01"/>
          </linearGradient>
        </defs>
        <line v-for="i in [0,1,2,3]" :key="i"
          x1="42" x2="345" :y1="26+i*48.3" :y2="26+i*48.3"
          stroke="currentColor" stroke-opacity=".09" stroke-dasharray="4 4"/>
        <text x="5" y="30" class="trend-svg-axis">{{display(chart.maximum)}}</text>
        <text x="5" y="175" class="trend-svg-axis">{{display(chart.minimum)}}</text>
        <path v-for="(path,i) in chart.areaPaths" :key="'area'+i"
          :d="path" fill="url(#trendBlueFill)"/>
        <path v-for="(path,i) in chart.paths" :key="'line'+i"
          :d="path" stroke="#387dea" stroke-width="3.2"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle v-for="(point,i) in chart.points" :key="'halo'+i"
          :cx="point.x" :cy="point.y" r="7" fill="#428bff" fill-opacity=".15"/>
        <circle v-for="(point,i) in chart.points" :key="'point'+i"
          :cx="point.x" :cy="point.y" r="3.5" fill="#387dea" stroke="white" stroke-width="1"/>
        <text x="42" y="204" class="trend-svg-time">{{clock(chart.firstTime)}}</text>
        <text x="345" y="204" text-anchor="end" class="trend-svg-time">{{clock(chart.lastTime)}}</text>
      </svg>
    </div>
    <div v-else class="trend-visual-empty">
      <v-icon icon="mdi-chart-line-variant" size="36" color="secondary"/>
      <strong>当前范围没有有效的 {{title}} 采样</strong>
      <small>尝试切换指标或点击“立即采样”</small>
    </div>
    <div class="trend-visual-stats">
      <div><small>最低</small><strong>{{display(chart.minimum)}}</strong></div>
      <div><small>平均</small><strong>{{display(chart.average)}}</strong></div>
      <div><small>最高</small><strong>{{display(chart.maximum)}}</strong></div>
    </div>
    <p v-if="chart.points.length" class="trend-visual-footnote">
      横轴自动聚焦实际采样时间（{{clock(chart.firstTime)}} 至 {{clock(chart.lastTime)}}）；
      无采样时段不会补点或假设数据连续。
      <span v-if="chart.gaps">存在 {{chart.gaps}} 段采样间隔，折线已断开。</span>
    </p>
  </div>
</template>
<style scoped>
.trend-visual-card{border:1px solid rgba(var(--v-theme-on-surface),.12);border-radius:18px;
  padding:15px 11px 11px;margin:12px 0;background:rgba(var(--v-theme-primary),.025);min-width:0}
.trend-visual-heading{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 5px}
.trend-visual-heading>div{display:flex;flex-direction:column;gap:2px;min-width:0}
.trend-visual-heading strong{font-size:17px}
.trend-visual-heading small{font-size:11px;color:rgba(var(--v-theme-on-surface),.55)}
.trend-visual-state{font-size:10px;padding:5px 8px;border-radius:10px;white-space:nowrap;
  color:rgb(var(--v-theme-primary));background:rgba(var(--v-theme-primary),.09)}
.trend-visual-plot{width:100%;margin:14px 0 4px;overflow:hidden}
.trend-visual-plot svg{display:block;width:100%;min-height:165px}
.trend-svg-axis{font-size:10px;fill:rgba(var(--v-theme-on-surface),.6)}
.trend-svg-time{font-size:10px;fill:rgba(var(--v-theme-on-surface),.62)}
.trend-visual-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:8px 3px}
.trend-visual-stats>div{display:flex;flex-direction:column;align-items:center;gap:4px;
  padding:9px 4px;border-radius:12px;background:rgba(var(--v-theme-primary),.06)}
.trend-visual-stats small{font-size:11px;color:rgba(var(--v-theme-on-surface),.58)}
.trend-visual-stats strong{font-size:15px;font-variant-numeric:tabular-nums}
.trend-visual-footnote{font-size:11px;line-height:1.65;color:rgba(var(--v-theme-on-surface),.6);
  margin:12px 5px 3px}
.trend-visual-empty{min-height:180px;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:9px;text-align:center}
.trend-visual-empty strong{font-size:13px}
.trend-visual-empty small{font-size:11px;color:rgba(var(--v-theme-on-surface),.65)}
</style>