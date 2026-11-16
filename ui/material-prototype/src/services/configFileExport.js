import { Capacitor, registerPlugin } from '@capacitor/core'

// Native Android export must use ACTION_CREATE_DOCUMENT (Storage Access Framework).
// WebView blob: downloads and the browser Web Share API are not reliable file saves.
const ConfigFileExport = registerPlugin('ConfigFileExport')
const MAX_BYTES = 2 * 1024 * 1024
const FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.json$/

export function validateSnapshotFile(filename, json) {
  if (!FILE_NAME.test(String(filename || ''))) throw new Error('JSON 文件名不合法')
  if (typeof json !== 'string' || !json.trim()) throw new Error('配置快照为空')
  if (new TextEncoder().encode(json).byteLength > MAX_BYTES) {
    throw new Error('配置快照超过 2MB，请减少所选配置后重试')
  }
}

export async function saveConfigSnapshotFile(filename, json) {
  validateSnapshotFile(filename, json)
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    // The native plugin resolves only after the content provider has written
    // the bytes. A user cancellation is not a successful export.
    const outcome = await ConfigFileExport.save({ filename, content: json })
    if (outcome?.saved === true) return 'saved'
    if (outcome?.cancelled === true) return 'cancelled'
    throw new Error('安卓文件导出未返回有效结果')
  }

  // Web preview fallback: browsers control whether and where a download lands.
  // Never claim 'saved' because <a download> cannot confirm file persistence.
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }
  return 'requested'
}


// System-native tar.gz is separate from selective UCI JSON snapshots.
// Archive bytes never pass through a JS string or WebView blob: download.
const SYSTEM_ARCHIVE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.tar\.gz$/
const RPC_SESSION_ID = /^[0-9a-f]{32}$/i

export function systemBackupFilename(routerOrigin, now = new Date()) {
  const hostname = new URL(routerOrigin).hostname
    .replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 48)
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return 'backup-' + hostname + '-' + stamp + '.tar.gz'
}

export function validateSystemBackupRequest(client, filename) {
  if (!client || !RPC_SESSION_ID.test(String(client.session || '')))
    throw new Error('路由器登录会话已失效，请重新连接')
  const origin = new URL(client.baseUrl)
  if (!['http:', 'https:'].includes(origin.protocol) || !origin.hostname
      || origin.pathname !== '/' || origin.search || origin.hash
      || origin.username || origin.password)
    throw new Error('路由器地址不合法')
  if (!SYSTEM_ARCHIVE_NAME.test(String(filename || '')))
    throw new Error('系统备份文件名不合法')
}

export async function saveRouterSystemBackup(client) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android')
    throw new Error('系统原生 tar.gz 导出目前仅支持安卓 APP，请使用 LuCI 网页生成备份')
  const filename = systemBackupFilename(client.baseUrl)
  validateSystemBackupRequest(client, filename)
  // Mirrors LuCI's authenticated cgi-backup form POST using the current rpcd session.
  const outcome = await ConfigFileExport.saveSystemBackup({
    filename, origin: client.baseUrl, session: client.session,
    ignoreTlsErrors: Boolean(client.ignoreTlsErrors)
  })
  if (outcome?.cancelled === true) return { status: 'cancelled', filename }
  if (outcome?.saved !== true || !Number.isSafeInteger(outcome.bytes) || outcome.bytes <= 0)
    throw new Error('无法确认系统原生备份已保存')
  return { status: 'saved', filename, bytes: outcome.bytes }
}
