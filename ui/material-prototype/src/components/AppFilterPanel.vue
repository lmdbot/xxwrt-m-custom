<script setup>
import { onMounted, reactive, ref, watch } from 'vue'

const props = defineProps({
  client: { type: Object, required: true }
})
const tabs = [
  { value: 'status', title: '状态' },
  { value: 'apps', title: '应用分类' },
  { value: 'time', title: '时间策略' },
  { value: 'users', title: '终端规则' },
  { value: 'advanced', title: '高级设置' }
]
const tab = ref('status')
const busy = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')
const data = reactive({
  status: {}, categories: [], selected: [], time: {
    mode: 0, time_list: [], weekday_list: [], allow_time: 20,
    deny_time: 60, start_time: '00:00', end_time: '23:59'
  }, users: { mode: 0, list: [] }, allUsers: [],
  advanced: { auto_load_engine: 1, lan_ifname: 'br-lan', disable_hnat: 1 }
})
const available = reactive({ status: false, apps: false, time: false, users: false, advanced: false })
const days = [
  { title: '周日', value: 0 }, { title: '周一', value: 1 },
  { title: '周二', value: 2 }, { title: '周三', value: 3 },
  { title: '周四', value: 4 }, { title: '周五', value: 5 },
  { title: '周六', value: 6 }
]
const newUserMac = ref('')

function payload(value) {
  return value?.data && typeof value.data === 'object' ? value.data : value || {}
}
function resultError(e) { error.value = e?.message || 'RPC 请求失败' }
function mergeObject(target, source) {
  if (source && typeof source === 'object' && !Array.isArray(source))
    Object.assign(target, source)
}
async function load() {
  if (!props.client) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const checks = await Promise.allSettled([
      props.client.call('appfilter', 'get_oaf_status', {}, true),
      props.client.call('appfilter', 'class_list', {}, true),
      props.client.call('appfilter', 'get_app_filter', {}, true),
      props.client.call('appfilter', 'get_app_filter_time', {}, true),
      props.client.call('appfilter', 'get_app_filter_user', {}, true),
      props.client.call('appfilter', 'get_all_users', { flag: 3 }, true),
      props.client.call('appfilter', 'get_app_filter_adv', {}, true)
    ])
    const get = i => checks[i].status === 'fulfilled' ? checks[i].value : null
    if (get(0)) { mergeObject(data.status, payload(get(0))); available.status = true }
    const categories = get(1)?.class_list
    if (Array.isArray(categories)) {
      data.categories = categories.map(category => ({
        name: String(category.name || '其他'),
        apps: (Array.isArray(category.app_list) ? category.app_list : []).map(record => {
          const [id, name] = String(record).split(',')
          return { id: Number(id), name: name || String(id) }
        }).filter(item => Number.isFinite(item.id))
      }))
      available.apps = true
    }
    if (get(2) && Array.isArray(get(2).app_list)) {
      data.selected = get(2).app_list.map(Number).filter(Number.isFinite)
    }
    if (get(3)) { mergeObject(data.time, payload(get(3))); available.time = true }
    if (get(4)) {
      mergeObject(data.users, payload(get(4)))
      if (!Array.isArray(data.users.list)) data.users.list = []
      available.users = true
    }
    if (get(5)) data.allUsers = Array.isArray(payload(get(5)).list) ? payload(get(5)).list : []
    if (get(6)) { mergeObject(data.advanced, payload(get(6))); available.advanced = true }
    if (!Object.values(available).some(Boolean)) error.value = '未获取到 OpenAppFilter RPC 权限，或路由器未安装该插件'
  } catch (e) { resultError(e) }
  finally { busy.value = false }
}

async function save(method, params, message) {
  if (saving.value) return
  saving.value = true
  error.value = ''
  success.value = ''
  try {
    await props.client.call('appfilter', method, params)
    success.value = message + '：已提交'
  } catch (e) { resultError(e) }
  finally { saving.value = false }
}
function saveApps() {
  save('set_app_filter', { app_list: [...data.selected] }, '应用分类规则')
}
function saveTime() {
  if (!Array.isArray(data.time.time_list)) data.time.time_list = []
  if (!Array.isArray(data.time.weekday_list)) data.time.weekday_list = []
  save('set_app_filter_time', { ...data.time }, '时间规则')
}
function saveUserMode() {
  save('set_app_filter_user', { mode: Number(data.users.mode) }, '终端模式')
}
async function addUser() {
  const mac = newUserMac.value.trim().toUpperCase()
  if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) { error.value = '请输入正确的 MAC 地址，例如 AA:BB:CC:DD:EE:FF'; return }
  await save('add_app_filter_user', { mac_list: [mac] }, '添加终端')
  if (success.value) { newUserMac.value = ''; await load() }
}
async function removeUser(mac) {
  if (!mac) return
  await save('del_app_filter_user', { mac: String(mac) }, '删除终端')
  if (success.value) await load()
}
function saveAdvanced() {
  save('set_app_filter_adv', { ...data.advanced }, '高级设置')
}
function addTimeSlot() {
  if (!Array.isArray(data.time.time_list)) data.time.time_list = []
  data.time.time_list.push({ start: '00:00', end: '23:59' })
}
watch(() => props.client, () => { void load() })
onMounted(() => { void load() })
</script>

<template>
  <v-card rounded="xl" variant="outlined" class="appfilter-panel">
    <div class="appfilter-title">
      <div><h3>OpenAppFilter 家长控制</h3><p>使用原版 QWRT 的 appfilter RPC；不跳转 LuCI</p></div>
      <v-btn icon="mdi-refresh" color="primary" variant="tonal" size="small" aria-label="刷新家长控制" :loading="busy" @click="load"/>
    </div>
    <v-tabs v-model="tab" color="primary" show-arrows density="compact" class="appfilter-tabs">
      <v-tab v-for="item in tabs" :key="item.value" :value="item.value">{{ item.title }}</v-tab>
    </v-tabs>
    <v-progress-linear v-if="busy" color="primary" indeterminate/>
    <v-alert v-if="error" type="warning" density="compact" variant="tonal" class="mt-3">{{ error }}</v-alert>
    <v-alert v-if="success" type="success" density="compact" variant="tonal" class="mt-3">{{ success }}</v-alert>

    <v-window v-model="tab" class="appfilter-content">
      <v-window-item value="status">
        <div v-if="available.status" class="appfilter-kv">
          <div><span>插件版本</span><strong>{{ data.status.version || '--' }}</strong></div>
          <div><span>引擎版本</span><strong>{{ data.status.engine_version || '--' }}</strong></div>
          <div><span>内核版本</span><strong>{{ data.status.kernel_version || '--' }}</strong></div>
          <div><span>运行状态</span><strong>{{ data.status.engine_status ? '运行中' : '未运行' }}</strong></div>
          <div><span>过滤配置</span><strong>{{ data.status.config_enable ? '已启用' : '已关闭' }}</strong></div>
        </div>
        <p v-else class="muted-hint">插件尚未返回状态数据</p>
      </v-window-item>
      <v-window-item value="apps">
        <template v-if="available.apps">
          <p class="muted-hint mb-3">选择需要过滤的应用，再点击保存。{{ data.selected.length }} 项已选择。</p>
          <v-expansion-panels variant="accordion" rounded="lg">
            <v-expansion-panel v-for="category in data.categories" :key="category.name">
              <v-expansion-panel-title>{{ category.name }} <v-chip class="ml-2" color="primary" variant="tonal" size="x-small">{{ category.apps.length }} 项</v-chip></v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="appfilter-check-grid">
                  <v-checkbox v-for="app in category.apps" :key="app.id" v-model="data.selected"
                    :value="app.id" :label="app.name" color="primary" density="compact" hide-details/>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
          <v-btn block color="primary" class="mt-4" :loading="saving" @click="saveApps">保存应用过滤规则</v-btn>
        </template>
        <p v-else class="muted-hint">未取得 class_list，无法编辑应用分类</p>
      </v-window-item>
      <v-window-item value="time">
        <template v-if="available.time">
          <v-select v-model.number="data.time.mode" variant="outlined" density="compact" label="时间策略模式"
            :items="[{ title:'模式 0',value:0 },{ title:'模式 1',value:1 }]" item-title="title" item-value="value"/>
          <v-select v-model="data.time.weekday_list" multiple chips variant="outlined" density="compact" label="生效星期"
            :items="days" item-title="title" item-value="value"/>
          <v-text-field v-model.number="data.time.allow_time" type="number" label="允许时间（分钟）" variant="outlined" density="compact"/>
          <v-text-field v-model.number="data.time.deny_time" type="number" label="禁止时间（分钟）" variant="outlined" density="compact"/>
          <div v-for="(slot,index) in data.time.time_list || []" :key="index" class="appfilter-slot">
            <v-text-field v-model="slot.start" type="time" label="开始" variant="outlined" density="compact" hide-details/>
            <v-text-field v-model="slot.end" type="time" label="结束" variant="outlined" density="compact" hide-details/>
            <v-btn icon="mdi-close" size="small" color="error" variant="text" :aria-label="'移除时段 ' + (index+1)" @click="data.time.time_list.splice(index,1)"/>
          </div>
          <v-btn block variant="tonal" prepend-icon="mdi-plus" class="mb-3" @click="addTimeSlot">添加时间段</v-btn>
          <v-btn block color="primary" :loading="saving" @click="saveTime">保存时间策略</v-btn>
        </template>
        <p v-else class="muted-hint">未取得 get_app_filter_time，无法编辑时间策略</p>
      </v-window-item>
      <v-window-item value="users">
        <template v-if="available.users">
          <v-select v-model.number="data.users.mode" variant="outlined" density="compact" label="受控终端模式"
            :items="[{title:'模式 0',value:0},{title:'模式 1',value:1}]" item-title="title" item-value="value"/>
          <v-btn block color="primary" variant="tonal" class="mb-3" :loading="saving" @click="saveUserMode">保存终端模式</v-btn>
          <v-list density="compact" bg-color="transparent">
            <v-list-item v-for="item in data.users.list" :key="item.mac" :title="item.nickname || item.hostname || item.mac"
              :subtitle="item.mac">
              <template #append><v-btn icon="mdi-delete-outline" color="error" variant="text" size="small" :aria-label="'删除受控终端 ' + item.mac" @click="removeUser(item.mac)"/></template>
            </v-list-item>
          </v-list>
          <v-text-field v-model.trim="newUserMac" label="添加受控终端 MAC" variant="outlined" density="compact" placeholder="AA:BB:CC:DD:EE:FF"/>
          <v-btn block variant="tonal" color="primary" :loading="saving" @click="addUser">添加受控终端</v-btn>
        </template>
        <p v-else class="muted-hint">未取得 get_app_filter_user，无法编辑终端规则</p>
      </v-window-item>
      <v-window-item value="advanced">
        <template v-if="available.advanced">
          <v-switch v-model="data.advanced.auto_load_engine" :true-value="1" :false-value="0" color="primary" label="自动加载过滤引擎"/>
          <v-switch v-model="data.advanced.disable_hnat" :true-value="1" :false-value="0" color="primary" label="禁用硬件 NAT"/>
          <v-text-field v-model="data.advanced.lan_ifname" variant="outlined" label="LAN 接口名" density="compact"/>
          <v-btn block color="primary" :loading="saving" @click="saveAdvanced">保存高级设置</v-btn>
        </template>
        <p v-else class="muted-hint">未取得 get_app_filter_adv，无法编辑高级配置</p>
      </v-window-item>
    </v-window>
  </v-card>
</template>

<style scoped>
.appfilter-panel{padding:14px;margin-top:12px;min-width:0}
.appfilter-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
.appfilter-title h3{font-size:15px;font-weight:650}
.appfilter-title p{font-size:11px;opacity:.7;margin-top:3px}
.appfilter-tabs{margin:4px 0}
.appfilter-content{padding:18px 3px 5px}
.appfilter-content .v-window-item{min-width:0}
.appfilter-kv>div{display:flex;justify-content:space-between;gap:15px;padding:10px 0;border-bottom:1px solid rgba(120,132,158,.16);font-size:12px}
.appfilter-kv strong{text-align:right}
.appfilter-check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:3px}
.appfilter-slot{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.appfilter-slot .v-input{flex:1;min-width:0}
</style>
