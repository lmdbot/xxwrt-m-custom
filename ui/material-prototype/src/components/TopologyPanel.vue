<script setup>
import {computed,ref,watch} from 'vue'
import {
  TOPOLOGY_CATEGORIES,topologyViewNodes,topologyOverview,
  topologyGroups,filterTopologyNodes
} from '../services/topologyPresentation.js'

const props=defineProps({
  topology:{type:Object,required:true}
})
const page=ref('overview')
const search=ref('')
const category=ref('all')
const source=ref('all')
const identity=ref('all')
const observedOnly=ref(false)
const expanded=ref('')
const showHelp=ref(false)
const nodes=computed(()=>topologyViewNodes(props.topology?.nodes||[]))
const overview=computed(()=>topologyOverview(nodes.value,props.topology?.sources||{}))
const groups=computed(()=>topologyGroups(nodes.value))
const diagramHeight=computed(()=>Math.max(210,30+groups.value.length*68))
const diagramCenter=computed(()=>diagramHeight.value/2)
const list=computed(()=>filterTopologyNodes(nodes.value,{
  search:search.value,category:category.value,source:source.value,
  identity:identity.value,observedOnly:observedOnly.value
}))
const categoryOptions=[
  {title:'全部类型',value:'all'},
  ...TOPOLOGY_CATEGORIES.map(x=>({title:x.label,value:x.id}))
]
const sourceOptions=[
  {title:'全部来源',value:'all'},
  {title:'Host 提示',value:'hints'},
  {title:'DHCP 租约',value:'dhcp'},
  {title:'无线关联',value:'wifi'},
  {title:'LLDP 邻居',value:'lldp'}
]
watch(()=>props.topology,()=>{
  page.value=(props.topology?.confirmed||0)>0?'topology':'overview'
  expanded.value=''
},{immediate:true})
function openGroup(id){
  category.value=id
  identity.value='all'
  observedOnly.value=false
  search.value=''
  source.value='all'
  page.value='devices'
}
function setIdentity(value){
  identity.value=value
  category.value='all'
}
function nodeLabel(node){
  if(node.confirmed) return node.linkType==='wifi'?'当前关联':'当前邻接'
  return '推断 / 历史'
}
function nodeSourceDetail(node){
  return node.sources.map(key=>({
    hints:'Host 提示',dhcp:'DHCP 租约',wifi:'当前 Wi-Fi 关联',lldp:'LLDP 邻接'
  }[key]||key)).join('、')||node.source||'未确认'
}
</script>

<template>
  <div class="topo-root">
    <h3 class="topo-title">设备拓扑与链路可视化</h3>
    <p class="topo-lead">综合设备地址提示、DHCP 租约、当前 Wi-Fi 关联与 LLDP 邻居，展示可核实的连接证据及历史设备信息。</p>

    <div class="topo-warning" role="status" :class="overview.direct?'partial':'low'">
      <v-icon :icon="overview.direct?'mdi-information-outline':'mdi-alert-circle-outline'" size="23"/>
      <span v-if="overview.direct===0">
        当前没有直接链路证据。所列设备来自历史记录或地址提示，不能据此判定当前在线或直连路由器。
      </span>
      <span v-else>
        已发现 {{overview.direct}} 条当前关联或邻接证据，另外 {{overview.inferred}} 台仅有地址提示；拓扑分组不代表物理连线。
      </span>
    </div>

    <div class="topo-stats" aria-label="拓扑证据概览">
      <div class="topo-stat">
        <v-icon icon="mdi-link-variant" color="success" size="21"/>
        <strong>{{overview.direct}}</strong>
        <span>直接证据</span>
      </div>
      <div class="topo-stat">
        <v-icon icon="mdi-devices" color="primary" size="21"/>
        <strong>{{overview.inferred}}</strong>
        <span>推断设备</span>
      </div>
      <div class="topo-stat">
        <v-icon icon="mdi-wifi" color="primary" size="21"/>
        <strong>{{overview.wifi}}</strong>
        <span>无线关联</span>
      </div>
      <div class="topo-stat">
        <v-icon icon="mdi-source-branch" color="secondary" size="21"/>
        <strong>{{overview.sourceState.lldp?'已开放':'未开放'}}</strong>
        <span>LLDP</span>
      </div>
    </div>

    <div class="topo-coverage">
      <div class="d-flex align-center ga-2">
        <strong>链路证据覆盖</strong>
        <v-chip size="x-small" :color="overview.coverage==='low'?'warning':'info'"
          variant="tonal">{{overview.coverageLabel}}</v-chip>
      </div>
      <v-btn size="small" variant="text" color="primary"
        @click="showHelp=!showHelp">{{showHelp?'收起说明':'如何提升？'}}
        <v-icon end :icon="showHelp?'mdi-chevron-up':'mdi-chevron-right'"/>
      </v-btn>
    </div>
    <div v-if="showHelp" class="topo-help">
      如路由器及相邻交换机支持 LLDP，可在双方安装/启用对应服务并允许当前账号读取邻居信息；
      Wi-Fi 关联数据需要无线接口及相应 RPC 权限。外接 AP 下的终端可能无法从主路由直接识别。
      “证据覆盖”只衡量已显示节点中的直接观测比例，不表示已发现全部设备。
    </div>

    <v-tabs v-model="page" density="compact" grow color="primary"
      class="topo-tabs" aria-label="拓扑页面视图">
      <v-tab value="overview" size="small" prepend-icon="mdi-home-outline">概览</v-tab>
      <v-tab value="topology" size="small" prepend-icon="mdi-graph-outline">拓扑图</v-tab>
      <v-tab value="devices" size="small" prepend-icon="mdi-format-list-bulleted">设备列表</v-tab>
    </v-tabs>

    <template v-if="page==='overview'||page==='topology'">
      <div v-if="nodes.length" class="topo-diagram">
        <h4 class="topo-section-title">{{page==='overview'?'设备类型分组':'拓扑关系示意'}}</h4>
        <p class="topo-caption">按名称特征分组，虚线仅是分组引导，不表示实际交换机端口或物理连接。</p>
        <svg class="topo-svg" :viewBox="'0 0 360 '+diagramHeight"
          width="100%" role="img" aria-label="当前路由器与设备类型的分组示意图">
          <defs>
            <linearGradient id="topoRouterFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#eaf2ff"/>
              <stop offset="100%" stop-color="#cbdcff"/>
            </linearGradient>
          </defs>
          <path v-for="(group,i) in groups" :key="group.id+'-link'"
            :d="'M 105 '+diagramCenter+' Q 126 '+diagramCenter+' 152 '+(44+i*68)"
            stroke="#8aa4bc" stroke-width="1.5" fill="none" stroke-dasharray="4 5"/>
          <circle cx="66" :cy="diagramCenter-16" r="44" fill="url(#topoRouterFill)"
            stroke="#b7d0fa" stroke-width="2"/>
          <rect x="44" :y="diagramCenter-23" width="44" height="23" rx="5"
            fill="#fff" stroke="#204877" stroke-width="2"/>
          <path :d="'M 51 '+(diagramCenter-25)+' V '+(diagramCenter-43)+' M 81 '+(diagramCenter-25)+' V '+(diagramCenter-43)"
            stroke="#204877" stroke-width="3" stroke-linecap="round"/>
          <circle cx="51" :cy="diagramCenter-10" r="2" fill="#2e8df1"/>
          <circle cx="59" :cy="diagramCenter-10" r="2" fill="#2e8df1"/>
          <text x="66" :y="diagramCenter+44" text-anchor="middle"
            font-size="12" font-weight="700" class="topo-svg-label">当前路由器</text>
          <g v-for="(group,i) in groups" :key="group.id" role="button" tabindex="0"
            :aria-label="'查看'+group.label+'，'+group.nodes.length+'台'"
            @click="openGroup(group.id)" @keydown.enter.prevent="openGroup(group.id)"
            @keydown.space.prevent="openGroup(group.id)">
            <rect x="151" :y="15+i*68" width="199" height="58" rx="12"
              class="topo-svg-group"/>
            <text x="163" :y="38+i*68" class="topo-svg-label"
              font-size="14" font-weight="700">{{group.label}}（{{group.nodes.length}}）</text>
            <text x="163" :y="56+i*68" class="topo-svg-subtitle"
              font-size="10.5">{{group.nodes.slice(0,2).map(n=>n.name).join('、').slice(0,22)}}</text>
            <path :d="'M 336 '+(40+i*68)+' l 5 5 -5 5'"
              stroke="#6a88a8" stroke-width="1.5" fill="none"/>
          </g>
        </svg>
        <div class="topo-legend">
          <span><i class="topo-legend-line"/>分组示意，不是物理链路</span>
          <span><v-icon icon="mdi-check-circle" size="15" color="success"/> 直接证据另见列表</span>
        </div>
      </div>
      <v-alert v-else type="info" variant="tonal" density="comfortable" class="mt-3">
        未获得可展示的设备信息。请检查 Host 提示、DHCP、无线关联和 LLDP 的可读取状态。
      </v-alert>
      <template v-if="page==='overview'">
        <div class="topo-sources">
          <div class="topo-source-title">
            <strong><v-icon icon="mdi-information-outline" color="primary" size="20"/> 数据来源</strong>
            <span class="topo-caption">可读取不代表存在在线设备</span>
          </div>
          <div class="topo-source-grid">
            <div v-for="entry in [
              {id:'hints',title:'Host 提示'},
              {id:'dhcp',title:'DHCP 租约'},
              {id:'wifi',title:'无线关联'},
              {id:'lldp',title:'LLDP 邻居'}
            ]" :key="entry.id">
              <v-icon :icon="overview.sourceState[entry.id]?'mdi-check-circle':'mdi-minus-circle-outline'"
                :color="overview.sourceState[entry.id]?'success':'secondary'" size="20"/>
              <span>{{entry.title}}</span>
              <small>{{overview.sourceState[entry.id]?'可读取':'未开放 / 无权限'}}</small>
            </div>
          </div>
        </div>
      </template>
      <div v-else-if="page==='topology'" class="topo-groups">
        <button v-for="group in groups" :key="group.id"
          type="button" class="topo-group-item" @click="openGroup(group.id)">
          <v-icon :icon="group.icon" color="primary" size="22"/>
          <span><strong>{{group.label}}</strong><small>{{group.nodes.length}} 台 · 点击查看详情</small></span>
          <v-icon icon="mdi-chevron-right" size="20"/>
        </button>
        <p class="topo-caption mt-3">只有 Wi-Fi 当前关联与 LLDP 邻居提供直接观测证据；它们也不能证明其他未观测链路。</p>
      </div>
    </template>

    <template v-if="page==='devices'">
      <div class="topo-filter-pills" aria-label="设备名称筛选">
        <v-btn size="small" rounded="pill" :variant="identity==='all'?'flat':'tonal'"
          :color="identity==='all'?'primary':undefined" @click="setIdentity('all')">
          全部 {{overview.total}}</v-btn>
        <v-btn size="small" rounded="pill" :variant="identity==='named'?'flat':'tonal'"
          :color="identity==='named'?'primary':undefined" @click="setIdentity('named')">
          已命名 {{overview.named}}</v-btn>
        <v-btn size="small" rounded="pill" :variant="identity==='unknown'?'flat':'tonal'"
          :color="identity==='unknown'?'primary':undefined" @click="setIdentity('unknown')">
          未知 {{overview.unknown}}</v-btn>
      </div>
      <div class="topo-filters">
        <v-select v-model="category" :items="categoryOptions" label="设备类型"
          density="compact" variant="outlined" hide-details/>
        <v-select v-model="source" :items="sourceOptions" label="数据来源"
          density="compact" variant="outlined" hide-details/>
      </div>
      <v-text-field v-model="search" class="topo-search"
        variant="outlined" density="compact" clearable hide-details
        prepend-inner-icon="mdi-magnify" label="搜索设备名称 / IP / MAC"/>
      <v-switch v-model="observedOnly" color="primary" density="compact"
        hide-details label="仅查看当前观测证据（无线 / LLDP）" class="mt-2"/>
      <div class="topo-results">显示 {{list.length}} / {{overview.total}} 台设备</div>
      <div v-if="list.length" class="topo-device-list">
        <div v-for="node in list" :key="node.id" class="topo-device-card">
          <button type="button" class="topo-device-row" @click="expanded=expanded===node.id?'':node.id"
            :aria-expanded="expanded===node.id">
            <span class="topo-device-icon"><v-icon :icon="node.icon" color="primary" size="24"/></span>
            <span class="topo-device-main">
              <strong :title="node.name">{{node.name}}</strong>
              <small>{{node.ip||'IP 未知'}} <span v-if="node.mac">· {{node.mac}}</span></small>
            </span>
            <span class="topo-device-badges">
              <span :class="node.confirmed?'observed':'inferred'">{{nodeLabel(node)}}</span>
            </span>
            <v-icon :icon="expanded===node.id?'mdi-chevron-up':'mdi-chevron-down'" size="18"/>
          </button>
          <div v-if="expanded===node.id" class="topo-device-details">
            <div>原始名称：{{node.rawName}}</div>
            <div>数据来源：{{nodeSourceDetail(node)}}</div>
            <div>接入信息：{{node.medium||'未知'}}</div>
            <div>链路状态：{{node.observation}}</div>
            <div v-if="!node.confirmed" class="topo-hint">历史提示无法确认设备当前在线或实际接入端口。</div>
          </div>
        </div>
      </div>
      <v-alert v-else type="info" density="comfortable" variant="tonal" class="mt-3">
        当前筛选条件下没有设备。可取消筛选或切换数据来源。
      </v-alert>
      <p class="topo-caption mt-3">“已命名”表示获得了名称提示，不等于确认了品牌型号；“仅当前观测”只包含 Wi-Fi 关联和 LLDP 邻居。</p>
    </template>
  </div>
</template>

<style scoped>
.topo-root{min-width:0;color:rgb(var(--v-theme-on-surface))}
.topo-title{font-size:20px;letter-spacing:.1px;font-weight:750;margin-bottom:8px}
.topo-lead{font-size:13px;line-height:1.8;color:rgba(var(--v-theme-on-surface),.64);margin:0 0 14px}
.topo-warning{display:flex;align-items:flex-start;gap:10px;border-radius:14px;padding:12px 14px;
  font-size:13px;line-height:1.65;margin-bottom:14px}
.topo-warning.low{background:#fff5df;color:#765318}
.topo-warning.partial{background:#eaf3ff;color:#245784}
.topo-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-bottom:12px}
.topo-stat{background:rgba(var(--v-theme-primary),.06);border-radius:14px;padding:11px 4px;
  display:flex;align-items:center;flex-direction:column;gap:4px;text-align:center}
.topo-stat strong{font-size:18px;line-height:1.25;white-space:nowrap}
.topo-stat span{font-size:11px;color:rgba(var(--v-theme-on-surface),.66);white-space:nowrap}
.topo-coverage{display:flex;align-items:center;justify-content:space-between;gap:8px;
  border-radius:12px;background:rgba(var(--v-theme-primary),.05);padding:4px 9px 4px 12px;margin-bottom:12px;font-size:13px}
.topo-help{background:rgba(var(--v-theme-primary),.05);border-radius:12px;
  padding:11px 13px;font-size:12px;line-height:1.8;margin-bottom:12px}
.topo-tabs{margin:8px 0 12px;border-radius:14px;background:rgba(var(--v-theme-primary),.04)}
.topo-tabs :deep(.v-tab){min-width:0!important;padding-inline:4px!important;font-size:12px}
.topo-tabs :deep(.v-tab .v-icon){font-size:18px}
.topo-section-title{font-size:15px;margin:0 0 3px}
.topo-caption{font-size:11px;line-height:1.65;color:rgba(var(--v-theme-on-surface),.6);margin:0}
.topo-diagram{border:1px solid rgba(var(--v-theme-on-surface),.12);
  border-radius:16px;padding:13px 9px;margin-bottom:12px;min-width:0}
.topo-svg{display:block;max-height:440px;overflow:visible}
.topo-svg-group{fill:rgba(144,172,212,.10);stroke:rgba(95,135,178,.30);stroke-width:1}
.topo-svg-label{fill:rgb(var(--v-theme-on-surface))}
.topo-svg-subtitle{fill:rgba(var(--v-theme-on-surface),.63)}
.topo-svg g[role="button"]{cursor:pointer;outline:none}
.topo-svg g[role="button"]:focus .topo-svg-group{stroke:#2772c8;stroke-width:2.5}
.topo-legend{display:flex;align-items:center;flex-wrap:wrap;gap:7px 14px;
  font-size:10px;color:rgba(var(--v-theme-on-surface),.6);margin:5px 6px 0}
.topo-legend span{display:flex;align-items:center;gap:4px}
.topo-legend-line{width:28px;border-top:2px dashed #8aa4bc}
.topo-sources{border:1px solid rgba(var(--v-theme-on-surface),.12);border-radius:16px;padding:14px 10px}
.topo-source-title{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}
.topo-source-title strong{display:flex;align-items:center;gap:5px;font-size:14px}
.topo-source-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
.topo-source-grid>div{display:flex;flex-direction:column;gap:4px;align-items:center;text-align:center}
.topo-source-grid span{font-size:11px}
.topo-source-grid small{font-size:9px;color:rgba(var(--v-theme-on-surface),.57);line-height:1.45}
.topo-groups{display:grid;gap:8px}
.topo-group-item{display:flex;align-items:center;gap:12px;text-align:left;border-radius:12px;
  background:rgba(var(--v-theme-primary),.055);padding:12px;border:1px solid rgba(var(--v-theme-on-surface),.09);
  color:inherit;cursor:pointer;width:100%}
.topo-group-item span{flex:1;display:flex;flex-direction:column;gap:3px}
.topo-group-item strong{font-size:13px}
.topo-group-item small{font-size:11px;color:rgba(var(--v-theme-on-surface),.60)}
.topo-filter-pills{display:flex;flex-wrap:wrap;gap:7px;margin:8px 0 12px}
.topo-filters{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.topo-search{margin-bottom:4px}
.topo-results{font-size:12px;text-align:right;color:rgba(var(--v-theme-on-surface),.6);margin:4px 2px 12px}
.topo-device-list{display:grid;gap:8px}
.topo-device-card{border:1px solid rgba(var(--v-theme-on-surface),.13);border-radius:14px;min-width:0;overflow:hidden}
.topo-device-row{display:flex;align-items:center;gap:9px;width:100%;padding:10px 9px;
  background:transparent;color:inherit;text-align:left;cursor:pointer}
.topo-device-icon{width:36px;height:40px;flex-shrink:0;border-radius:10px;
  background:rgba(var(--v-theme-primary),.07);display:grid;place-items:center}
.topo-device-main{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.topo-device-main strong{font-size:13px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.topo-device-main small{font-size:10px;color:rgba(var(--v-theme-on-surface),.6);overflow-wrap:anywhere}
.topo-device-badges{flex-shrink:0}
.topo-device-badges span{font-size:10px;padding:4px 6px;border-radius:999px;white-space:nowrap}
.topo-device-badges .observed{background:#def3e9;color:#18794e}
.topo-device-badges .inferred{background:#e9f0fb;color:#36618b}
.topo-device-details{font-size:11px;line-height:1.9;padding:10px 13px 12px;
  background:rgba(var(--v-theme-primary),.04);overflow-wrap:anywhere}
.topo-hint{color:rgba(var(--v-theme-on-surface),.6);margin-top:4px}
@media(max-width:380px){
  .topo-stats{gap:4px}.topo-stat{padding-inline:2px}
  .topo-stat strong{font-size:16px}.topo-source-grid small{font-size:8px}
  .topo-device-row{gap:6px;padding-inline:7px}
}
</style>
