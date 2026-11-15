/**
 * Format OpenWrt luci-rpc.getDHCPLeases expires (remaining seconds).
 * Special cases: -1 is permanent, 0 is expired.
 */
export function formatLeaseDuration(rawSeconds) {
  if (rawSeconds === null || rawSeconds === undefined || rawSeconds === '') return '--'
  const value = Number(rawSeconds)
  if (!Number.isFinite(value)) return '--'
  if (value === -1) return '永久租约'
  if (value < 0) return '--'
  if (value === 0) return '已到期'
  let remaining = Math.floor(value)
  if (remaining < 1) return '不足1秒'
  const days = Math.floor(remaining / 86400)
  remaining %= 86400
  const hours = Math.floor(remaining / 3600)
  remaining %= 3600
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const parts = []
  if (days) parts.push(days + '天')
  if (hours) parts.push(hours + '小时')
  if (minutes) parts.push(minutes + '分钟')
  if (!parts.length) parts.push(seconds + '秒')
  return parts.join('')
}
