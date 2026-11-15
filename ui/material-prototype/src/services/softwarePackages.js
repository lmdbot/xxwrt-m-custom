/**
 * OpenWrt LuCI package-manager bridge.
 *
 * Never invoke a shell with untrusted input. Only run the package-manager-call
 * executable shipped with LuCI; rpcd enforces the user's existing file.exec ACL.
 * Files uploaded through rpcd are decoded via its built-in base64 flag.
 */
export const PACKAGE_CALL = '/usr/libexec/package-manager-call'
export const PACKAGE_PAGE_SIZE = 100
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024
const SAFE_PACKAGE = /^[A-Za-z0-9][A-Za-z0-9.+_@:-]{0,127}$/
export const PACKAGE_CONFIGS = Object.freeze({
  opkg: ['/etc/opkg.conf', '/etc/opkg/distfeeds.conf', '/etc/opkg/customfeeds.conf'],
  apk: ['/etc/apk/repositories', '/etc/apk/repositories.d/distfeeds.list', '/etc/apk/repositories.d/customfeeds.list']
})
const ACTIONS = new Set(['list-available', 'list-installed', 'update', 'install', 'upgrade', 'remove'])
const MUTATIONS = new Set(['update', 'install', 'upgrade', 'remove'])
const stringify = value => String(value ?? '')

export function validatePackageTarget(value, { allowUrl = false, manager = 'opkg' } = {}) {
  const target = stringify(value).trim()
  if (!target || target.length > 2048 || /[\u0000-\u001f\u007f]/.test(target))
    throw new Error('请输入合法的软件包名称或 HTTPS 地址')
  if (SAFE_PACKAGE.test(target) && !target.startsWith('-')) return target
  if (target === '/tmp/upload.ipk' && manager === 'opkg') return target
  if (target === '/tmp/upload.apk' && manager === 'apk') return target
  if (allowUrl && /^https:\/\//i.test(target)) {
    let url
    try { url = new URL(target) } catch (_) { throw new Error('软件包下载地址格式不正确') }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port)
      throw new Error('仅支持无账号密码、无自定义端口的 HTTPS 地址')
    if (manager === 'apk')
      throw new Error('该 apk 后端不支持直接安装 URL，请下载 APK 文件后使用“上传软件包”')
    if (!/\.ipk(?:$|[?#])/i.test(target))
      throw new Error('URL 应指向 .ipk 软件包文件')
    return target
  }
  throw new Error('软件包名称只能包含字母、数字、点、下划线、加号及连字符')
}

function parseControlParagraphs(input, installed = false) {
  const result = []
  let block = {}
  let previous = ''
  function finish() {
    if (block.Package && block.Version) {
      const size = Number(block.Size || block['Installed-Size'] || 0)
      result.push({
        name: block.Package, version: block.Version,
        description: block.Description || '',
        size: Number.isFinite(size) ? size : 0,
        architecture: block.Architecture || '',
        installed: installed || /\binstalled\b/.test(block.Status || '')
      })
    }
    block = {}; previous = ''
  }
  const raw = stringify(input).replace(/\r\n/g, '\n')
  for (const line of raw.split('\n')) {
    if (!line.trim()) { if (Object.keys(block).length) finish(); continue }
    if (/^\s/.test(line) && previous) {
      block[previous] = (block[previous] || '') + '\n' + line.trim()
      continue
    }
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (match) { block[match[1]] = match[2]; previous = match[1] }
  }
  if (Object.keys(block).length) finish()
  return result
}

function parseApkRecords(data, installed) {
  const entries = Array.isArray(data) ? data :
    Array.isArray(data?.packages) ? data.packages :
    Array.isArray(data?.results) ? data.results : []
  return entries.map(item => {
    const pkg = item?.package || item
    const name = pkg?.name ?? pkg?.package ?? pkg?.Package
    const version = pkg?.version ?? pkg?.Version
    const size = Number(pkg?.size ?? pkg?.installed_size ?? pkg?.download_size ?? 0)
    return {
      name: stringify(name), version: stringify(version),
      description: stringify(pkg?.description ?? pkg?.summary ?? pkg?.Description),
      size: Number.isFinite(size) && size >= 0 ? size : 0,
      architecture: stringify(pkg?.architecture ?? pkg?.arch),
      installed
    }
  }).filter(p => p.name && p.version)
}

export function parsePackageList(raw, installed = false) {
  const text = stringify(raw).trim()
  if (!text) return []
  if (text.startsWith('[') || text.startsWith('{')) {
    let parsed
    try { parsed = JSON.parse(text) } catch (_) { throw new Error('路由器返回的软件包 JSON 不完整') }
    return parseApkRecords(parsed, installed)
  }
  return parseControlParagraphs(text, installed)
}

// OpenWrt versions may contain epochs and release suffixes. This comparison
// is for display only: the backend package manager makes final decisions.
export function comparePackageVersions(left, right) {
  function parts(input) {
    const val = stringify(input)
    const epoch = /^(\d+):/.exec(val)
    const rest = epoch ? val.slice(epoch[0].length) : val
    return { epoch: BigInt(epoch?.[1] || 0), tokens: rest.match(/~|\d+|[A-Za-z]+|[^A-Za-z0-9~]+/g) || [] }
  }
  const a = parts(left), b = parts(right)
  if (a.epoch !== b.epoch) return a.epoch > b.epoch ? 1 : -1
  for (let i = 0; i < Math.max(a.tokens.length, b.tokens.length); i++) {
    const x = a.tokens[i], y = b.tokens[i]
    if (x === y) continue
    if (x === '~') return -1
    if (y === '~') return 1
    if (x == null) return -1
    if (y == null) return 1
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y)
    if (xn && yn) { const xx = BigInt(x), yy = BigInt(y); if (xx !== yy) return xx > yy ? 1 : -1 }
    else if (xn !== yn) return xn ? 1 : -1
    else { const z = x.localeCompare(y, 'en', { sensitivity: 'base' }); if (z) return z > 0 ? 1 : -1 }
  }
  return 0
}

export function packageCollections(available, installed) {
  const installedByName = new Map(installed.map(p => [p.name, p]))
  const availableByName = new Map()
  for (const item of available) {
    const former = availableByName.get(item.name)
    if (!former || comparePackageVersions(item.version, former.version) > 0)
      availableByName.set(item.name, item)
  }
  const updates = [...availableByName.values()].filter(item => {
    const current = installedByName.get(item.name)
    return current && comparePackageVersions(item.version, current.version) > 0
  }).map(item => ({ ...item, currentVersion: installedByName.get(item.name).version }))
  const sort = items => items.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  return {
    available: sort([...availableByName.values()].map(p => ({ ...p, installed: installedByName.has(p.name) }))),
    installed: sort([...installedByName.values()]),
    updates: sort(updates)
  }
}

export function visiblePackages(items, filter, translations = 'filtered') {
  const term = stringify(filter).trim().toLowerCase()
  return items.filter(item => {
    const lang = /^luci-i18n-.*-([a-z]{2}(?:-[a-z]{2})?)$/i.exec(item.name)?.[1]?.toLowerCase()
    if (lang && (translations === 'none' ||
        (translations === 'filtered' && !['zh-cn', 'zh-hans', 'en'].includes(lang)))) return false
    return !term || [item.name, item.version, item.description].some(value =>
      stringify(value).toLowerCase().includes(term))
  })
}

async function callWithTimeout(client, args, timeout) {
  if (typeof client.callTimed === 'function')
    return client.callTimed('file', 'exec', args, timeout)
  return client.call('file', 'exec', args)
}

export async function runPackageAction(client, action, targets = [], manager = 'opkg') {
  if (!ACTIONS.has(action)) throw new Error('不支持的软件包操作')
  if (!Array.isArray(targets) || targets.length > 200) throw new Error('软件包数量超出限制')
  if (['install', 'upgrade', 'remove'].includes(action) && !targets.length && action !== 'upgrade')
    throw new Error('请选择操作的软件包')
  if (!['install', 'upgrade', 'remove'].includes(action) && targets.length)
    throw new Error('此操作不接受软件包参数')
  const safeTargets = targets.map(target =>
    validatePackageTarget(target, { allowUrl: action === 'install', manager }))
  const response = await callWithTimeout(client, {
    command: PACKAGE_CALL, params: [action, ...safeTargets], env: null
  }, MUTATIONS.has(action) ? 180000 : 90000)
  if (!response || typeof response.stdout !== 'string')
    throw new Error('路由器未返回软件包工具输出；请确认已安装 LuCI 软件包管理器并授权 file.exec')
  if (Number(response.code ?? 0) !== 0)
    throw new Error('软件包工具执行失败：' + (response.stderr || response.stdout || response.code))
  let output = { code: 0, stdout: response.stdout, stderr: stringify(response.stderr) }
  if (MUTATIONS.has(action)) {
    try { output = JSON.parse(response.stdout.trim()) }
    catch (_) { throw new Error('软件包操作未返回合法执行结果，可能仍在运行，请先刷新列表确认') }
    if (Number(output.code) !== 0)
      throw new Error('操作失败（退出码 ' + output.code + '）：' + (output.stderr || output.stdout || '无详细信息'))
  }
  return output
}

export async function readPackageConfigs(client, manager) {
  const files = PACKAGE_CONFIGS[manager] || PACKAGE_CONFIGS.opkg
  return Promise.all(files.map(async path => {
    try {
      const result = await client.call('file', 'read', { path })
      return { path, content: stringify(result?.data), exists: true }
    } catch (_) { return { path, content: '', exists: false } }
  }))
}

export async function savePackageConfig(client, manager, path, content) {
  if (!PACKAGE_CONFIGS[manager]?.includes(path)) throw new Error('不允许修改该配置文件')
  const normalized = stringify(content).replace(/\r\n/g, '\n')
  if (new TextEncoder().encode(normalized).length > 64 * 1024)
    throw new Error('配置文件不能超过 64 KiB')
  const result = await client.call('file', 'write', { path, data: normalized })
  if (result?.error) throw new Error(stringify(result.error))
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}

export async function uploadLocalPackage(client, file, manager = 'opkg', onProgress = () => {}) {
  const ext = manager === 'apk' ? '.apk' : '.ipk'
  if (!file || !stringify(file.name).toLowerCase().endsWith(ext))
    throw new Error('请选择 ' + ext + ' 格式的软件包')
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_UPLOAD_BYTES)
    throw new Error('文件必须小于 32 MiB 且不能为空')
  const path = '/tmp/upload' + ext
  const chunk = 96 * 1024
  try {
    for (let pos = 0; pos < file.size; pos += chunk) {
      const bytes = new Uint8Array(await file.slice(pos, pos + chunk).arrayBuffer())
      const res = await client.call('file', 'write', {
        path, data: bytesToBase64(bytes), base64: true, append: pos > 0, mode: 384
      })
      if (res?.error) throw new Error(stringify(res.error))
      onProgress(Math.round(Math.min(file.size, pos + bytes.length) / file.size * 100))
    }
    return path
  } catch (error) {
    await client.call('file', 'remove', { path }, true).catch(() => {})
    throw error
  }
}

export async function deleteUploadedPackage(client, manager = 'opkg') {
  const path = '/tmp/upload' + (manager === 'apk' ? '.apk' : '.ipk')
  await client.call('file', 'remove', { path }, true).catch(() => {})
}
