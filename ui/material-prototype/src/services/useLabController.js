import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterClient, readDashboard, shortError } from './router.js'
import {
  loadLabSettings, saveLabSettings, refreshIntervals, normalizeOverviewCards,
  loadOverviewCards, saveOverviewCards, rearrangeOverviewCards, toggleOverviewCard,
  enableRpcTrace, subscribeRpcTrace, clearRpcTrace, getRpcTrace,
  normalizeTrustedAlternative, readRouterIdentity, sameRouterIdentity,
  loadPairedRoute, savePairedRoute, removePairedRoute,
  passiveNetworkHealth, runNetworkHealthProbes
} from './labFeatures.js'

/** All experimental features are opt-in and never write router UCI. */
export function useLabController({
  storage, selectedDeviceId, selectedDevice, connected, client, snapshot, sessions,
  onRefreshSettingsChange, onConnectionSwitched
}) {
  const labSettings = ref(loadLabSettings(storage))
  const labIntervals = computed(() => refreshIntervals(labSettings.value))
  const labCards = ref(normalizeOverviewCards())
  const labRpcRecords = ref([])
  const labAlternate = ref(null)
  const labSmartBusy = ref(false)
  const labSmartMessage = ref('')
  const labHealthBusy = ref(false)
  const labDeepRows = ref([])
  const labHealthRows = computed(() => connected.value ? passiveNetworkHealth(snapshot.value) : [])
  let lastFailoverAt = 0
  let stopTrace = null

  watch(selectedDeviceId, id => {
    labCards.value = loadOverviewCards(storage,id)
    labAlternate.value = loadPairedRoute(storage,id)
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
      labSmartMessage.value='已复制脱敏 RPC 日志'
    } catch {
      labSmartMessage.value='复制失败：请检查系统剪贴板权限'
    }
  }
  function candidateFrom(source,url,ignoreTlsErrors=false) {
    const result=new RouterClient(url,{ignoreTlsErrors})
    result.session=source.session
    result.username=source.username
    // Deliberately never copy LuCI cookie or a remembered password.
    return result
  }
  async function pairLabAlternative(input) {
    const source=client.value
    const device=selectedDevice.value
    if (!source?.session || !device || labSmartBusy.value) return
    labSmartBusy.value=true
    labSmartMessage.value=''
    try {
      const address=normalizeTrustedAlternative(input)
      if (address===device.address || address===source.baseUrl)
        throw new Error('备用入口地址必须不同于当前入口和主地址')
      const known=await readRouterIdentity(source)
      const candidate=candidateFrom(source,address)
      const remote=await readRouterIdentity(candidate)
      if (!sameRouterIdentity(known,remote))
        throw new Error('目标硬件身份不一致，未发送任何路由器配置修改')
      if (source!==client.value || selectedDeviceId.value!==device.id)
        throw new Error('切换了当前路由器，已取消配对')
      const paired={address,identity:remote}
      if (!savePairedRoute(storage,device.id,paired)) throw new Error('无法保存本机配对记录')
      labAlternate.value=paired
      labSmartMessage.value='已验证相同路由器身份并保存备用入口'
    } catch(error){
      labSmartMessage.value='配对失败：'+shortError(error)
    } finally { labSmartBusy.value=false }
  }
  function unpairLabAlternative() {
    if (!selectedDeviceId.value || labSmartBusy.value) return
    removePairedRoute(storage,selectedDeviceId.value)
    labAlternate.value=null
    labSmartMessage.value='已解除备用入口配对'
  }
  async function swapLabConnection({automatic=false}={}) {
    const source=client.value, device=selectedDevice.value, pair=labAlternate.value
    if (!source?.session || !device || !pair || labSmartBusy.value) return false
    const target=source.baseUrl===pair.address?device.address:pair.address
    if (target===source.baseUrl) return false
    labSmartBusy.value=true
    if (!automatic) labSmartMessage.value='正在验证目标入口身份及可用性…'
    try {
      const candidate=candidateFrom(source,target,target===device.address && device.ignoreTlsErrors)
      const identity=await readRouterIdentity(candidate)
      if (!sameRouterIdentity(pair.identity,identity)) throw new Error('目标入口身份不一致，保持当前连接')
      const fresh=await readDashboard(candidate)
      if (source!==client.value || selectedDeviceId.value!==device.id) throw new Error('当前路由器已改变')
      client.value=candidate
      sessions.set(device.id,candidate)
      snapshot.value=fresh
      labDeepRows.value=[]
      labSmartMessage.value=(automatic?'已自动切换至 ':'已切换至 ')+target
      onConnectionSwitched({automatic})
      return true
    } catch(error) {
      labSmartMessage.value='切换失败，保留原连接：'+shortError(error)
      return false
    } finally { labSmartBusy.value=false }
  }
  async function maybeLabFailover(error) {
    if (!labSettings.value.smartSwitch || !labAlternate.value || labSmartBusy.value) return false
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
    labSettings,labIntervals,labCards,labRpcRecords,labAlternate,labSmartBusy,
    labSmartMessage,labHealthBusy,labDeepRows,labHealthRows,
    applyLabSettings,setLabRefreshProfile,setLabCustomInterval,
    setLabCardVisibility,moveLabCard,resetLabCards,toggleLabRpc,
    copyLabRpc,clearRpcTrace,pairLabAlternative,unpairLabAlternative,
    swapLabConnection,maybeLabFailover,runLabHealthCheck
  }
}
