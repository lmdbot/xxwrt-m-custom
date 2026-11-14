<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  kind: { type: String, required: true },
  processes: { type: Array, default: () => [] },
  services: { type: Array, default: () => [] },
  staticRoutes: { type: Array, default: () => [] },
  liveRoutes: { type: Array, default: () => [] },
  routeAvailable: { type: Boolean, default: false }
})
const search = ref('')
const serviceFilter = ref('all')
const serviceEnabledFilter = ref('all')
const showAllRoutes = ref(false)
const expandedProcess = ref(null)
const expandedRoute = ref(null)

watch(() => props.kind, () => {
  search.value = ''
  serviceFilter.value = 'all'
  serviceEnabledFilter.value = 'all'
  showAllRoutes.value = false
  expandedProcess.value = null
  expandedRoute.value = null
})

const query = computed(() => String(search.value || '').trim().toLowerCase())
const matches = text => !query.value || String(text ?? '').toLowerCase().includes(query.value)

const processesFiltered = computed(() => props.processes.filter(proc =>
  matches([proc.pid, proc.user, proc.cpu, proc.memory, proc.command].join(' '))))
const servicesFiltered = computed(() => props.services.filter(service =>
  (serviceFilter.value === 'all' ||
    (serviceFilter.value === 'running' && service.running) ||
    (serviceFilter.value === 'stopped' && !service.running)) &&
  (serviceEnabledFilter.value === 'all' ||
    (serviceEnabledFilter.value === 'enabled' && service.enabled) ||
    (serviceEnabledFilter.value === 'disabled' && !service.enabled)) &&
  matches(service.name)))
const runningCount = computed(() => props.services.filter(s => s.running).length)

function classifyRoute(destination, kind = '') {
  const target = String(destination || '').trim().toLowerCase()
  if (target === 'default' || target === '0.0.0.0/0' || target === '::/0') return '默认路由'
  if (kind === 'local' || target === 'local') return '本地路由'
  if (kind === 'broadcast' || target === 'broadcast') return '广播路由'
  if (kind === 'unreachable') return '不可达路由'
  if (kind === 'blackhole') return '黑洞路由'
  if (kind === 'prohibit') return '禁止路由'
  if (kind === 'throw') return '转发路由'
  return target.includes('/') ? '网络路由' : '主机路由'
}

function formatProcessMemory(proc) {
  const raw = Number(proc.memory)
  if (!Number.isFinite(raw) || raw < 0) return proc.memory || '--'
  return (raw / 1024).toFixed(1) + ' MB' +
    (proc.memoryPercent && proc.memoryPercent !== '--' ? ' (' + proc.memoryPercent + ')' : '')
}

function fromRuntimeLine(line, index) {
  const raw = String(line || '').trim()
  const words = raw.split(/\s+/)
  const routeKinds = ['local', 'broadcast', 'unreachable', 'blackhole', 'prohibit', 'throw']
  const kind = routeKinds.includes(words[0]) ? words[0] : ''
  const destination = words[0] === 'default' ? 'default' : kind ? (words[1] || kind) : (words[0] || '--')
  const attribute = name => raw.match(new RegExp('(?:^|\\s)' + name + '\\s+(\\S+)'))?.[1] || ''
  return {
    id: 'live-' + index, origin: 'live', destination,
    via: attribute('via'), dev: attribute('dev'), table: attribute('table'),
    protocol: attribute('proto'), metric: attribute('metric'),
    routeType: classifyRoute(destination, kind), kind, raw
  }
}
const routes = computed(() => [
  ...props.staticRoutes.map((r, i) => ({
    id: 'static-' + (r.section || i), origin: 'static',
    destination: String(r.target || '--'),
    via: String(r.gateway || ''), dev: String(r.interface || ''),
    metric: String(r.metric ?? ''), protocol: '', table: '',
    routeType: classifyRoute(r.target, r.type === 'route6' ? 'ipv6' : ''),
    raw: [r.target, r.gateway, r.interface, r.metric].filter(Boolean).join(' · ')
  })),
  ...props.liveRoutes.map(fromRuntimeLine)
])
const filteredRoutes = computed(() => routes.value.filter(route =>
  matches([route.destination, route.via, route.dev, route.table, route.protocol, route.metric, route.routeType, route.raw].join(' '))))
const visibleRoutes = computed(() =>
  showAllRoutes.value || query.value ? filteredRoutes.value : filteredRoutes.value.slice(0, 32))
const routeRemaining = computed(() => filteredRoutes.value.length - visibleRoutes.value.length)
</script>

<template>
  <section class="compact-system-list">
    <div class="compact-list-heading">
      <div class="compact-list-heading-copy">
        <h3>{{ kind === 'process' ? '进程列表' : kind === 'startup' ? '启动项 / 服务' : '路由表' }}</h3>
        <small>{{ kind === 'process' ? '进程运行信息' : kind === 'startup' ? '启动配置与当前状态' : '静态配置及系统实时路由' }}</small>
      </div>
      <v-chip variant="tonal" size="small" color="primary">{{ kind === 'process' ? processes.length : kind === 'startup' ? services.length : routes.length }} 条</v-chip>
    </div>

    <v-text-field
      v-model="search" class="compact-list-search" density="compact" variant="solo-filled"
      rounded="lg" flat clearable hide-details prepend-inner-icon="mdi-magnify"
      :placeholder="kind === 'process' ? '搜索 PID、命令、用户' : kind === 'startup' ? '搜索服务名称' : '搜索网段、网关、接口'"
      :aria-label="kind === 'process' ? '搜索进程' : kind === 'startup' ? '搜索启动项' : '搜索路由'"
    />

    <template v-if="kind === 'process'">
      <div v-if="processesFiltered.length" class="compact-list-rows" role="list" aria-label="进程列表">
        <div v-for="proc in processesFiltered" :key="proc.pid + ':' + proc.command" class="compact-entry" role="listitem">
          <v-icon icon="mdi-console-line" size="19" class="compact-entry-icon"/>
          <div class="compact-entry-content">
            <div class="compact-entry-title command-one-line" :title="proc.command">{{ proc.command || '未知进程' }}</div>
            <div class="compact-entry-sub">PID {{ proc.pid }} · {{ proc.user }}</div>
            <div class="compact-entry-tags">
              <span>CPU {{ proc.cpu }}</span><span>内存 {{ formatProcessMemory(proc) }}</span><span>状态 {{ proc.status || '--' }}</span>
            </div>
            <v-expand-transition>
              <div v-if="expandedProcess === String(proc.pid)" class="compact-entry-expanded">
                <div class="expanded-label">完整命令</div>
                <code>{{ proc.command }}</code>
                <div class="expanded-label mt-2">进程状态</div>
                <code>{{ proc.status || '--' }} · PPID {{ proc.parentPid || '--' }}</code>
              </div>
            </v-expand-transition>
          </div>
          <v-btn size="x-small" variant="text" :icon="expandedProcess === String(proc.pid) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            :aria-label="'查看进程 ' + proc.pid + ' 完整命令'"
            @click="expandedProcess = expandedProcess === String(proc.pid) ? null : String(proc.pid)"/>
        </div>
      </div>
      <v-alert v-else type="info" variant="tonal" density="compact" class="mt-3">{{ processes.length ? '没有匹配的进程' : '暂无进程数据' }}</v-alert>
    </template>

    <template v-else-if="kind === 'startup'">
      <div class="compact-filter-row">
        <v-btn-toggle v-model="serviceEnabledFilter" mandatory density="compact" variant="tonal" rounded="lg" color="primary">
          <v-btn value="all" size="small">全部自启状态</v-btn>
          <v-btn value="enabled" size="small">开机自启 {{ services.filter(s => s.enabled).length }}</v-btn>
          <v-btn value="disabled" size="small">未自启 {{ services.length - services.filter(s => s.enabled).length }}</v-btn>
        </v-btn-toggle>
      </div>
      <div class="compact-filter-row">
        <v-btn-toggle v-model="serviceFilter" mandatory density="compact" variant="tonal" rounded="lg" color="secondary">
          <v-btn value="all" size="small">全部状态</v-btn>
          <v-btn value="running" size="small">运行中 {{ runningCount }}</v-btn>
          <v-btn value="stopped" size="small">未运行 {{ services.length - runningCount }}</v-btn>
        </v-btn-toggle>
      </div>
      <div v-if="servicesFiltered.length" class="compact-list-rows" role="list" aria-label="启动项服务">
        <div v-for="service in servicesFiltered" :key="'startup-' + service.name" class="compact-entry service-entry" role="listitem">
          <v-avatar size="35" rounded="lg" color="primary" variant="tonal" class="service-avatar">
            <v-icon icon="mdi-cog-outline" size="19"/>
          </v-avatar>
          <div class="compact-entry-content">
            <div class="compact-entry-title">{{ service.name }}</div>
            <div class="compact-entry-sub">{{ service.enabled ? '已设为开机自启' : '未设为开机自启' }}</div>
          </div>
          <v-chip size="x-small" :color="service.running ? 'success' : 'secondary'" variant="tonal" class="compact-status-chip">
            <v-icon start icon="mdi-circle" size="7"/>{{ service.running ? '运行中' : '未运行' }}
          </v-chip>
        </div>
      </div>
      <v-alert v-else type="info" variant="tonal" density="compact" class="mt-3">{{ services.length ? '没有符合筛选条件的服务' : '暂无服务数据' }}</v-alert>
    </template>

    <template v-else-if="kind === 'routes'">
      <div class="route-summary">
        <v-chip size="x-small" variant="tonal" color="primary">静态配置 {{ staticRoutes.length }}</v-chip>
        <v-chip size="x-small" variant="tonal" color="secondary">系统路由 {{ liveRoutes.length }}</v-chip>
      </div>
      <div v-if="visibleRoutes.length" class="compact-list-rows" role="list" aria-label="路由条目">
        <div v-for="route in visibleRoutes" :key="route.id" class="compact-entry route-entry" role="listitem">
          <v-icon icon="mdi-routes" size="19" class="compact-entry-icon"/>
          <div class="compact-entry-content">
            <div class="route-destination">{{ route.destination }}</div>
            <div class="compact-entry-sub">
              <span v-if="route.via">经由 {{ route.via }}</span>
              <span v-if="route.dev"> · {{ route.dev }}</span>
              <span v-if="!route.via && !route.dev">{{ route.routeType }}</span>
            </div>
            <div class="compact-entry-tags">
              <span>{{ route.routeType }}</span>
              <span v-if="route.table">表 {{ route.table }}</span>
              <span v-if="route.protocol">协议 {{ route.protocol }}</span>
              <span v-if="route.metric">跃点 {{ route.metric }}</span>
            </div>
            <v-expand-transition>
              <div v-if="expandedRoute === route.id" class="compact-entry-expanded">
                <div class="expanded-label">原始路由条目</div>
                <code>{{ route.raw }}</code>
              </div>
            </v-expand-transition>
          </div>
          <div class="route-entry-actions">
            <v-chip size="x-small" variant="tonal" :color="route.origin === 'static' ? 'primary' : 'secondary'">
              {{ route.origin === 'static' ? '静态' : '系统' }}
            </v-chip>
            <v-btn size="x-small" variant="text" :icon="expandedRoute === route.id ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              :aria-label="'查看路由 ' + route.destination + ' 详情'"
              @click="expandedRoute = expandedRoute === route.id ? null : route.id"/>
          </div>
        </div>
      </div>
      <v-alert v-else type="info" variant="tonal" density="compact" class="mt-3">
        {{ query ? '没有匹配的路由' : routeAvailable ? '当前无路由记录' : '尚未取得路由表数据，请检查 RPC 权限' }}
      </v-alert>
      <v-btn v-if="routeRemaining > 0" block size="small" variant="tonal" color="primary" class="mt-3" @click="showAllRoutes = true">
        展开剩余 {{ routeRemaining }} 条路由
      </v-btn>
      <v-btn v-if="showAllRoutes && !query && routes.length > 32" block size="small" variant="text" class="mt-1" @click="showAllRoutes = false">收起路由列表</v-btn>
    </template>
  </section>
</template>

<style scoped>
.compact-system-list{min-width:0;width:100%}
.compact-list-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:12px}
.compact-list-heading-copy{min-width:0;display:flex;flex-direction:column;gap:2px}
.compact-list-heading h3{font-size:16px;font-weight:650;line-height:1.4;margin:0}
.compact-list-heading small{font-size:11px;opacity:.58}
.compact-list-search{margin-bottom:12px}
.compact-list-search :deep(.v-field){border-radius:12px!important}
.compact-filter-row{margin-bottom:12px;overflow-x:auto}
.compact-filter-row :deep(.v-btn){font-size:11px;min-width:0;padding:0 10px}
.compact-list-rows{border:1px solid rgba(120,137,157,.17);border-radius:16px;overflow:hidden}
.compact-entry{display:flex;gap:10px;min-width:0;padding:12px 10px;align-items:flex-start;border-bottom:1px solid rgba(120,137,157,.13);background:rgb(var(--v-theme-surface))}
.compact-entry:last-child{border-bottom:0}
.compact-entry-icon{flex:none;margin-top:3px;opacity:.56}
.compact-entry-content{min-width:0;flex:1}
.compact-entry-title{font-size:14px;font-weight:600;line-height:1.4;word-break:break-word}
.command-one-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.compact-entry-sub{font-size:11px;opacity:.62;margin-top:4px;overflow-wrap:anywhere}
.compact-entry-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
.compact-entry-tags span{display:inline-flex;align-items:center;font-size:10px;padding:2px 7px;border-radius:6px;background:rgba(111,130,172,.09);opacity:.84}
.compact-entry-expanded{margin-top:11px;padding:10px;border-radius:10px;background:rgba(110,125,155,.09);min-width:0}
.compact-entry-expanded .expanded-label{font-size:10px;opacity:.65;margin-bottom:5px}
.compact-entry-expanded code{display:block;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}
.service-entry{align-items:center;padding:10px}
.service-avatar{flex:none}
.compact-status-chip{flex:none;max-width:92px;font-size:10px!important}
.route-destination{font-size:13px;font-weight:650;overflow-wrap:anywhere}
.route-entry-actions{flex:none;display:flex;align-items:center;flex-direction:column;gap:3px}
.route-summary{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
@media(max-width:370px){.compact-entry{gap:7px;padding:10px 8px}.compact-entry-title{font-size:13px}.compact-status-chip{max-width:80px}}
</style>
