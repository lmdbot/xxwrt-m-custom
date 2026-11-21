/**
 * All client refresh entry points use one status policy.
 *
 * WeChatPush (when installed) is the only authority for its monitored
 * devices. Each poll reads a new router-side snapshot; a failed poll is NOT
 * replaced by a prior app snapshot, including within the old 90s grace.
 * DHCP/ARP/iwinfo may supplement addresses and discovered clients.
 */
export function reconcileTerminalClientData(current, previous = null) {
  if (!current) return null
  // Installation is capability metadata, not cached terminal observations.
  // Retain that flag if the next RPC has insufficient permissions to detect it.
  return {
    ...current,
    wechatInstalled: Boolean(current.wechatInstalled || previous?.wechatInstalled),
    wechatRecords: Array.isArray(current.wechatRecords) ? current.wechatRecords : [],
    wechatAliases: Array.isArray(current.wechatAliases) ? current.wechatAliases : [],
    monitorAvailable: current.monitorAvailable === true
  }
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

// Only QWRT's current discovery (DHCPv4/DHCPv6/associated Wi-Fi) and
// WeChatPush's *online* monitor roster may introduce a terminal. Xiaomi
// inventory and OpenAppFilter never enlarge the device list.
export function terminalDiscoveryEntries({
  dhcp4 = [], dhcp6 = [], wireless = [], wechatRecords = []
} = {}) {
  return [
    ...dhcp4.map(item => ({ item, source: 'dhcp4' })),
    ...dhcp6.map(item => ({ item, source: 'dhcp6' })),
    ...wireless.map(item => ({ item, source: 'wireless' })),
    ...wechatRecords.filter(item => item?.status === 'online')
      .map(item => ({ item, source: 'wechatpush' }))
  ]
}

/**
 * Explicit priority requested for the terminal screen:
 * 1. WeChatPush online -> online, even if Xiaomi reports offline.
 * 2. Not WeChatPush online AND Xiaomi explicitly offline -> offline.
 * 3. Otherwise, use the QWRT neighbour/association state; unknown remains
 *    unknown. Xiaomi online never authorizes an online status.
 *
 * Only an explicit offline flag in a freshly fetched Xiaomi record can
 * override QWRT. A historical record without such a flag proves nothing.
 */
export function resolveTerminalRosterPresence({
  monitored, xiaomiReportedOffline = false,
  qwrtOnline = false, qwrtOnlineKnown = false
} = {}) {
  if (monitored?.status === 'online')
    return { online: true, onlineKnown: true, monitorStatus: 'online' }
  if (xiaomiReportedOffline === true)
    return { online: false, onlineKnown: true, monitorStatus: monitored?.status === 'offline' ? 'offline' : '' }
  return {
    online: qwrtOnline === true,
    onlineKnown: qwrtOnlineKnown === true || qwrtOnline === true,
    monitorStatus: monitored?.status === 'offline' ? 'offline' : ''
  }
}
