import { normalizeXiaomiAddress } from './xiaomiClientData.js'

/**
 * QWRT-side Xiaomi discovery uses a dedicated, allowlisted rpcd plugin.
 * Never grant general file.exec or run caller-controlled shell commands.
 */
export const XIAOMI_BRIDGE_OBJECT = 'luci.xxwrt-xiaomi'
export const XIAOMI_BRIDGE_METHOD = 'Request'
export const XIAOMI_INSTALL_URL =
  'https://raw.githubusercontent.com/lmdbot/xxwrt-m-custom/main/router/XX-WRT-QWRT-xiaomi-install.sh'
export const XIAOMI_INSTALL_COMMAND =
  'curl -fsSL ' + XIAOMI_INSTALL_URL + ' -o /tmp/XX-WRT-QWRT-xiaomi-install.sh && sh /tmp/XX-WRT-QWRT-xiaomi-install.sh'

function xiaomiBridgeFailure(response) {
  if (!response?.xxwrtXiaomiError) return ''
  const reason = response.xxwrtXiaomiError
  const code = Number(response.code) || 0
  if (reason === 'curl') {
    return code === 7 ? 'QWRT 无法连接小米路由器 IP，请检查局域网地址和路由'
      : code === 22 ? '小米管理接口返回了 HTTP 错误，请检查固件接口支持情况'
      : code === 28 ? 'QWRT 访问小米路由器超时'
      : code === 60 ? 'QWRT 不信任小米 HTTPS 证书'
      : 'QWRT 访问小米接口失败（curl 错误 ' + code + '）'
  }
  if (reason === 'bad_address') return '小米地址不是允许的私有 IPv4 地址'
  if (reason === 'bad_path') return '小米管理 API 不在受限查询白名单内'
  if (reason === 'invalid_json') return '小米管理接口未返回有效 JSON，可能需要登录或与当前固件不兼容'
  if (reason === 'too_large') return '小米返回数据过大，超过 QWRT 安全限制'
  return 'QWRT 小米查询组件拒绝请求（' + reason + '）'
}

function describeBridgeRpcError(error) {
  const message = String(error?.message || error || '')
  if (/代码\s*6|permission denied|access denied|无权限|没有权限/i.test(message))
    return 'QWRT 没有授权小米查询组件：请在 QWRT 安装专用组件后重新连接 QWRT（错误码 6）'
  if (/代码\s*4|not found|not supported|对象不存在|未找到/i.test(message))
    return 'QWRT 未安装小米查询组件：需要先在 QWRT 安装专用组件，再重新连接 QWRT'
  return 'QWRT 小米查询失败：' + message
}

/** The Android app never connects to the Xiaomi address itself. */
export async function xiaomiRequestFromQwrt(qwrt, address, path, form = null) {
  if (!qwrt?.session || typeof qwrt.call !== 'function')
    throw new Error('请先登录 QWRT，再读取小米设备')
  const origin = normalizeXiaomiAddress(address)
  if (!/^\/cgi-bin\/luci\/(?:api\/xqsystem\/(?:init_info|login)|;stok=[a-zA-Z0-9_%.-]+\/api\/(?:misystem\/devicelist|xqsystem\/device_list\?all=1))$/.test(path))
    throw new Error('不允许访问小米路由器的其他接口')
  const encoded = form == null ? '' : new URLSearchParams(form).toString()
  let response
  try {
    response = await qwrt.call(XIAOMI_BRIDGE_OBJECT, XIAOMI_BRIDGE_METHOD,
      { address: origin, path, form: encoded })
  } catch (error) {
    throw new Error(describeBridgeRpcError(error))
  }
  if (!response || typeof response !== 'object')
    throw new Error('QWRT 小米查询组件未返回有效数据')
  const failure = xiaomiBridgeFailure(response)
  if (failure) throw new Error(failure)
  return response
}
