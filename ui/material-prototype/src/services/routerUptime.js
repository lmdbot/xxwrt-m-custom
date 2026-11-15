/** OpenWrt system uptime shared by the router list and home screen. */
export function formatRouterUptime(rawSeconds) {
  if (rawSeconds === undefined || rawSeconds === null || rawSeconds === '') return '--'
  const value = Number(rawSeconds)
  if (!Number.isFinite(value) || value < 0) return '--'
  let seconds = Math.floor(value)
  const days = Math.floor(seconds / 86400)
  seconds %= 86400
  const hours = Math.floor(seconds / 3600)
  seconds %= 3600
  const minutes = Math.floor(seconds / 60)
  seconds %= 60
  const parts = []
  if (days) parts.push(days + '天')
  if (hours) parts.push(hours + '小时')
  if (minutes) parts.push(minutes + '分钟')
  if (!parts.length) parts.push(seconds + '秒')
  return parts.join('')
}
