/** Config-safe OpenWrt network + DHCP UCI interface editor.
 *
 * Never commit network changes without rpcd's timed apply/confirm handshake:
 * when a router management address changes, an unconfirmed apply rolls back.
 */
export const NETWORK_APPLY_TIMEOUT = 90
export const EDITABLE_PROTOCOLS = ['static', 'dhcp', 'pppoe', 'dhcpv6', 'none']
export const PROTOCOL_LABELS = {
  static: '静态地址', dhcp: 'DHCP 客户端', pppoe: 'PPPoE 拨号',
  dhcpv6: 'DHCPv6 客户端', none: '不配置地址'
}
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function validInterfaceName(name) {
  return typeof name === 'string' && NAME.test(name) && name !== 'loopback'
}
export function isCriticalInterface(name) {
  return /^(lan|wan|wan6|wan_6)$/i.test(String(name || ''))
}
export function ipv4Valid(input) {
  const parts = String(input || '').split('.')
  return parts.length === 4 && parts.every(part =>
    /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
}
export function ipv6Valid(input) {
  const inputText = String(input || '')
  if (!/^[0-9a-f:]+$/i.test(inputText) || !inputText.includes(':') ||
      inputText.includes(':::')) return false
  const double = inputText.indexOf('::')
  if (double !== -1 && inputText.indexOf('::', double + 2) !== -1) return false
  const pieces = inputText.split(':').filter(Boolean)
  if (pieces.some(x => x.length > 4 || !/^[0-9a-f]+$/i.test(x))) return false
  return double >= 0 ? pieces.length < 8 : pieces.length === 8
}
export function validIp(input) {
  return ipv4Valid(input) || ipv6Valid(input)
}
export function validNetmask(input) {
  const value = String(input || '')
  if (/^(?:[1-9]|[12]\d|3[0-2])$/.test(value)) return true
  if (!ipv4Valid(value)) return false
  const n = value.split('.').reduce((v, x) => ((v << 8) | Number(x)) >>> 0, 0)
  if (n === 0) return false
  const inverted = (~n) >>> 0
  return ((inverted & (inverted + 1)) >>> 0) === 0
}
export function validIpv6Cidr(input) {
  if (!input) return true
  const parts = String(input).split('/')
  return parts.length === 2 && ipv6Valid(parts[0]) &&
    /^(0|[1-9]\d{0,2})$/.test(parts[1]) && Number(parts[1]) <= 128
}
const text = value => String(value ?? '').trim()
const str = value => String(value ?? '')
const textList = value => Array.isArray(value) ? value.map(text).filter(Boolean)
  : str(value).split(/[\s,;]+/).map(text).filter(Boolean)
const equals = (left, right) => JSON.stringify(left) === JSON.stringify(right)

function findDhcpSection(dhcp, name) {
  return Object.entries(dhcp?.values || {}).find(([id, data]) =>
    data?.['.type'] === 'dhcp' &&
    (id === name || data.interface === name || data['.name'] === name)) || null
}
export function findNetworkSection(config, name) {
  const section = config?.values?.[name]
  return section?.['.type'] === 'interface' ? section : null
}
export function formFromConfig(name, network, dhcp) {
  const config = findNetworkSection(network, name)
  if (!config || !validInterfaceName(name)) return null
  const dhcpEntry = findDhcpSection(dhcp, name)
  const server = dhcpEntry?.[1] || {}
  const proto = str(config.proto || 'none')
  return {
    name, proto, editable: EDITABLE_PROTOCOLS.includes(proto),
    auto: config.auto !== '0',
    device: str(config.device || config.ifname || ''),
    ipaddr: text(config.ipaddr), netmask: text(config.netmask || '255.255.255.0'),
    gateway: text(config.gateway), dns: textList(config.dns).join('\n'),
    peerdns: config.peerdns !== '0', defaultroute: config.defaultroute !== '0',
    metric: text(config.metric),
    ip6assign: text(config.ip6assign), ip6addr: text(config.ip6addr),
    pppoeUsername: str(config.username), pppoePassword: '',
    pppoePasswordSaved: Boolean(config.password),
    reqaddress: str(config.reqaddress || 'try'), reqprefix: str(config.reqprefix || 'auto'),
    dhcpSection: dhcpEntry?.[0] || '',
    dhcpEnabled: server.ignore !== '1' && Boolean(dhcpEntry),
    dhcpStart: str(server.start ?? '100'), dhcpLimit: str(server.limit ?? '150'),
    dhcpLease: str(server.leasetime ?? '12h'),
    dhcpv6Mode: str(server.dhcpv6 || 'disabled'), raMode: str(server.ra || 'disabled')
  }
}
export function buildInterfaceChanges(name, network, dhcp, form) {
  if (!validInterfaceName(name) || name !== form?.name)
    throw new Error('网络接口名称无效')
  const original = findNetworkSection(network, name)
  if (!original || !EDITABLE_PROTOCOLS.includes(original.proto || 'none'))
    throw new Error('该接口使用特殊协议，需在原生 LuCI 中修改，防止覆盖高级配置')
  if (!EDITABLE_PROTOCOLS.includes(form.proto)) throw new Error('不支持的接口协议')

  const ipaddr = text(form.ipaddr), mask = text(form.netmask), gateway = text(form.gateway)
  const dns = textList(form.dns)
  if (dns.length > 6 || dns.some(x => !validIp(x))) throw new Error('DNS 最多支持 6 个有效 IPv4/IPv6 地址')
  if (form.proto === 'static') {
    if (!ipv4Valid(ipaddr)) throw new Error('静态 IPv4 地址无效')
    if (!validNetmask(mask)) throw new Error('IPv4 子网掩码无效')
    if (gateway && !ipv4Valid(gateway)) throw new Error('IPv4 网关格式无效')
  }
  if (form.proto === 'pppoe' && !text(form.pppoeUsername))
    throw new Error('PPPoE 用户名不能为空')
  if (form.proto === 'pppoe' && !text(form.pppoePassword) && !original.password)
    throw new Error('首次配置 PPPoE 必须填写密码')
  if (form.proto === 'dhcpv6') {
    if (!['try', 'force', 'none'].includes(form.reqaddress))
      throw new Error('DHCPv6 地址请求模式无效')
    if (!['auto', 'no'].includes(text(form.reqprefix)) &&
      !/^(0|[1-9]|[1-5]\d|6[0-4])$/.test(text(form.reqprefix)))
      throw new Error('DHCPv6 前缀长度无效')
  }
  if (form.proto === 'static' && form.ip6assign &&
      (!/^(?:[1-9]|[1-5]\d|6[0-4])$/.test(text(form.ip6assign))))
    throw new Error('IPv6 分配前缀长度需为 1 至 64')
  if (form.proto === 'static' && !validIpv6Cidr(text(form.ip6addr)))
    throw new Error('静态 IPv6 地址需要使用地址/前缀长度格式')
  const metric = text(form.metric)
  if (metric && (!/^\d{1,5}$/.test(metric) || Number(metric) > 65535))
    throw new Error('路由跃点数需为 0 至 65535')

  const values = {}, deletes = []
  const set = (key, value) => {
    if (!equals(original[key], value)) values[key] = value
  }
  const del = key => { if (original[key] !== undefined) deletes.push(key) }
  set('auto', form.auto ? '1' : '0')
  set('proto', form.proto)
  if (form.proto !== original.proto) {
    // Clear only IPv4 addressing fields which are incompatible with non-static
    // protocols. Keep unrelated advanced fields, bridge/VLAN and auth secrets.
    if (form.proto !== 'static') ['ipaddr', 'netmask', 'gateway'].forEach(del)
  }
  if (form.proto === 'static') {
    set('ipaddr', ipaddr); set('netmask', mask)
    if (gateway) set('gateway', gateway)
    else del('gateway')
    if (text(form.ip6assign)) set('ip6assign', text(form.ip6assign))
    else del('ip6assign')
    if (text(form.ip6addr)) set('ip6addr', text(form.ip6addr))
    else del('ip6addr')
  }
  if (form.proto === 'pppoe') {
    set('username', text(form.pppoeUsername))
    if (form.pppoePassword) set('password', str(form.pppoePassword))
  }
  if (form.proto === 'dhcpv6') {
    set('reqaddress', form.reqaddress)
    set('reqprefix', text(form.reqprefix))
  }
  if (['dhcp', 'dhcpv6', 'pppoe'].includes(form.proto)) {
    set('peerdns', form.peerdns ? '1' : '0')
    set('defaultroute', form.defaultroute ? '1' : '0')
  }
  if (dns.length) set('dns', dns)
  else del('dns')
  if (metric) set('metric', metric)
  else del('metric')
  const mutations = []
  if (Object.keys(values).length || deletes.length)
    mutations.push({ config: 'network', section: name, values, deletes })

  const hasDhcp = Boolean(dhcp && dhcp.values)
  const activeServer = form.proto === 'static' && !/^wan(?:6|_6)?$/i.test(name)
  const dhcpSection = findDhcpSection(dhcp, name)
  if (form.dhcpEnabled && !activeServer) throw new Error('DHCP 服务端只能启用在静态地址的非 WAN 接口上')
  if (form.dhcpEnabled && !hasDhcp) throw new Error('路由器没有开放 DHCP 配置读取权限')
  if (hasDhcp && activeServer && (dhcpSection || form.dhcpEnabled)) {
    const start = text(form.dhcpStart), limit = text(form.dhcpLimit), lease = text(form.dhcpLease)
    if (!/^\d{1,4}$/.test(start) || Number(start) < 1 || Number(start) > 254 ||
        !/^\d{1,4}$/.test(limit) || Number(limit) < 1 || Number(limit) > 254 ||
        Number(start) + Number(limit) > 255) {
      throw new Error('DHCP 地址池需要在同一 /24 中，起始地址与数量之和不能超过 255')
    }
    if (!/^\d{1,5}[smhd]$/.test(lease)) throw new Error('租期格式例如 12h、30m 或 1d')
    if (!['disabled', 'server', 'relay', 'hybrid'].includes(form.dhcpv6Mode) ||
        !['disabled', 'server', 'relay', 'hybrid'].includes(form.raMode))
      throw new Error('DHCPv6/RA 模式无效')
    const valuesDhcp = {
      ignore: form.dhcpEnabled ? '0' : '1',
      start, limit, leasetime: lease, dhcpv6: form.dhcpv6Mode, ra: form.raMode
    }
    if (!dhcpSection) mutations.push({
      config: 'dhcp', section: name, create: true, values: { interface: name, ...valuesDhcp }, deletes: []
    })
    else {
      const changes = Object.fromEntries(Object.entries(valuesDhcp)
        .filter(([key, value]) => !equals(dhcpSection[1][key], value)))
      if (Object.keys(changes).length)
        mutations.push({ config: 'dhcp', section: dhcpSection[0], values: changes, deletes: [] })
    }
  } else if (hasDhcp && dhcpSection && !activeServer && dhcpSection[1].ignore !== '1') {
    // Switching a LAN away from static must not leave its DHCP server active.
    mutations.push({ config: 'dhcp', section: dhcpSection[0], values: { ignore: '1' }, deletes: [] })
  }
  return mutations
}
export function stagedChangesPresent(response) {
  if (!response || typeof response !== 'object') return false
  const result = response.changes ?? response
  if (Array.isArray(result)) return result.length > 0
  return Object.values(result).some(x => Array.isArray(x) ? x.length > 0
    : x && typeof x === 'object' ? Object.keys(x).length > 0 : Boolean(x))
}
export async function stageAndApplyInterface(client, mutations) {
  if (!mutations?.length) throw new Error('没有需要应用的配置变更')
  const configs = [...new Set(mutations.map(x => x.config))]
  // Do not overwrite unrelated edits made in the same rpcd UCI session.
  for (const config of configs) {
    const pending = await client.call('uci', 'changes', { config })
    if (stagedChangesPresent(pending)) throw new Error(config + ' 存在尚未应用的其他配置变更，请先在 LuCI 中处理')
  }
  let staged = false
  try {
    for (const mutation of mutations) {
      const { config, section, values, deletes = [] } = mutation
      staged = true
      if (mutation.create) await client.call('uci', 'add', {
        config, type: 'dhcp', name: section, values
      })
      else {
        if (Object.keys(values).length)
          await client.call('uci', 'set', { config, section, values })
        for (const option of deletes)
          await client.call('uci', 'delete', { config, section, option })
      }
    }
  } catch (e) {
    if (staged) for (const config of configs)
      await client.call('uci', 'revert', { config }, true).catch(() => null)
    throw e
  }
  // Intentionally no unconditional commit or non-rollback network reload.
  await client.call('uci', 'apply', { rollback: true, timeout: NETWORK_APPLY_TIMEOUT })
}
export async function confirmInterfaceChanges(client) {
  await client.call('uci', 'confirm', {})
}
export async function rollbackInterfaceChanges(client) {
  await client.call('uci', 'rollback', {})
}
export async function setInterfaceRuntime(client, name, action) {
  if (!validInterfaceName(name) || !['up', 'down'].includes(action))
    throw new Error('不支持的接口运行操作')
  if (action === 'down' && isCriticalInterface(name))
    throw new Error('LAN/WAN 管理关键接口禁止即时断开，请使用带自动回滚的配置方式')
  await client.call('network.interface.' + name, action, {})
}
