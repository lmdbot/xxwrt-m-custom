import { normalizeXiaomiAddress } from './xiaomiClientData.js'

/**
 * Router-side egress for Xiaomi's LAN API. Android connects ONLY to its
 * authenticated QWRT /ubus endpoint. QWRT executes curl with argv (no shell).
 *
 * Deliberately refuse URLs outside the validated private IPv4 Xiaomi origin,
 * disable user curlrc, ambient proxies and redirects, and bound I/O.
 */
export async function xiaomiRequestFromQwrt(qwrt, address, path, form = null) {
  if (!qwrt?.session || typeof qwrt.call !== 'function')
    throw new Error('请先登录 QWRT，再读取小米设备')
  const origin = normalizeXiaomiAddress(address)
  if (!/^\/cgi-bin\/luci\/(?:api\/xqsystem\/(?:init_info|login)|;stok=[a-zA-Z0-9_%.-]+\/api\/(?:misystem\/devicelist|xqsystem\/device_list\?all=1))$/.test(path))
    throw new Error('不允许访问小米路由器的其他接口')
  const args = [
    '-q', '--silent', '--show-error', '--fail', '--globoff',
    '--noproxy', '*', '--proto', '=http,https',
    '--connect-timeout', '4', '--max-time', '8',
    '--max-redirs', '0', '--max-filesize', '1048576',
    '--header', 'Accept: application/json'
  ]
  if (form) {
    args.push('--request', 'POST', '--header',
      'Content-Type: application/x-www-form-urlencoded',
      '--data-raw', new URLSearchParams(form).toString())
  }
  // The binary receives a fixed, validated URL, and no shell is invoked.
  args.push('--', origin + path)
  let result
  try {
    result = await qwrt.call('file', 'exec',
      { command: '/usr/bin/curl', params: args, env: null })
  } catch (error) {
    throw new Error('无法让 QWRT 转发小米请求：' + String(error?.message || error))
  }
  if (!result || typeof result.stdout !== 'string')
    throw new Error('QWRT 未返回 curl 执行结果，请检查 file.exec RPC 权限')
  if (Number(result.code ?? -1) !== 0) {
    const code = Number(result.code)
    if (code === 127 || /not found|no such file/i.test(result.stderr || ''))
      throw new Error('QWRT 未安装 /usr/bin/curl，请先在 QWRT 安装 curl')
    const detail = code === 7 ? '无法从 QWRT 连接小米 IP'
      : code === 22 ? '小米接口返回 HTTP 错误'
      : code === 28 ? 'QWRT 到小米路由器请求超时'
      : code === 60 ? '小米 HTTPS 证书无法验证'
      : 'QWRT 发起小米请求失败（curl ' + code + '）'
    throw new Error(detail)
  }
  const raw = result.stdout
  if (raw.length > 1048576) throw new Error('小米返回的设备数据超过 1 MB')
  try {
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') throw new Error('bad')
    return data
  } catch {
    throw new Error('小米路由器返回的不是有效 JSON 数据')
  }
}
