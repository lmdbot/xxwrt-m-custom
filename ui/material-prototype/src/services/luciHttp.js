/** LuCI session cookies, timeouts and HTTP failures. Pure helpers for regression tests. */
export const SSR_LUCI_QUERY_TIMEOUT_MS = 20000
export const SSR_LUCI_UPGRADE_TIMEOUT_MS = 600000

/** Installs perform downloads, file replacement and service restarts synchronously. */
export function isSsrUpgradeEndpoint(path) {
  return /^\/cgi-bin\/luci\/admin\/services\/shadowsocksr\/(?:component_upgrade|geo_upgrade)$/.test(path)
}

export function ssrLuciReadTimeout(path) {
  return isSsrUpgradeEndpoint(path) ? SSR_LUCI_UPGRADE_TIMEOUT_MS : SSR_LUCI_QUERY_TIMEOUT_MS
}

export function isLuciTimeout(error) {
  return /timeout|timed?\s*out|etimedout|超时/i.test(String(error?.message || error || ''))
}

export function extractLuciCookie(headers = {}) {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'set-cookie') continue
    const source = Array.isArray(value) ? value.join(', ') : String(value || '')
    // Only known LuCI session cookie names, never pass other cookies to RPC.
    const match = source.match(/(?:^|[\s,])((?:sysauth_https|sysauth_http)=[a-f0-9]{32})(?=[;,\s]|$)/i)
    if (match) return match[1]
  }
  return ''
}
export function describeLuciHttpFailure(status, path) {
  const code = Number(status) || 0
  if ([301, 302, 303, 307, 308].includes(code))
    return 'LuCI 返回 HTTP ' + code + ' 重定向，登录状态可能失效'
  if (code === 401 || code === 403)
    return 'LuCI 返回 HTTP ' + code + '，需要重新登录或检查当前账号的 LuCI 权限'
  if (code === 404)
    return 'LuCI 返回 HTTP 404，路由器安装的 SSR Plus+ 可能不包含 ' + path.split('/').pop() + ' 接口'
  if (code === 405)
    return 'LuCI 返回 HTTP 405，插件接口不接受当前请求方法'
  if (code >= 500)
    return 'LuCI 接口内部错误（HTTP ' + code + '）'
  return 'LuCI 请求失败（HTTP ' + (code || '未知') + '）'
}
