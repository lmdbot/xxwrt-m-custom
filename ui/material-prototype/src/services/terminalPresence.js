/**
 * One reconciliation policy for terminal data, regardless of whether the
 * refresh was started by login, Overview polling, Devices polling or a tap.
 *
 * When WeChatPush is installed it owns online/offline truth. DHCP, ARP,
 * iwinfo and AppFilter may discover devices and supply metadata, but must
 * not replace a missing WeChatPush observation with a contradictory status.
 */
export const WECHAT_SNAPSHOT_GRACE_MS = 90000

export function reconcileTerminalClientData(current, previous = null, now = Date.now()) {
  if (!current) return previous
  const next = { ...current }
  // The DHCP RPC occasionally fails or returns no payload even though the
  // monitor snapshot is valid. Keep last known identities/addresses instead
  // of making the device list disappear for one polling interval.
  if (!current.leasesAvailable && previous &&
      (Array.isArray(previous.data) || Array.isArray(previous.ipv6))) {
    next.data = previous.data
    next.ipv6 = previous.ipv6
    next.hints = current.hintsAvailable ? current.hints : previous.hints
    next.leasesStale = true
  }

  // A failed alias read is not a request to delete all user-defined names.
  // Conversely, a successful empty alias file is an explicit removal.
  if (!current.aliasesAvailable && previous?.wechatAliases) {
    next.wechatAliases = previous.wechatAliases
  }

  if (current.monitorAvailable) {
    next.monitorReadAt = now
    next.monitorStale = false
    return next
  }

  if (!(current.wechatInstalled || previous?.wechatInstalled)) return next
  next.wechatInstalled = true
  if (!Array.isArray(previous?.wechatRecords) || !previous.wechatRecords.length) return next

  const age = now - Number(previous.monitorReadAt)
  const recent = Number.isFinite(age) && age >= 0 && age <= WECHAT_SNAPSHOT_GRACE_MS
  const keepPresence = recent && current.monitorStopped !== true
  // A brief monitor RPC failure must not make the UI oscillate between ARP
  // and WeChatPush. A confirmed stopped daemon or expired snapshot loses
  // online authority, but cached names/identities remain visible as unknown.
  next.wechatRecords = previous.wechatRecords.map(device => ({
    ...device, status: keepPresence ? device.status : 'unknown'
  }))
  next.monitorReadAt = previous.monitorReadAt
  next.monitorAvailable = keepPresence
  next.monitorStale = true
  return next
}

export function resolveTerminalPresence({ wechatInstalled, monitored, fallbackOnline, fallbackKnown }) {
  if (wechatInstalled) {
    const status = monitored?.status
    return {
      online: status === 'online',
      onlineKnown: status === 'online' || status === 'offline',
      monitorStatus: status === 'online' || status === 'offline' ? status : ''
    }
  }
  return {
    online: fallbackOnline === true,
    onlineKnown: fallbackKnown === true,
    monitorStatus: ''
  }
}
