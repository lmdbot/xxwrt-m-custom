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
