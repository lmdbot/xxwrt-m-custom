/**
 * OpenWrt firewall status is defined by kernel rules, not a long-running
 * procd process. fw4 loads rules into nftables and exits.
 *
 * Use the same read-only command and arguments permitted by the standard
 * LuCI luci-mod-status-firewall RPC ACL. Never broaden ACLs or use a shell.
 */
export const FIREWALL_NFT_COMMAND = Object.freeze({
  command: '/usr/sbin/nft',
  params: ['--terse', '--json', 'list', 'ruleset'],
  env: null
})
export const FIREWALL_LEGACY_COMMAND = Object.freeze({
  command: '/usr/sbin/iptables-save',
  params: [],
  env: null
})

function validExecResult(result) {
  return result && Number(result.code) === 0 && typeof result.stdout === 'string'
}
function natKind(text) {
  if (/"(?:fullcone|fullcone-nat)"|\bfullcone\b/i.test(text)) return 'Full Cone NAT'
  if (/"masquerade"|\bMASQUERADE\b/i.test(text)) return '普通源地址转换'
  return '未检测到 NAT 规则'
}

/** Return null unless nft produced a complete, valid JSON ruleset. */
export function parseNftFirewall(result) {
  if (!validExecResult(result)) return null
  try {
    const parsed = JSON.parse(result.stdout)
    if (!Array.isArray(parsed?.nftables)) return null
    const rules = parsed.nftables
    const fw4 = obj => obj?.family === 'inet' && obj?.table === 'fw4'
    const table = rules.some(item => item?.table?.family === 'inet' && item.table.name === 'fw4')
    const baseChains = rules.filter(item => fw4(item?.chain) &&
      ['input', 'forward', 'output'].includes(item.chain.hook))
    const loaded = table && baseChains.length >= 2
    const ownRules = rules.filter(item => fw4(item?.rule))
    return {
      readable: true,
      loaded,
      nat: loaded ? natKind(JSON.stringify(ownRules)) : null
    }
  } catch {
    return null
  }
}

/** fw3 uses iptables chains, and iptables-save is read-only. */
export function parseLegacyFirewall(result) {
  if (!validExecResult(result)) return null
  const output = result.stdout
  if (!/^\*filter\s*$/m.test(output) || !/^COMMIT\s*$/m.test(output)) return null
  const loaded = /^:zone_[A-Za-z0-9_-]+_(?:input|output|forward|src|dest)(?:\s|$)/m.test(output)
  return {
    readable: true, loaded,
    nat: loaded ? natKind(output) : null
  }
}

export async function probeFirewallRuntime(client) {
  // LuCI firewall status ACL permits the exact --terse --json query, whereas
  // 'nft list table inet fw4' can be denied even to authorized LuCI users.
  let nftResult = null
  try {
    nftResult = await client.call('file', 'exec', FIREWALL_NFT_COMMAND, true)
  } catch { /* Unavailable / forbidden: do not fabricate stopped state. */ }
  const nft = parseNftFirewall(nftResult)
  if (nft?.loaded) {
    return { state: 'loaded', backend: 'fw4', nat: nft.nat }
  }

  // Support pre-fw4 OpenWrt without treating its absent nft table as stopped.
  let legacyResult = null
  try {
    legacyResult = await client.call('file', 'exec', FIREWALL_LEGACY_COMMAND, true)
  } catch { /* Permission denial is unknown, never offline. */ }
  const legacy = parseLegacyFirewall(legacyResult)
  if (legacy?.loaded) {
    return { state: 'loaded', backend: 'fw3', nat: legacy.nat }
  }
  if (nft?.readable && legacy?.readable) {
    return { state: 'not-loaded', backend: '', nat: null }
  }
  return { state: 'unknown', backend: '', nat: null }
}

export function firewallStatusPresentation(runtime, configured, bootService) {
  if (!configured) return {
    label: '配置不可读', color: 'warning', text: '无法读取防火墙配置，请检查 UCI 读取权限'
  }
  const bootNote = bootService?.enabled === false ? '；开机启动已禁用' : ''
  if (runtime?.state === 'loaded') {
    const backend = runtime.backend === 'fw3' ? 'fw3 / iptables' : 'fw4 / nftables'
    return {
      label: '规则已加载', color: 'success',
      text: '已在内核检测到防火墙规则（' + backend + '）' + bootNote
    }
  }
  if (runtime?.state === 'not-loaded') return {
    label: '未检测到规则', color: 'warning',
    text: '内核中未检测到 OpenWrt 防火墙规则，请在路由器 LuCI 检查防火墙状态' + bootNote
  }
  return {
    label: '无法核实', color: 'secondary',
    text: '已读取防火墙配置，但无法读取内核运行规则（可能是权限不足或命令不可用）；可在路由器 LuCI「状态 → 防火墙」核实' + bootNote
  }
}
