import { normalizeXiaomiAddress } from './xiaomiClientData.js'

/**
 * Xiaomi management requests are executed inside QWRT's dedicated rpcd
 * plugin. The App never connects to Xiaomi directly and never requires the
 * generic file.exec permission (which would expose arbitrary execution).
 */
export async function xiaomiRequestFromQwrt(qwrt, address, path, form = null) {
  if (!qwrt?.session || typeof qwrt.call !== 'function')
    throw new Error('请先登录 QWRT，再读取小米设备')

  const origin = normalizeXiaomiAddress(address)
  if (!/^\/cgi-bin\/luci\/(?:api\/xqsystem\/(?:init_info|login)|;stok=[a-zA-Z0-9_%.-]+\/api\/(?:misystem\/devicelist|xqsystem\/device_list\?all=1))$/.test(path))
    throw new Error('不允许访问小米路由器的其他接口')
  if ((form !== null) !== (path === '/cgi-bin/luci/api/xqsystem/login'))
    throw new Error('小米登录请求方法不合法')

  // The only POST body is a challenge-response digest, never the plaintext
  // Xiaomi password. Backend also validates destination, path and form.
  const payload = {
    address: origin,
    path,
    form: form === null ? '' : new URLSearchParams(form).toString()
  }
  let result
  try {
    result = await qwrt.call('luci.xxwrt-xiaomi', 'Fetch', payload)
  } catch (error) {
    const detail = String(error?.message || error)
    if (/(?:代码\s*-32000|Object not found)/i.test(detail)) {
      throw new Error('QWRT 没有注册小米查询 RPC 对象（-32000），并非小米密码错误。请在 QWRT 重新运行最新版 XX-WRT-QWRT-xiaomi-install.sh，确认显示 SUCCESS，再在 App 中重新连接 QWRT。')
    }
    if (/代码\s*(?:4|6|9)|(?:permission|access)\s*denied|not\s*found/i.test(detail)) {
      throw new Error('QWRT 尚未安装或授权小米查询扩展（也可能是登录已过期）；请安装 XX-WRT 小米 RPC 扩展并重新登录 QWRT。' + detail)
    }
    throw new Error('QWRT 小米查询服务调用失败：' + detail)
  }
  if (!result || typeof result !== 'object')
    throw new Error('QWRT 小米查询扩展没有返回数据')
  const code = Number(result.code)
  if (code !== 0) {
    const hint = code === 7 ? 'QWRT 无法连接小米路由器的管理 IP'
      : code === 22 ? '小米接口返回 HTTP 错误'
      : code === 28 ? 'QWRT 到小米路由器请求超时'
      : code === 60 ? '小米 HTTPS 证书验证失败'
      : code === 127 ? 'QWRT 缺少 curl，需安装 curl 软件包'
      : code === 400 ? 'QWRT 小米查询参数被安全校验拒绝'
      : 'QWRT 小米查询失败（代码 ' + code + '）'
    throw new Error(hint)
  }
  if (typeof result.body !== 'string' || result.body.length > 262144)
    throw new Error('QWRT 小米查询返回数据无效或超过大小限制')
  try {
    const body = JSON.parse(result.body)
    if (body && typeof body === 'object') return body
  } catch { /* Preserve a clear error instead of treating HTML as JSON. */ }
  throw new Error('小米路由器返回的不是有效 JSON 数据')
}
