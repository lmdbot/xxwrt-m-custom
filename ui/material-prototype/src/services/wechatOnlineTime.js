/**
 * WeChatPush's devices.json uptime is normally the Unix timestamp (seconds)
 * when a device came online, NOT elapsed seconds. Legacy payloads may already
 * contain a readable duration or a small elapsed-seconds value.
 */
export function formatWechatOnlineTime(raw, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (raw === null || raw === undefined || raw === '') return '--'
  const source = String(raw).trim()
  if (!source || source === 'null' || source === '--') return '--'
  // Do not corrupt durations already formatted by a router/plugin.
  if (/[年月天时分秒]|(?:^|\s)(?:days?|hours?|mins?|minutes?|seconds?)(?:\s|$)/i.test(source)) return source
  if (!/^\d+(?:\.\d+)?$/.test(source)) return '--'
  let value = Number(source)
  if (!Number.isFinite(value) || !Number.isSafeInteger(Math.floor(value))) return '--'

  // Official WeChatPush writes date +%s (Unix epoch seconds) to uptime.
  // Also accommodate milliseconds from other variants without converting
  // a 10-digit epoch directly into 50+ years of "online" time.
  if (value >= 1_000_000_000_000) value = Math.floor(value / 1000)
  const isEpoch = value >= 1_000_000_000
  if (isEpoch) {
    if (!Number.isFinite(nowSeconds)) return '--'
    value = Math.floor(nowSeconds) - value
    if (value < 0) return '刚刚上线'
  }
  let seconds = Math.floor(value)
  if (seconds === 0) return '不足1秒'
  const units = [
    ['天', 86400],
    ['小时', 3600],
    ['分钟', 60],
    ['秒', 1]
  ]
  const parts = []
  for (const [label, unit] of units) {
    const n = Math.floor(seconds / unit)
    seconds %= unit
    if (n) parts.push(n + label)
    // Show the two most important units; for instance 1小时1分钟,
    // 2分钟5秒, 1天1小时.
    if (parts.length >= 2) break
  }
  return parts.join('') || '不足1秒'
}
