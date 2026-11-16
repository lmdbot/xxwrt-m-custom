<script setup>
import {computed,ref} from 'vue'
const props=defineProps({report:{type:Object,required:true}})
const currentGroup=ref('security')
const expandedRules=ref(false)
const visibleRules=computed(()=>props.report.byType?.filter(x=>x.group===currentGroup.value)||[])
const matchedEvents=computed(()=>(props.report.events||[]).filter(x=>x.group===currentGroup.value).slice(-15).reverse())
const activity=computed(()=>(props.report.serviceActivity||[]).filter(x=>x.count>0).slice(0,6))
const greatestActivity=computed(()=>Math.max(1,...activity.value.map(x=>x.count)))
</script>

<template>
  <section class="security-dashboard">
    <h3 class="security-heading">安全与运行日志分析</h3>
    <p class="security-lead">基于路由器已记录的系统和内核日志，统计可观察的安全线索与运行异常。没有命中只代表当前日志未出现对应文本，不代表设备不存在风险。</p>
    <div class="security-summary">
      <div><v-icon icon="mdi-text-box-search-outline" color="primary" size="23"/>
        <strong>{{report.scannedLines}}</strong><small>分析日志行</small></div>
      <div><v-icon icon="mdi-shield-search" color="warning" size="23"/>
        <strong>{{report.securityTotal||0}}</strong><small>安全线索</small></div>
      <div><v-icon icon="mdi-alert-circle-outline" color="secondary" size="23"/>
        <strong>{{report.healthTotal||0}}</strong><small>运行异常</small></div>
    </div>
    <div class="security-log-sources">
      <strong>读取来源</strong>
      <span v-for="source in report.sources" :key="source.type">
        <v-icon :icon="source.available?'mdi-check-circle-outline':'mdi-alert-circle-outline'"
          :color="source.available?'success':'warning'" size="17"/>
        {{source.label}} {{source.available?source.lines+' 行':'未读取'}}
      </span>
    </div>

    <div class="security-section-head">
      <strong>规则匹配</strong>
      <v-btn size="small" variant="text" color="primary" @click="expandedRules=!expandedRules">
        {{expandedRules?'收起规则说明':'查看规则说明'}}
        <v-icon :icon="expandedRules?'mdi-chevron-up':'mdi-chevron-down'" end/>
      </v-btn>
    </div>
    <v-btn-toggle v-model="currentGroup" mandatory rounded="lg"
      density="comfortable" color="primary" variant="tonal" class="security-tabs">
      <v-btn value="security">安全事件（{{report.securityTotal||0}}）</v-btn>
      <v-btn value="health">系统异常（{{report.healthTotal||0}}）</v-btn>
    </v-btn-toggle>
    <div class="security-rule-grid">
      <div v-for="rule in visibleRules" :key="rule.id" class="security-rule">
        <div class="security-rule-top">
          <strong>{{rule.name}}</strong>
          <v-chip size="x-small" :color="rule.count?'warning':'secondary'" variant="tonal">
            {{rule.count}} 条
          </v-chip>
        </div>
        <small v-if="expandedRules">{{rule.rule}}</small>
      </div>
    </div>
    <v-alert v-if="!matchedEvents.length" type="info" variant="tonal" density="compact" class="mt-3">
      本次日志没有命中{{currentGroup==='security'?'安全':'系统异常'}}规则。若需分析防火墙拦截，请在路由器中启用对应规则的日志记录后再刷新。
    </v-alert>
    <div v-else class="security-matches">
      <strong>实际匹配的日志（最近 {{matchedEvents.length}} 条）</strong>
      <v-expansion-panels variant="accordion" class="mt-2">
        <v-expansion-panel v-for="(item,i) in matchedEvents" :key="i" :title="item.name">
          <v-expansion-panel-text class="security-evidence">{{item.evidence}}</v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

    <div class="security-section-head mt-5"><strong>日志级别概况</strong></div>
    <div class="security-levels">
      <span>错误 <strong>{{report.severity?.error||0}}</strong></span>
      <span>警告 <strong>{{report.severity?.warning||0}}</strong></span>
      <span>其他 <strong>{{report.severity?.other||0}}</strong></span>
    </div>
    <div class="security-section-head mt-5"><strong>日志活跃模块</strong></div>
    <div v-if="activity.length" class="security-activity-list">
      <div v-for="entry in activity" :key="entry.id" class="security-activity">
        <div class="security-activity-label"><span>{{entry.name}}</span><b>{{entry.count}} 行</b></div>
        <div class="security-activity-track"><div :style="{width:(entry.count/greatestActivity*100)+'%'}"/></div>
      </div>
    </div>
    <v-alert v-else type="info" variant="tonal" density="compact">
      已读取的日志中没有匹配到常见的服务模块名称。
    </v-alert>

    <template v-if="report.recentNotices?.length">
      <div class="security-section-head mt-5"><strong>近期错误 / 警告摘录</strong><small>最多 12 条</small></div>
      <div v-for="(entry,i) in report.recentNotices.slice(0,8)" :key="i"
        class="security-log-line">
        <v-icon :icon="entry.level==='high'?'mdi-alert-circle-outline':'mdi-information-outline'"
          :color="entry.level==='high'?'warning':'secondary'" size="18"/>
        <div><strong>{{entry.name}}</strong><p>{{entry.evidence}}</p></div>
      </div>
    </template>

    <v-alert type="info" variant="tonal" density="compact" class="mt-4">
      数据来自实际读取的日志窗口，不会补造攻击事件或推断来源地。要观察更多安全线索，可以启用 SSH 登录失败记录、防火墙关键规则日志和 DNS Rebind 防护日志；注意控制日志量，避免对路由器造成负担。
    </v-alert>
    <p class="security-note">{{report.note}}</p>
  </section>
</template>

<style scoped>
.security-dashboard{min-width:0}
.security-heading{font-size:20px;margin-bottom:7px}
.security-lead{font-size:12px;line-height:1.75;color:rgba(var(--v-theme-on-surface),.66);margin-bottom:15px}
.security-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.security-summary>div{padding:13px 4px;display:flex;flex-direction:column;align-items:center;gap:5px;
  border-radius:14px;background:rgba(var(--v-theme-primary),.055);min-width:0}
.security-summary strong{font-size:22px;font-variant-numeric:tabular-nums}
.security-summary small{font-size:11px;color:rgba(var(--v-theme-on-surface),.65)}
.security-log-sources{display:flex;flex-wrap:wrap;gap:7px 10px;align-items:center;
  padding:11px 2px;font-size:12px}
.security-log-sources>span{display:flex;gap:3px;align-items:center;color:rgba(var(--v-theme-on-surface),.7)}
.security-section-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:12px 0}
.security-section-head strong{font-size:15px}
.security-section-head small{font-size:11px;color:rgba(var(--v-theme-on-surface),.55)}
.security-tabs{width:100%;display:flex;margin-bottom:10px}
.security-tabs :deep(.v-btn){flex:1;font-size:12px;min-width:0;padding-inline:6px}
.security-rule-grid{display:grid;gap:7px}
.security-rule{border:1px solid rgba(var(--v-theme-on-surface),.1);border-radius:12px;padding:11px 12px}
.security-rule-top{display:flex;justify-content:space-between;gap:6px;align-items:center}
.security-rule-top strong{font-size:13px}
.security-rule>small{display:block;margin-top:6px;font-size:11px;line-height:1.65;color:rgba(var(--v-theme-on-surface),.61)}
.security-matches{margin-top:17px}
.security-matches>strong{font-size:14px}
.security-evidence{font-size:12px;overflow-wrap:anywhere}
.security-levels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.security-levels>span{display:flex;flex-direction:column;align-items:center;gap:5px;
  padding:11px 5px;background:rgba(var(--v-theme-on-surface),.045);border-radius:11px;font-size:12px}
.security-levels strong{font-size:19px}
.security-activity-list{display:grid;gap:12px}
.security-activity-label{display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px}
.security-activity-label b{font-variant-numeric:tabular-nums}
.security-activity-track{height:8px;background:rgba(var(--v-theme-on-surface),.08);border-radius:10px;overflow:hidden}
.security-activity-track>div{background:#659de9;height:100%;border-radius:10px}
.security-log-line{display:flex;gap:9px;padding:10px 0;border-bottom:1px solid rgba(var(--v-theme-on-surface),.1)}
.security-log-line strong{font-size:12px}
.security-log-line p{font-size:11px;line-height:1.6;overflow-wrap:anywhere;margin:3px 0 0;color:rgba(var(--v-theme-on-surface),.68)}
.security-note{margin-top:12px;font-size:11px;line-height:1.7;color:rgba(var(--v-theme-on-surface),.58)}
</style>
