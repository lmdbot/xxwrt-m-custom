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
