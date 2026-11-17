/**
 * UI-only presentation of the native APK download stream. Unknown totals must
 * never be shown as 0% or as fabricated 0 MB / 0 MB progress.
 */
function finitePositive(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}
function positiveBytes(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}
export function formatDownloadMb(bytes) {
  const value = positiveBytes(bytes) / (1024 * 1024)
  return (value === 0 ? '0' : value.toFixed(1)) + ' MB'
}
export function getDownloadDisplay(state = {}) {
  const total = finitePositive(state.totalBytes)
  const received = positiveBytes(state.receivedBytes)
  const rawPercent = Number(state.percent)
  const percent = total == null ? null : Number.isFinite(rawPercent) && rawPercent >= 0
    ? Math.min(100, Math.max(0, Math.floor(rawPercent)))
    : Math.min(100, Math.max(0, Math.floor(received / total * 100)))
  const sizeText = total != null
    ? formatDownloadMb(received) + ' / ' + formatDownloadMb(total)
    : received > 0 ? '已下载 ' + formatDownloadMb(received) : '正在连接下载源…'
  const stage = state.downloading ? (percent === 100 ? 'preparing' : 'downloading')
    : state.downloadedApkReady ? 'ready'
    : state.outcome === 'failed' ? 'failed'
    : state.outcome === 'cancelled' ? 'cancelled'
    : 'idle'
  return { stage, percent, sizeText }
}
