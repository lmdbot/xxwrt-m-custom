// OpenWrt package manager: only fixed opkg commands, never shell interpolation.
// QWRT uses opkg and .ipk; unsupported apk-based firmware is reported explicitly.
export const PACKAGE_PAGE_SIZE = 100
const COMMANDS = ['/bin/opkg', '/usr/bin/opkg']
export const PACKAGE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9+_.-]{0,127}$/
export function validatePackageName(name) {
  const value = String(name || '').trim()
  if (!PACKAGE_NAME_RE.test(value)) throw new Error('软件包名称不合法；只允许字母、数字、+、_、. 和 -')
  return value
}
export function parseOpkgList(output) {
  const rows = []
  for (const line of String(output || '').split(/\r?\n/)) {
    const parts = line.split(' - ')
    if (parts.length < 2 || !parts[0]) continue
    rows.push({ name: parts[0].trim(), version: (parts[1] || '').trim(),
      description: parts.slice(2).join(' - ').trim() })
  }
  return rows
}
export function parseOpkgStatus(output) {
  return String(output || '').split(/\n\s*\n/).flatMap(block => {
    const fields = {}
    let previous = ''
    for (const line of block.split(/\r?\n/)) {
      if (/^\s/.test(line) && previous) { fields[previous] += ' ' + line.trim(); continue }
      const pos = line.indexOf(':')
      if (pos < 1) continue
      previous = line.slice(0, pos)
      fields[previous] = line.slice(pos + 1).trim()
    }
    if (!fields.Package) return []
    return [{ name: fields.Package, version: fields.Version || '',
      description: fields.Description || '', status: fields.Status || '',
      size: Number(fields['Installed-Size'] || 0), architecture: fields.Architecture || '' }]
  }).filter(row => /installed/.test(row.status))
}
export function parseUpgradable(output) {
  return parseOpkgList(output).map(row => ({ ...row, installedVersion: row.version.split(' ')[0] }))
}
export function filterPackageList(rows, search = '', page = 1, pageSize = PACKAGE_PAGE_SIZE) {
  const term = String(search || '').trim().toLowerCase()
  const filtered = term ? rows.filter(row => [row.name, row.version, row.description]
    .some(value => String(value || '').toLowerCase().includes(term))) : rows
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)))
  return { items: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    page: safePage, pages, total: filtered.length }
}
export function validateOpkgUrl(raw) {
  const value = String(raw || '').trim()
  let url
  try { url = new URL(value) } catch { throw new Error('请输入合法的 HTTPS 软件包 URL') }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      !/\.ipk$/i.test(url.pathname)) throw new Error('只支持 HTTPS 地址的 .ipk 软件包')
  return url.href
}
export function validateConfigPath(path) {
  if (!['/etc/opkg.conf', '/etc/opkg/distfeeds.conf', '/etc/opkg/customfeeds.conf'].includes(path))
    throw new Error('不允许修改此配置路径')
  return path
}
export function validateFeedConfig(content) {
  const data = String(content || '')
  if (data.length > 65536 || data.includes('\0')) throw new Error('配置文件过大或包含无效字符')
  for (const line of data.split(/\r?\n/)) {
    const value = line.trim()
    if (!value || value.startsWith('#')) continue
    if (!/^(src(?:\/gz)?|dest|lists_dir|option|arch)\s+\S+/.test(value))
      throw new Error('配置文件包含未知的 opkg 指令')
  }
  return data
}
async function exec(client, args, { timeout = 120000 } = {}) {
  // file.exec is an optional rpcd ACL: do not silently claim success.
  const command = COMMANDS[0]
  const payload = { command, params: args, env: null }
  const response = typeof client.callLong === 'function'
    ? await client.callLong('file', 'exec', payload, timeout)
    : await client.call('file', 'exec', payload)
  if (!response || typeof response.code !== 'number')
    throw new Error('路由器未返回 opkg 执行结果；检查 rpcd file.exec 权限')
  if (response.code !== 0) throw new Error((response.stderr || response.stdout || 'opkg 操作失败').slice(-1600))
  return String(response.stdout || '')
}
export async function readPackageList(client, type = 'available') {
  if (type === 'installed') return parseOpkgStatus(await readFile(client, '/usr/lib/opkg/status'))
  if (type === 'upgradable') return parseOpkgList(await exec(client, ['list-upgradable']))
  if (type !== 'available') throw new Error('未知软件包列表类型')
  return parseOpkgList(await exec(client, ['list']))
}
export async function runPackageAction(client, action, packageName = '') {
  const commands = { update: ['update'], install: ['install', validatePackageName(packageName)],
    remove: ['remove', validatePackageName(packageName)],
    upgrade: ['upgrade', validatePackageName(packageName)] }
  if (!Object.prototype.hasOwnProperty.call(commands, action)) throw new Error('不支持的软件包操作')
  return exec(client, commands[action], { timeout: 180000 })
}
export async function readFile(client, path) {
  const result = await client.call('file', 'read', { path })
  if (typeof result?.data !== 'string') throw new Error('读取路由器文件失败：' + path)
  return result.data
}
export async function readOpkgConfig(client, path) {
  return readFile(client, validateConfigPath(path))
}
export async function saveOpkgConfig(client, path, content) {
  validateConfigPath(path)
  const data = validateFeedConfig(content)
  const old = await readFile(client, path)
  if (old === data) return false
  // Save the original configuration to a backup before modifying feeds.
  await client.call('file', 'write', { path: path + '.bak', data: old, mode: 384 })
  await client.call('file', 'write', { path, data, mode: 384 })
  return true
}
export async function readDiskSpace(client) {
  const data = await client.call('file', 'exec', { command: '/bin/df', params: ['-k', '/overlay'], env: null })
  const parts = String(data?.stdout || '').trim().split(/\r?\n/).at(-1)?.trim().split(/\s+/) || []
  if (parts.length < 5) return null
  return { totalKiB: Number(parts[1]), usedKiB: Number(parts[2]), freeKiB: Number(parts[3]) }
}
export async function installPackageUrl(client, url) {
  return exec(client, ['install', validateOpkgUrl(url)], { timeout: 180000 })
}

export async function uploadPackageFile(client, file) {
  if (!file || !/\.ipk$/i.test(file.name)) throw new Error('请选择 .ipk 安装包')
  if (file.size <= 0 || file.size > 8 * 1024 * 1024)
    throw new Error('上传文件大小须在 0～8 MiB 之间')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 16384) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384))
  }
  const path = '/tmp/xxwrt-package-' + Date.now() + '.ipk'
  // rpcd file.write accepts base64:true and decodes data into binary bytes.
  await client.call('file', 'write', { path, data: btoa(binary), base64: true, mode: 384 })
  try {
    return await exec(client, ['install', path], { timeout: 180000 })
  } finally {
    try { await client.call('file', 'remove', { path }) } catch { /* temporary file may remain until reboot */ }
  }
}
