/**
 * Device aliases stored by tty228/luci-app-wechatpush.
 * Each entry is "MAC-or-IP Alias with optional spaces".
 */
export const WECHAT_DEVICE_ALIASES_PATH = '/usr/share/wechatpush/api/device_aliases.list'
export const WECHAT_ALIAS_MAX_BYTES = 64 * 1024
const MAC_PATTERN = /^(?:[a-f\d]{2}:){5}[a-f\d]{2}$/i
const HOST_TOKEN = /^\S+$/
function ipv4Valid(value) {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return false
  return value.split('.').every(octet => Number(octet) >= 0 && Number(octet) <= 255 && String(Number(octet)) === octet)
}
function ipv6Valid(value) {
  if (!value.includes(':') || !/^[0-9a-f:]+$/i.test(value) || value.includes(':::')) return false
  const sections = value.split('::')
  if (sections.length > 2) return false
  const groups = sections.flatMap(part => part ? part.split(':') : [])
  if (!groups.every(group => /^[0-9a-f]{1,4}$/i.test(group))) return false
  return sections.length === 2 ? groups.length < 8 : groups.length === 8
}
export function canonicalAliasTarget(value) {
  const target = String(value ?? '').trim()
  if (MAC_PATTERN.test(target)) return target.toUpperCase()
  if (ipv4Valid(target) || ipv6Valid(target)) return target.toLowerCase()
  return ''
}
export function normalizeAliasText(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n')
}
export function readDeviceAliasEntries(text) {
  const entries = []
  normalizeAliasText(text).split('\n').forEach((line, index) => {
    if (!line.trim() || line.trimStart().startsWith('#')) return
    const match = /^\s*(\S+)\s+(.+?)\s*$/.exec(line)
    if (match) entries.push({ target: match[1], alias: match[2], line: index + 1 })
  })
  return entries
}
export function validateDeviceAliasText(text) {
  const contents = normalizeAliasText(text)
  if (new TextEncoder().encode(contents).length > WECHAT_ALIAS_MAX_BYTES) {
    throw new Error('设备别名文件不能超过 64 KB')
  }
  const keys = new Set()
  contents.split('\n').forEach((line, index) => {
    if (!line.trim() || line.trimStart().startsWith('#')) return
    const match = /^\s*(\S+)\s+(.+?)\s*$/.exec(line)
    if (!match) throw new Error('第 ' + (index + 1) + ' 行缺少别名，请输入“MAC/IP 空格 别名”')
    if (!HOST_TOKEN.test(match[1])) throw new Error('第 ' + (index + 1) + ' 行设备地址格式有误')
    const id = match[1].toLowerCase()
    if (keys.has(id)) throw new Error('第 ' + (index + 1) + ' 行设备地址重复：' + match[1])
    keys.add(id)
  })
  return contents.trimEnd() + '\n'
}
export function findDeviceAlias(text, target) {
  const key = String(target ?? '').trim().toLowerCase()
  return readDeviceAliasEntries(text).find(entry => entry.target.toLowerCase() === key)?.alias || ''
}
export function putDeviceAlias(text, rawTarget, rawAlias) {
  const target = canonicalAliasTarget(rawTarget)
  if (!target) throw new Error('请输入有效的 MAC 地址、IPv4 或 IPv6 地址')
  const alias = String(rawAlias ?? '').trim()
  if (!alias || /[\r\n]/.test(alias)) throw new Error('设备别名不能为空或包含换行符')
  const lines = normalizeAliasText(text).split('\n')
  const entries = readDeviceAliasEntries(text)
  const existing = entries.find(entry => entry.target.toLowerCase() === target.toLowerCase())
  if (existing) lines[existing.line - 1] = target + ' ' + alias
  else {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    lines.push(target + ' ' + alias)
  }
  return validateDeviceAliasText(lines.join('\n'))
}
export function deleteDeviceAlias(text, target) {
  const key = String(target ?? '').trim().toLowerCase()
  const entry = readDeviceAliasEntries(text).find(row => row.target.toLowerCase() === key)
  if (!entry) return normalizeAliasText(text)
  const lines = normalizeAliasText(text).split('\n')
  lines.splice(entry.line - 1, 1)
  return validateDeviceAliasText(lines.join('\n'))
}

