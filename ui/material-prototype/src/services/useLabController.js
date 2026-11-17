import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterClient, readDashboard, shortError } from './router.js'
import {
  loadLabSettings, saveLabSettings, resetAllLabPreferences, refreshIntervals, normalizeOverviewCards,
  loadOverviewCards, saveOverviewCards, rearrangeOverviewCards, toggleOverviewCard,
  enableRpcTrace, subscribeRpcTrace, clearRpcTrace, getRpcTrace,
  normalizeTrustedAlternative, readRouterIdentity, sameRouterIdentity,
  loadPairedRoute, savePairedRoute, loadPairedRoutes, savePairedRoutes, removePairedRoute,
  passiveNetworkHealth, runNetworkHealthProbes
} from './labFeatures.js'

/** All experimental features are opt-in and never write router UCI. */
export function useLabController({
  storage, selectedDeviceId, selectedDevice, connected, client, snapshot, sessions,
  onRefreshSettingsChange, onConnectionSwitched, onAppIconReset
}) {
  const labSettings = ref(loadLabSettings(storage))
  const labIntervals = computed(() => refreshIntervals(labSettings.value))
  const labCards = ref(normalizeOverviewCards())
  const labRpcRecords = ref([])
  const labAlternates = ref([])
  const labAlternate = computed(() => labAlternates.value[0] || null)
  const labSmartBusy = ref(false)
  const labSmartMessage = ref('')
  const labGlobalMessage = ref('')
  const labRpcMessage = ref('')
  const labHealthBusy = ref(false)
  const labDeepRows = ref([])
  const labHealthRows = computed(() => connected.value ? passiveNetworkHealth(snapshot.value) : [])
  let lastFailoverAt = 0
  let stopTrace = null

  watch(selectedDeviceId, id => {
    labCards.value = loadOverviewCards(storage,id)
    labAlternates.value = loadPairedRoutes(storage,id)
    labDeepRows.value = []
    labSmartMessage.value = ''
  },{immediate:true})

  onMounted(() => {
    enableRpcTrace(labSettings.value.rpcDebug)
    stopTrace=subscribeRpcTrace(value => { labRpcRecords.value=value })
  })
  onUnmounted(() => {
    stopTrace?.()
    enableRpcTrace(false)
  })

  function applyLabSettings(changes) {
    labSettings.value = saveLabSettings(storage,{...labSettings.value,...changes})
  }
  function setLabRefreshProfile(profile) {
    if (!['balanced','saver','realtime','custom'].includes(profile)) return
    applyLabSettings({profile})
    onRefreshSettingsChange()
  }
  function setLabCustomInterval({key,value}) {
    if (!['overview','telemetry','devices'].includes(key)) return
    applyLabSettings({profile:'custom',custom:{...labSettings.value.custom,[key]:value}})
    onRefreshSettingsChange()
  }
  function updateCards(next) {
    labCards.value=saveOverviewCards(storage,selectedDeviceId.value,next)
  }
  function setLabCardVisibility(id) {
    if (selectedDeviceId.value) updateCards(toggleOverviewCard(labCards.value,id))
  }
  function moveLabCard({id,direction}) {
    if (selectedDeviceId.value) updateCards(rearrangeOverviewCards(labCards.value,id,direction))
  }
  function resetLabCards() {
    if (selectedDeviceId.value) updateCards(normalizeOverviewCards())
  }
  function toggleLabRpc(checked) {
    applyLabSettings({rpcDebug:checked===true})
    enableRpcTrace(checked===true)
  }
  async function copyLabRpc() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('剪贴板功能不可用')
      await navigator.clipboard.writeText(JSON.stringify(getRpcTrace(),null,2))
      labRpcMessage.value='已复制脱敏 RPC 日志'
    } catch {
      labRpcMessage.value='复制失败：请检查系统剪贴板权限'
    }
  }
  function resetLabAll() {
    if (labSmartBusy.value || labHealthBusy.value) {
      labGlobalMessage.value='配对、切换或诊断操作进行中，暂不能重置'
      return
    }
    if (!resetAllLabPreferences(storage)) {
      labGlobalMessage.value='恢复默认值失败：无法清除本机存储'
      return
    }
    labSettings.value=loadLabSettings(storage)
    labCards.value=normalizeOverviewCards()
    // Router login endpoints live with router profiles, not laboratory prefs.
    labAlternates.value=loadPairedRoutes(storage,selectedDeviceId.value)
    labRpcMessage.value=''
    labSmartMessage.value=''
    labDeepRows.value=[]
    lastFailoverAt=0
    enableRpcTrace(false)
    clearRpcTrace()
    onRefreshSettingsChange()
    onAppIconReset?.()
    labGlobalMessage.value='已恢复实验室默认值：刷新、概览卡片、图标与实验开关；路由器登录地址和已验证入口保持不变'
    // The active authenticated session is intentionally not disconnected.
  }
  function candidateFrom(source,url,ignoreTlsErrors=false) {
    const result=new RouterClient(url,{ignoreTlsErrors})
    result.session=source.session
    result.username=source.username
    // Deliberately never copy LuCI cookie or a remembered password.
    return result
  }
  /**
   * Reconcile explicitly saved login endpoints against the currently
   * authenticated router's stable identity. This may send the short-lived
   * RPC token only to URLs that the user entered in the login editor.
   * A failed validation cannot become a trusted automatic fallback.
   */
  async function verifyRouterAlternates(addresses = selectedDevice.value?.alternateAddresses || []) {
    const source=client.value, device=selectedDevice.value
    if (!source?.session || !device || labSmartBusy.value) return false
    const requested = [...new Set(addresses)].filter(x=>x!==device.address).slice(0,5)
    labSmartBusy.value=true
    labSmartMessage.value='正在核验各个备用入口是否属于当前路由器…'
    try {
      const known = await readRouterIdentity(source)
      const previous = loadPairedRoutes(storage,device.id)
      const verified=[]
      const failures=[]
      for (const raw of requested) {
        let address
        try { address=normalizeTrustedAlternative(raw) }
        catch(error){ failures.push(shortError(error)); continue }
        if (address===device.address) continue
        if (source !== client.value || selectedDeviceId.value !== device.id)
          throw new Error('当前路由器已改变，已停止验证')
        const old=previous.find(item=>item.address===address &&
          sameRouterIdentity(item.identity,known))
        if (old) { verified.push(old); continue }
        try {
          const candidate=address===source.baseUrl?source:
            candidateFrom(source,address,device.ignoreTlsErrors)
          const remote=await readRouterIdentity(candidate)
          if (!sameRouterIdentity(known,remote))
            throw new Error('设备硬件身份不一致')
          verified.push({address,identity:remote})
        } catch(error){ failures.push(address+'：'+shortError(error)) }
      }
      if (source !== client.value || selectedDeviceId.value !== device.id)
        throw new Error('当前路由器已改变，未保存验证结果')
      if (!savePairedRoutes(storage,device.id,verified))
        throw new Error('本机无法保存备用入口验证记录')
      labAlternates.value=verified
      labSmartMessage.value=failures.length
        ? '已验证 '+verified.length+' 个入口；其余未通过验证，暂不可用于自动切换：'+failures.join('；')
        : '全部 '+verified.length+' 个备用入口已通过同一设备身份验证'
      return failures.length===0
    } catch(error) {
      labSmartMessage.value='验证失败：'+shortError(error)
      return false
    } finally { labSmartBusy.value=false }
  }
  function pruneRouterAlternates(id,addresses) {
    if (!id) return
    const allowed=new Set(addresses || [])
    const remaining=loadPairedRoutes(storage,id).filter(x=>allowed.has(x.address))
    savePairedRoutes(storage,id,remaining)
    if (selectedDeviceId.value===id) labAlternates.value=remaining
  }
  // Kept for upgrades of old integrations; the UI now lives in Login Config.
  async function pairLabAlternative(input) {
    return verifyRouterAlternates([...(selectedDevice.value?.alternateAddresses||[]),input])
  }
  function unpairLabAlternative() {
    if (!selectedDeviceId.value || labSmartBusy.value) return
    removePairedRoute(storage,selectedDeviceId.value)
    labAlternates.value=[]
    labSmartMessage.value='已清空验证记录；填写的备用地址仍保存在登录配置中'
  }
  async function swapLabConnection({automatic=false,address=''}={}) {
    const source=client.value,device=selectedDevice.value
    if (!source?.session || !device || labSmartBusy.value) return false
    const verified=loadPairedRoutes(storage,device.id)
    if (!verified.length) return false
    const targets=address ? [address] : [
      ...verified.map(p=>p.address),
      ...(source.baseUrl!==device.address?[device.address]:[])
    ]
    labSmartBusy.value=true
    if (!automatic) labSmartMessage.value='正在验证并切换备用登录入口…'
    const errors=[]
    try {
      for (const target of [...new Set(targets)]) {
        if (target===source.baseUrl) continue
        const pair=verified.find(p=>p.address===target) || verified[0]
        // If selecting an unpaired address, never send the current RPC token.
        if (target!==device.address && !verified.some(p=>p.address===target)) continue
        try {
          const candidate=candidateFrom(source,target,device.ignoreTlsErrors)
          const identity=await readRouterIdentity(candidate)
          if (!sameRouterIdentity(pair.identity,identity))
            throw new Error('路由器硬件身份不一致')
          const fresh=await readDashboard(candidate)
          if (source!==client.value || selectedDeviceId.value!==device.id)
            throw new Error('当前路由器已更改')
          client.value=candidate
          sessions.set(device.id,candidate)
          snapshot.value=fresh
          labDeepRows.value=[]
          labSmartMessage.value=(automatic?'自动切换成功：':'已切换至：')+target
          onConnectionSwitched({automatic})
          return true
        } catch(error){ errors.push(target+'：'+shortError(error)) }
      }
      labSmartMessage.value='切换失败，保留当前连接：'+errors.join('；')
      return false
    } finally { labSmartBusy.value=false }
  }
  async function maybeLabFailover(error) {
    if (!(selectedDevice.value?.autoSwitch ?? labSettings.value.smartSwitch) ||
        !labAlternates.value.length || labSmartBusy.value) return false
    if (!/无法连接|网络通信失败|timeout|timed.out|ECONN|failed to fetch|network error|HTTP 50/i.test(shortError(error))) return false
    if (Date.now()-lastFailoverAt<60000) return false
    lastFailoverAt=Date.now()
    return swapLabConnection({automatic:true})
  }
  async function runLabHealthCheck() {
    const api=client.value
    if (!labSettings.value.healthEnabled || !api?.session || !snapshot.value || labHealthBusy.value) return
    labHealthBusy.value=true
    labDeepRows.value=[]
    try {
      const checks=await runNetworkHealthProbes(api,snapshot.value)
      if (api!==client.value) return
      labDeepRows.value=checks.length?checks:[{label:'主动检测',value:'没有可用于探测的网关或 DNS IPv4 地址',status:'unknown'}]
    } catch(error) {
      labDeepRows.value=[{label:'主动检测',value:'执行失败：'+shortError(error),status:'unknown'}]
    } finally { labHealthBusy.value=false }
  }

  return {
    labSettings,labIntervals,labCards,labRpcRecords,labAlternate,labAlternates,labSmartBusy,
    labSmartMessage,labGlobalMessage,labRpcMessage,labHealthBusy,labDeepRows,labHealthRows,
    applyLabSettings,setLabRefreshProfile,setLabCustomInterval,
    setLabCardVisibility,moveLabCard,resetLabCards,toggleLabRpc,
    copyLabRpc,clearRpcTrace,resetLabAll,pairLabAlternative,unpairLabAlternative,
    swapLabConnection,maybeLabFailover,verifyRouterAlternates,pruneRouterAlternates,runLabHealthCheck
  }
}
