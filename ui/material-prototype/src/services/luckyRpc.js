/**
 * Lucky LuCI bridge. Uses only the installed plugin's fixed, ACL-scoped
 * helper commands. No arbitrary shell commands or guessed configuration paths.
 * Interface matches gdy666/luci-app-lucky (3.1+ access-rule editors).
 */
const CALL = '/usr/libexec/lucky-call'
const BACKUP = '/usr/libexec/lucky-backup'
const WATCHDOG = '/usr/libexec/lucky-watchdog'
const CORE_OPERATIONS = new Set(['core-status', 'core-fix', 'core-info', 'core-base'])
const RULE_OPERATIONS = new Set(['rules-localips', 'rules-allowlist'])
const RULE_TOKEN_OPERATIONS = new Set(['rules-save', 'cleanup'])
const SERVICE_OPERATIONS = new Set(['start', 'stop', 'restart'])

export const LUCKY_DEFAULT_LOCALIPS = '10.0.0.0/8\n172.16.0.0/12\n169.254.0.0/16\n192.168.0.0/16\n'
export const LUCKY_RULE_LIMIT = 65536

export function luckyVersionAtLeast(version, major, minor, patch = 0) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:$|[-+])/.exec(String(version || ''))
  if (!match) return false
  const actual = match.slice(1, 4).map(Number)
  const desired = [major, minor, patch]
  for (let index = 0; index < 3; index++) {
    if (actual[index] !== desired[index]) return actual[index] > desired[index]
  }
  return true
}

export function luckyRuleBytes(content) {
  return new TextEncoder().encode(String(content)).length
}

export function normalizeLuckyRules(content) {
  const value = String(content || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (luckyRuleBytes(value) > LUCKY_RULE_LIMIT) throw new Error('文件内容超过 64 KiB，请删减后保存')
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new Error('文件包含不允许的控制字符')
  // Actual IP/CIDR semantics are validated by the Lucky LuCI backend.
  return value
}

export function luckyToken(value) {
  if (!/^[a-f0-9]{32}$/.test(String(value || ''))) throw new Error('Lucky 临时会话无效，请重新读取文件')
  return String(value)
}

export function parseLuckyReply(text, source = 'Lucky') {
  let value
  try { value = JSON.parse(String(text || '')) }
  catch { throw new Error(source + ' 未返回有效 JSON，请检查 Lucky LuCI 插件版本') }
  if (!value || typeof value !== 'object' || value.ok !== true) {
    throw new Error(String(value?.error || source + ' 操作失败').slice(0, 250))
  }
  return value
}

async function exec(client, command, params) {
  const result = await client.call('file', 'exec', { command, params, env: null }, true)
  if (!result) throw new Error('路由器未授权 Lucky 管理脚本的 RPC 执行，请检查 luci-app-lucky 权限')
  if (Number(result.code ?? -1) !== 0) {
    throw new Error('Lucky 操作失败：' + String(result.stderr || result.stdout || '命令返回异常').slice(0, 250))
  }
  return String(result.stdout || '').trim()
}

export async function luckyCore(client, operation = 'core-status') {
  if (!CORE_OPERATIONS.has(operation)) throw new Error('不支持的 Lucky 内核操作')
  return parseLuckyReply(await exec(client, BACKUP, [operation]), 'Lucky 内核')
}

export async function luckyService(client, action) {
  if (!SERVICE_OPERATIONS.has(action)) throw new Error('不支持的 Lucky 服务操作')
  return exec(client, CALL, ['service', action])
}

export async function luckyStatus(client) {
  const status = await exec(client, CALL, ['status'])
  if (status !== 'true' && status !== 'false') throw new Error('Lucky 服务状态不可识别')
  return status === 'true'
}

export async function luckyArch(client) {
  return exec(client, CALL, ['arch'])
}

export async function luckyWatchdog(client, action = 'status') {
  if (!['status', 'enable', 'disable'].includes(action)) throw new Error('不支持的 Lucky 恢复操作')
  return parseLuckyReply(await exec(client, WATCHDOG, [action]), 'Lucky 意外退出恢复')
}

export async function luckyRulesOpen(client, type) {
  if (!['localips', 'allowlist'].includes(type)) throw new Error('不支持的 Lucky 规则文件')
  const operation = 'rules-' + type
  if (!RULE_OPERATIONS.has(operation)) throw new Error('不支持的 Lucky 规则操作')
  const result = parseLuckyReply(await exec(client, BACKUP, [operation]), 'Lucky 规则')
  luckyToken(result.token)
  if (typeof result.content !== 'string' || !result.directory ||
      result.name !== (type === 'localips' ? 'localips' : 'ip-allowlist.txt')) {
    throw new Error('Lucky 规则读取响应不完整')
  }
  return result
}

export async function luckyRulesSave(client, token, content) {
  const safeToken = luckyToken(token)
  const value = normalizeLuckyRules(content)
  const path = '/tmp/lucky-luci-backup/' + safeToken + '/rules.json'
  // The LuCI package's ACL authorizes only this private workspace path.
  await client.call('file', 'write', { path, data: JSON.stringify({ content: value }) })
  const result = await luckyArchive(client, 'rules-save', safeToken)
  return result
}

export async function luckyArchive(client, operation, token) {
  if (!RULE_TOKEN_OPERATIONS.has(operation)) throw new Error('不支持的 Lucky 维护操作')
  return parseLuckyReply(await exec(client, BACKUP, [operation, luckyToken(token)]), 'Lucky 维护')
}
