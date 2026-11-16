<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { shortError, readDashboard } from '../services/router.js'
import TrendChartPanel from './TrendChartPanel.vue'
import SecurityDashboard from './SecurityDashboard.vue'
import {
  CONFIG_ROLLBACK_SECONDS, applyProtectedUci, finishProtectedUci, releaseExpiredProtectedUci,
  discoverRouterCapabilities, readAuditRecords
} from '../services/managementCore.js'
import {
  CRON_PRESET_OPTIONS, CRON_SCHEDULE_OPTIONS,
  readDdNsConfig, planDdNsUpdate, readDdNsLog,
  readOpenClashDetails, planOpenClashConfig, planOpenClashSubscription,
  readAdvancedFirewall, planFirewallRule, readCrontab, makeCrontabChange,
  applyCrontabChange
} from '../services/advancedManagement.js'
import {
  readMetricHistory, recordMetricSample, sampleFromDashboard, trendPoints,
  readSecurityReport
} from '../services/routerInsights.js'
const props=defineProps({
  client:{type:Object,required:true},
  kind:{type:String,required:true},
  deviceId:{type:String,default:''}
})
const busy=ref(false), toast=ref(false),notice=ref(''),noticeError=ref(false)
const capabilities=ref(null), ddns=ref(null), ddnsCurrent=ref('')
const ddnsForm=reactive({enabled:false,domain:'',lookupHost:'',interface:'wan',useIpv6:false})
const ddnsLog=ref('')
const cron=ref(null),cronNew=ref('ddns'),cronSchedule=ref('0 4 * * *')
const cronAction=ref(null)
const cronEditing=ref(null)
const cronEditSchedule=ref('0 4 * * *')
const clash=ref(null),clashSelected=ref(''),clashLogOpen=ref(false)
const firewall=ref(null)
const firewallForm=reactive({name:'',src:'wan',srcIp:'',family:'ipv4',proto:'tcp',target:'REJECT',port:''})
const auditSearch=ref(''),auditRows=ref([])
const trendRange=ref('h24'),trendKey=ref('cpu'),history=ref([]),trendNow=ref(Date.now())
const security=ref(null)
const queued=ref(null),pending=ref(null),pendingSubject=ref(''),expired=ref(false),remaining=ref(0)
let interval=null
const seenAudit=computed(()=>auditRows.value.filter(x=>{
  const q=auditSearch.value.trim().toLowerCase()
  return !q||[x.action,x.resource,x.status].join(' ').toLowerCase().includes(q)
}).slice().reverse())
const metricNames={cpu:'CPU',memory:'内存',connections:'连接占用',load1:'1 分钟负载'}
const metricRangeMs=computed(()=>trendRange.value==='d30'?30*86400000:
  trendRange.value==='d7'?7*86400000:86400000)
const trendData=computed(()=>trendPoints(history.value,trendRange.value,trendKey.value,trendNow.value))
const trendWindowSamples=computed(()=>history.value.filter(sample=>
  sample.time>=trendNow.value-metricRangeMs.value && sample.time<=trendNow.value))
const trendValidCount=computed(()=>trendWindowSamples.value.filter(sample=>
  Number.isFinite(sample[trendKey.value])).length)
const trendLastSaved=computed(()=>history.value.length?formatTime(history.value.at(-1).time):'暂无')
const chartLast=computed(()=>trendData.value.length?
  trendData.value.at(-1).value.toFixed(1)+(trendKey.value==='load1'?'':'%'):'--')
const trendRangeLabel=computed(()=>({h24:'24 小时',d7:'7 天',d30:'30 天'})[trendRange.value])
const versionLabel=computed(()=>capabilities.value?.firmware||'待识别')
const ddnsSelected=computed(()=>ddns.value?.sections.find(x=>x.id===ddnsCurrent.value)||null)
function notify(message,isError=false){
  notice.value=message;noticeError.value=isError;toast.value=true
}
function handleError(err){notify(shortError(err),true)}
function formatTime(x){return new Date(x).toLocaleString('zh-CN',{hour12:false})}
function safeStore(){try{return typeof localStorage!=='undefined'?localStorage:null}catch(_){return null}}
function copy(value){
  if(!navigator.clipboard?.writeText){notify('当前系统不允许复制到剪贴板',true);return}
  void navigator.clipboard.writeText(String(value||''))
    .then(()=>notify('内容已复制')).catch(handleError)
}
async function load(){
  if(busy.value||pending.value)return
  busy.value=true
  try{
    if(props.kind==='capabilities')capabilities.value=await discoverRouterCapabilities(props.client)
    else if(props.kind==='ddns'){
      ddns.value=await readDdNsConfig(props.client)
      ddnsCurrent.value=ddns.value.sections.some(x=>x.id===ddnsCurrent.value)
        ?ddnsCurrent.value:(ddns.value.sections[0]?.id||'')
      syncDdNs()
    }
    else if(props.kind==='cron')cron.value=await readCrontab(props.client)
    else if(props.kind==='openclashPlus'){
      clash.value=await readOpenClashDetails(props.client)
      clashSelected.value=clash.value.configs.includes(clash.value.activeConfig.split('/').at(-1))
        ?clash.value.activeConfig.split('/').at(-1):clash.value.configs[0]||''
    }
    else if(props.kind==='firewallPlus'){
      firewall.value=await readAdvancedFirewall(props.client)
      if(!firewall.value.zones.some(x=>x.name===firewallForm.src))
        firewallForm.src=firewall.value.zones[0]?.name||''
    }
    else if(props.kind==='audit')auditRows.value=readAuditRecords(safeStore(),props.client.baseUrl)
    else if(props.kind==='trends'){
      trendNow.value=Date.now()
      history.value=readMetricHistory(safeStore(),props.deviceId||props.client.baseUrl)
    }
    else if(props.kind==='security')security.value=await readSecurityReport(props.client)
  }catch(e){handleError(e)}
  finally{busy.value=false}
}
async function collectTrendSample(){
  if(busy.value)return
  busy.value=true
  try{
    const storage=safeStore()
    if(!storage)throw new Error('本机监控数据存储不可用')
    const dashboard=await readDashboard(props.client)
    const sample=sampleFromDashboard(dashboard)
    if (['cpu','memory','connections','load1'].every(key=>sample[key]===null))
      throw new Error('路由器没有返回任何有效监控指标')
    const router=props.deviceId||props.client.baseUrl
    const saved=recordMetricSample(storage,router,dashboard)
    trendNow.value=Date.now()
    history.value=readMetricHistory(storage,router)
    const cpuMessage=dashboard.cpuPercent===null
      ? (dashboard.cpuSource==='warming'
        ? ' CPU 统计首次读取需预热，再次采样后才可计算。'
        : ' CPU 不可用：请检查 LuCI 接口和 /proc/stat 读取权限。') : ''
    notify((saved?'监控样本已保存。':'采样完成，5 分钟去重期间没有新增有效指标。')+cpuMessage)
  }catch(e){handleError(e)}
  finally{busy.value=false}
}
function syncDdNs(){
  const row=ddnsSelected.value
  if(!row)return
  Object.assign(ddnsForm,{enabled:row.enabled,domain:row.domain,lookupHost:row.lookupHost,
    interface:row.interface,useIpv6:row.useIpv6})
  ddnsLog.value=''
}
async function previewDdNs(){
  if(!ddnsSelected.value)return
  busy.value=true
  try{
    const plan=await planDdNsUpdate(props.client,ddnsCurrent.value,{...ddnsForm})
    if(!plan.sections.length){notify('当前没有需要保存的 DDNS 变更');return}
    queued.value={kind:'uci',plan,subject:'DDNS 配置 '+ddnsCurrent.value}
  }catch(e){handleError(e)}
  finally{busy.value=false}
}
async function previewClashConfig(){
  if(!clash.value)return
  busy.value=true
  try{
    const plan=await planOpenClashConfig(props.client,clashSelected.value,clash.value)
    if(!plan.sections.length){notify('选择的配置文件已经是当前配置');return}
    queued.value={kind:'uci',plan,subject:'OpenClash 主配置切换'}
  }catch(e){handleError(e)}finally{busy.value=false}
}
async function previewClashToggle(row){
  busy.value=true
  try{
    const plan=await planOpenClashSubscription(props.client,row.id,!row.enabled)
    queued.value={kind:'uci',plan,subject:'OpenClash 订阅 '+row.name}
  }catch(e){handleError(e)}finally{busy.value=false}
}
async function previewFirewallRule(){
  busy.value=true
  try{
    const plan=await planFirewallRule(props.client,{...firewallForm},firewall.value?.zones||[])
    queued.value={kind:'uci',plan,subject:'防火墙 IPv4/IPv6 新增规则'}
  }catch(e){handleError(e)}finally{busy.value=false}
}
function queueDdNsService(name,action){
  if(!['ddns','ddns-go'].includes(name)||!['start','stop','restart'].includes(action))return
  queued.value={kind:'service',subject:'服务 '+name+' · '+action,service:name,action}
}
function previewCron(action,params){
  if(!cron.value)return
  try{
    const next=makeCrontabChange(cron.value.text,action,params)
    if(next===cron.value.text){notify('计划没有变化');return}
    queued.value={kind:'cron',next,source:cron.value.text,
      subject:action==='preset'?'新增预设任务':action==='delete'?'删除任务':
        action==='toggle'?'启停任务':'修改任务周期'}
  }catch(e){handleError(e)}
}
async function commitQueued(){
  const item=queued.value
  if(!item||busy.value)return
  busy.value=true
  queued.value=null
  try{
    if(item.kind==='uci'){
      const tx=await applyProtectedUci(props.client,item.plan)
      pending.value=tx
      pendingSubject.value=item.subject
      expired.value=false
      remaining.value=CONFIG_ROLLBACK_SECONDS
      notify('已暂时应用配置，请在倒计时结束前确认保留。',true)
    } else if(item.kind==='cron'){
      cron.value=await applyCrontabChange(props.client,item.source,item.next)
      notify('Cron 文件已保存、重新读取，并已请求重启 Cron 服务')
    } else if(item.kind==='service') {
      const result=await props.client.call('rc','init',
        {name:item.service,action:item.action},true)
      if(result===null)throw new Error('路由器未开放该 DDNS 服务操作权限')
      ddns.value=await readDdNsConfig(props.client)
      notify('服务 '+item.service+' 已提交 '+item.action+'，状态已重新读取')
    }
  }catch(e){handleError(e)}
  finally{busy.value=false}
}
async function finish(keep){
  if(!pending.value||busy.value)return
  busy.value=true
  try{
    await finishProtectedUci(props.client,pending.value,keep)
    pending.value=null
    expired.value=false
    if(keep&&pendingSubject.value.startsWith('DDNS ')){
      const reload=await props.client.call('rc','init',{name:'ddns',action:'restart'},true)
        .catch(()=>null)
      notify(reload===null?
        'DDNS 配置已确认保存，但未能确认服务重载，请在路由器中检查':
        'DDNS 配置已保存，并已请求重启 DDNS 服务',reload===null)
    } else notify(keep?'变更已确认保留':'已请求路由器回滚该变更')
    pendingSubject.value=''
  }catch(e){handleError(e)}
  finally{busy.value=false}
  if(!pending.value)void load()
}
async function showDdNsLog(){
  busy.value=true
  try{ddnsLog.value=await readDdNsLog(props.client,ddnsCurrent.value)}
  catch(e){handleError(e)}finally{busy.value=false}
}
function handleBack(){
  if(queued.value){queued.value=null;return 'dialog'}
  if(cronEditing.value){cronEditing.value=null;return 'dialog'}
  if(pending.value){notify('存在等待确认的 UCI 配置，必须先确认保留或回滚',true);return 'busy'}
  if(busy.value)return 'busy'
  return null
}
function refreshAction(){return load()}
defineExpose({refreshAction,handleBack})
watch(()=>props.kind,()=>{queued.value=null;toast.value=false;void load()})
watch(ddnsCurrent,syncDdNs)
onMounted(()=>{
  void load()
  interval=setInterval(()=>{
    if(!pending.value)return
    remaining.value=Math.max(0,Math.ceil((pending.value.deadline-Date.now())/1000))
    if(remaining.value===0&&!expired.value){
      expired.value=true
      // Only clear the local lock. Do not claim a successful remote rollback.
      releaseExpiredProtectedUci(props.client,pending.value)
      notify('配置确认期已过；路由器应自动回滚。请重新读取状态后再操作。',true)
      pending.value=null
    }
  },1000)
})
onUnmounted(()=>{if(interval)clearInterval(interval)})
</script>

<template>
  <section class="advanced-manager px-2 pb-3">
    <v-snackbar v-model="toast" :color="noticeError?'warning':'success'"
      :timeout="pending?-1:4800" location="bottom" :style="{bottom:'77px'}">
      {{ notice }}
      <template #actions><v-btn variant="text" @click="toast=false">关闭</v-btn></template>
    </v-snackbar>
    <v-progress-linear v-if="busy" indeterminate class="mb-2"/>
    <template v-if="kind==='capabilities'">
      <h3>系统发行版与功能能力识别</h3>
      <div v-if="capabilities">
        <div class="d-flex flex-wrap ga-2 my-3">
          <v-chip color="primary">{{ versionLabel }}</v-chip>
          <v-chip variant="tonal">兼容 OpenWrt</v-chip>
          <v-chip variant="tonal">{{ capabilities.board.model }}</v-chip>
        </div>
        <div class="text-caption mb-3">{{ capabilities.board.version }} · {{ capabilities.board.target }}</div>
        <div v-for="item in capabilities.features" :key="item.id" class="data-row">
          <strong>{{ item.name }}</strong>
          <v-chip size="small" variant="tonal"
            :color="item.state==='available'?'success':item.state==='unavailable'?'secondary':'warning'">
            {{ item.state==='available'?'已检测':item.state==='unavailable'?'未发现':'无法确认' }}
          </v-chip>
        </div>
        <p class="text-caption text-medium-emphasis mt-3">{{ capabilities.note }}</p>
      </div>
    </template>
    <template v-else-if="kind==='ddns'">
      <h3>DDNS 动态域名管理</h3>
      <p class="text-caption text-medium-emphasis my-2">
        自动识别 ddns-scripts 与 DDNS-Go。只编辑已有 ddns-scripts 服务的非敏感 UCI 字段，
        不读取或展示 API Token、密码和更新 URL。
      </p>
      <div v-if="ddns">
        <div class="d-flex flex-wrap ga-2 mb-3">
          <v-chip size="small" :color="ddns.supported?'success':'warning'">
            DDNS Scripts：{{ ddns.supported?'已检测':'不可用/无权限' }}
          </v-chip>
          <v-chip v-if="ddns.ddnsGo" size="small" color="primary">DDNS-Go：{{ ddns.ddnsGo.state }}</v-chip>
        </div>
        <v-alert v-if="ddns.ddnsGo" type="info" density="compact" variant="tonal" class="mb-3">
          DDNS-Go 使用独立配置与 Web 管理接口，不会将其配置误当作 ddns-scripts UCI 写入；
          下面提供受授权约束的服务启停/重启，DDNS-Go 的私有配置仍应使用其管理页面。
        </v-alert>
        <div v-if="ddns.ddnsGo" class="d-flex flex-wrap ga-2 mb-3">
          <v-btn size="small" variant="tonal" :disabled="busy" @click="queueDdNsService('ddns-go','start')">启动 DDNS-Go</v-btn>
          <v-btn size="small" variant="tonal" :disabled="busy" @click="queueDdNsService('ddns-go','restart')">重启 DDNS-Go</v-btn>
          <v-btn size="small" variant="outlined" color="warning" :disabled="busy" @click="queueDdNsService('ddns-go','stop')">停止 DDNS-Go</v-btn>
        </div>
        <template v-if="ddns.sections.length">
          <v-select v-model="ddnsCurrent" label="选择 DDNS 服务" density="compact" variant="outlined"
            :items="ddns.sections.map(x=>({title:x.id+' · '+x.serviceName,value:x.id}))"/>
          <div v-if="ddnsSelected">
            <v-switch v-model="ddnsForm.enabled" color="primary" density="compact" label="启用服务配置" hide-details/>
            <v-text-field v-model.trim="ddnsForm.domain" label="域名 domain" density="compact" variant="outlined"/>
            <v-text-field v-model.trim="ddnsForm.lookupHost" label="检测域名 lookup_host" density="compact" variant="outlined"/>
            <v-text-field v-model.trim="ddnsForm.interface" label="绑定网络接口" density="compact" variant="outlined"/>
            <v-switch v-model="ddnsForm.useIpv6" density="compact" hide-details label="使用 IPv6" color="primary"/>
            <v-btn class="mt-3" color="primary" block :disabled="busy||!!pending" @click="previewDdNs">
              预览 DDNS 配置变更
            </v-btn>
            <div class="d-flex align-center ga-2 mt-3">
              <strong>DDNS 更新日志</strong><v-spacer/>
              <v-btn variant="tonal" size="small" :disabled="busy" @click="showDdNsLog">读取</v-btn>
            </div>
            <v-textarea v-if="ddnsLog" :model-value="ddnsLog" readonly
              variant="outlined" rows="6" class="mt-2"/>
          </div>
        </template>
        <v-alert v-else type="info" variant="tonal">未发现可管理的 ddns-scripts 服务配置节。</v-alert>
      </div>
    </template>
    <template v-else-if="kind==='cron'">
      <h3>系统定时任务 Cron</h3>
      <p class="text-caption text-medium-emphasis mb-3">
        查看 root Crontab；可启停现有五段式任务、修改执行周期，并添加固定的服务维护任务。
        不提供任意命令执行框，修改前会核对原文件，保存失败尝试还原。
      </p>
      <template v-if="cron">
        <v-chip class="mb-3" size="small" variant="tonal">{{ cron.entries.length }} 条可编辑任务</v-chip>
        <div v-for="item in cron.entries" :key="item.index" class="data-row cron-row">
          <div style="min-width:0;flex:1">
            <strong>{{ item.schedule }}</strong>
            <div class="text-caption text-medium-emphasis" style="overflow-wrap:anywhere">
              {{ item.command.split(/\s+/)[0] }} · 行 {{ item.index+1 }}
            </div>
          </div>
          <v-chip size="x-small" :color="item.enabled?'success':'secondary'">
            {{ item.enabled?'启用':'禁用' }}
          </v-chip>
          <v-btn size="small" variant="text" :disabled="busy"
            @click="cronEditing=item;cronEditSchedule=item.schedule">周期</v-btn>
          <v-btn size="small" variant="text" :disabled="busy"
            @click="previewCron('toggle',{index:item.index,enabled:!item.enabled})">
            {{ item.enabled?'禁用':'启用' }}
          </v-btn>
          <v-btn size="small" variant="text" icon="mdi-delete-outline" color="error"
            :disabled="busy" @click="previewCron('delete',{index:item.index})"/>
        </div>
        <v-alert v-if="!cron.entries.length" type="info" density="compact" variant="tonal">
          未发现常规五段式 Cron 任务。注释、环境变量和特殊任务保持原样。
        </v-alert>
        <v-dialog :model-value="!!cronEditing" max-width="420" persistent>
          <v-card rounded="xl">
            <v-card-title>修改 Cron 执行周期</v-card-title>
            <v-card-text>
              <v-text-field v-model.trim="cronEditSchedule" variant="outlined" density="compact"
                label="五段式 Cron 表达式" hint="分 时 日 月 周，例如 0 4 * * *"
                persistent-hint/>
            </v-card-text>
            <v-card-actions>
              <v-spacer/>
              <v-btn variant="text" @click="cronEditing=null">取消</v-btn>
              <v-btn color="primary" @click="previewCron('schedule',{index:cronEditing.index,schedule:cronEditSchedule});cronEditing=null">预览修改</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
        <v-divider class="my-4"/>
        <h4 class="mb-2">新增预设任务</h4>
        <v-select v-model="cronNew" :items="CRON_PRESET_OPTIONS" label="任务类型"
          variant="outlined" density="compact"/>
        <v-select v-model="cronSchedule" :items="CRON_SCHEDULE_OPTIONS" label="执行时间"
          variant="outlined" density="compact"/>
        <v-btn color="primary" block :disabled="busy" @click="previewCron('preset',{preset:cronNew,schedule:cronSchedule})">
          预览新增任务
        </v-btn>
        <p class="text-caption text-medium-emphasis mt-3">
          自定义 shell 命令需要在 LuCI 的计划任务页面管理；此处不会执行任意用户输入。
        </p>
      </template>
    </template>
    <template v-else-if="kind==='openclashPlus'">
      <v-divider class="my-4"/>
      <h3>OpenClash 深度管理</h3>
      <p class="text-caption text-medium-emphasis my-2">
        自动读取已有订阅配置、当前 YAML、配置目录和运行日志，不读取订阅链接中的密钥。
        配置切换会进入受保护的 UCI 确认流程。
      </p>
      <template v-if="clash">
        <div class="d-flex flex-wrap ga-2 my-2">
          <v-chip size="small" :color="clash.available?'success':'warning'">
            配置 {{ clash.available?'可读取':'不可读取' }}
          </v-chip>
          <v-chip size="small" variant="tonal">订阅 {{ clash.subscriptions.length }}</v-chip>
          <v-chip size="small" variant="tonal">本地 YAML {{ clash.configs.length }}</v-chip>
        </div>
        <p v-if="clash.note" class="text-caption">{{ clash.note }}</p>
        <h4 class="mt-3 mb-2">配置文件</h4>
        <p class="text-caption text-medium-emphasis">当前：{{ clash.activeConfig||'未知' }}</p>
        <v-select v-if="clash.configs.length" v-model="clashSelected" label="选择现有配置"
          :items="clash.configs" variant="outlined" density="compact"/>
        <v-btn v-if="clash.configs.length" color="primary" variant="tonal" block
          :disabled="busy||!!pending" @click="previewClashConfig">预览配置切换</v-btn>
        <h4 class="mt-4 mb-2">订阅管理</h4>
        <div v-for="item in clash.subscriptions" :key="item.id" class="data-row">
          <div style="min-width:0;flex:1"><strong>{{ item.name }}</strong>
            <div class="text-caption text-medium-emphasis">{{ item.present?'已配置订阅源':'未配置订阅源' }}</div>
          </div>
          <v-chip size="x-small" :color="item.enabled?'success':'secondary'">
            {{ item.enabled?'启用':'停用' }}
          </v-chip>
          <v-btn size="small" variant="tonal" :disabled="busy||!!pending"
            @click="previewClashToggle(item)">{{ item.enabled?'停用':'启用' }}</v-btn>
        </div>
        <v-alert v-if="!clash.subscriptions.length" type="info" density="compact" variant="tonal">
          当前未识别到 config_subscribe UCI 配置节。
        </v-alert>
        <v-btn class="mt-3" variant="outlined" size="small" @click="clashLogOpen=!clashLogOpen">
          {{ clashLogOpen?'隐藏':'查看' }} OpenClash 运行日志
        </v-btn>
        <v-textarea v-if="clashLogOpen" :model-value="clash.log||'未读取到运行日志'"
          readonly rows="7" variant="outlined" class="mt-2"/>
        <p class="text-caption text-medium-emphasis mt-2">
          代理组实时切换、订阅强制更新和内核升级依赖固件侧独立 RPC/Controller 授权；
          未检测到该能力时不显示虚假的操作按钮。
        </p>
      </template>
    </template>
    <template v-else-if="kind==='firewallPlus'">
      <v-divider class="my-4"/>
      <h3>防火墙高级规则（IPv4 / IPv6）</h3>
      <p class="text-caption text-medium-emphasis my-2">
        原页面保留区域、端口转发和规则启停；此处新增按地址族、来源网段、协议及端口的规则。
        应用前预览，超时由路由器回滚。
      </p>
      <template v-if="firewall">
        <v-text-field v-model.trim="firewallForm.name" label="规则名称" variant="outlined" density="compact"/>
        <v-select v-model="firewallForm.src" label="来源区域"
          :items="firewall.zones.map(x=>({title:x.name,value:x.name}))" variant="outlined" density="compact"/>
        <v-select v-model="firewallForm.family" label="地址族"
          :items="[{title:'IPv4',value:'ipv4'},{title:'IPv6',value:'ipv6'},{title:'双栈',value:'any'}]"
          variant="outlined" density="compact"/>
        <v-text-field v-model.trim="firewallForm.srcIp" label="来源 IP 或 CIDR（可空）"
          variant="outlined" density="compact" placeholder="192.168.100.0/24 或 2001:db8::/64"/>
        <v-select v-model="firewallForm.proto" label="协议"
          :items="['tcp','udp','tcp udp','icmp','icmpv6']" variant="outlined" density="compact"/>
        <v-text-field v-if="['tcp','udp','tcp udp'].includes(firewallForm.proto)"
          v-model.trim="firewallForm.port" label="目标端口（可空）"
          variant="outlined" density="compact"/>
        <v-select v-model="firewallForm.target" label="动作"
          :items="['ACCEPT','REJECT','DROP']" variant="outlined" density="compact"/>
        <v-btn block color="primary" :disabled="busy||!!pending" @click="previewFirewallRule">
          预览新增防火墙规则
        </v-btn>
      </template>
    </template>
    <template v-else-if="kind==='audit'">
      <h3>统一操作审计记录</h3>
      <p class="text-caption text-medium-emphasis my-2">
        对当前路由器通过 APP 发出的 UCI / 服务 / 文件写入 RPC 留存时间、对象与结果。
        不保存密码、Token、配置内容或日志正文；记录仅位于本机 APP 存储。
      </p>
      <v-text-field v-model="auditSearch" label="筛选对象或结果"
        prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable/>
      <div class="d-flex align-center ga-2 mb-3">
        <v-chip size="small" variant="tonal">{{ seenAudit.length }} 条</v-chip><v-spacer/>
        <v-btn size="small" variant="text" @click="copy(JSON.stringify(seenAudit,null,2))">复制记录</v-btn>
      </div>
      <div v-for="(entry,i) in seenAudit.slice(0,120)" :key="i" class="data-row">
        <div style="min-width:0;flex:1">
          <strong>{{ entry.action }}</strong>
          <div class="text-caption text-medium-emphasis">
            {{ formatTime(entry.time) }} · {{ entry.resource||'通用操作' }}
          </div>
        </div>
        <v-chip size="x-small" :color="entry.status==='success'?'success':
          entry.status==='error'?'error':'warning'">{{ entry.status }}</v-chip>
      </div>
      <v-alert v-if="!seenAudit.length" type="info" variant="tonal">
        暂无本机审计记录。历史版本不会被自动补录。
      </v-alert>
    </template>
    <template v-else-if="kind==='trends'">
      <h3>长期运行趋势</h3>
      <p class="text-caption text-medium-emphasis my-2" style="line-height:1.7">
        本机保留最多 30 天真实采样；APP 运行并保持连接时每 5 分钟保存一次，
        关闭 APP 后不会在后台补造数据。
      </p>
      <v-select v-model="trendKey" label="监控指标" variant="outlined" density="compact"
        :items="Object.entries(metricNames).map(([value,title])=>({value,title}))"/>
      <v-btn-toggle v-model="trendRange" mandatory variant="tonal" density="compact"
        color="primary" class="mb-2">
        <v-btn value="h24">24 小时</v-btn>
        <v-btn value="d7">7 天</v-btn>
        <v-btn value="d30">30 天</v-btn>
      </v-btn-toggle>
      <div class="d-flex align-center justify-space-between ga-2 mt-2">
        <strong>最新有效样本：{{chartLast}}</strong>
        <v-chip variant="tonal" size="small">{{trendData.length}} 个时间桶</v-chip>
      </div>
      <TrendChartPanel :points="trendData" :metric="trendKey"
        :title="metricNames[trendKey]" :range-label="trendRangeLabel" :range-value="trendRange"/>
      <p class="text-caption text-medium-emphasis" style="line-height:1.7">
        当前范围 {{trendValidCount}} 条有效样本 / {{trendWindowSamples.length}} 条原始记录；
        最后保存：{{trendLastSaved}}
      </p>
      <v-alert v-if="!trendData.length" type="info" density="compact" variant="tonal" class="my-2">
        当前指标尚未有有效采样。CPU 首次使用 /proc/stat 回退时需至少两次读取才能计算。
      </v-alert>
      <div class="d-flex align-center flex-wrap ga-2 mt-3">
        <v-btn variant="tonal" color="primary" :loading="busy" :disabled="busy"
          prepend-icon="mdi-refresh" @click="collectTrendSample">立即采样</v-btn>
        <v-chip v-if="history.length" size="small" variant="tonal">
          原始样本 {{history.length}} 条
        </v-chip>
        <v-btn v-if="history.length" size="small" variant="text"
          @click="copy(JSON.stringify(history,null,2))">复制 JSON</v-btn>
      </div>
    </template>
    <template v-else-if="kind==='security'">
      <SecurityDashboard v-if="security" :report="security"/>
    </template>
    <v-dialog :model-value="!!queued" max-width="460" persistent>
      <v-card rounded="xl">
        <v-card-title>确认配置变更</v-card-title>
        <v-card-text>
          <strong>{{ queued?.subject }}</strong>
          <p class="my-3">{{ queued?.kind==='uci'?
            '请检查变更后再提交。UCI 配置需要在 90 秒内确认保留，否则将由路由器自动回滚。':
            '这项操作将改变路由器上的服务或计划任务，提交后请检查实际运行状态。' }}</p>
          <div v-for="(row,i) in queued?.plan?.summary||[]" :key="i" class="text-caption my-1">
            {{ row.config }}.{{ row.section }} · {{ row.action }} · 字段：{{ row.fields.join(', ')||'整个配置节' }}
          </div>
          <v-alert v-if="queued?.kind==='cron'" density="compact" variant="tonal" type="warning">
            Cron 文件变更无法使用 UCI 自动回滚，但写入前会核对原内容；保存失败将尝试恢复。
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer/><v-btn variant="text" @click="queued=null">取消</v-btn>
          <v-btn color="warning" :disabled="busy" @click="commitQueued">确认提交</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-card v-if="pending" class="mt-4" variant="outlined" color="warning">
      <v-card-text>
        <strong>配置已暂时应用，剩余 {{ remaining }} 秒</strong>
        <p class="text-caption mt-2">
          请先验证路由器网络正常，再确认保留。断线时不要重复应用；等待路由器自动回滚。
        </p>
        <div class="d-flex ga-2 mt-3">
          <v-btn variant="outlined" :disabled="busy" @click="finish(false)">立即回滚</v-btn>
          <v-btn color="success" :disabled="busy" @click="finish(true)">确认保留</v-btn>
        </div>
      </v-card-text>
    </v-card>
    <v-btn v-if="!['openclashPlus','firewallPlus'].includes(kind)" class="mt-4"
      variant="tonal" size="small" prepend-icon="mdi-refresh" :loading="busy" @click="load">刷新</v-btn>
  </section>
</template>

<style scoped>
.advanced-manager{width:100%;min-width:0}
.data-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(127,127,127,.15)}
.data-row strong{min-width:0;overflow-wrap:anywhere}
.cron-row{flex-wrap:wrap}
</style>
