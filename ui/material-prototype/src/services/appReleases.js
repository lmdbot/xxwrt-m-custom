export function parseAppVersion(input) {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/i.exec(String(input ?? '').trim())
  if (!match) return null
  const parts = match.slice(1).map(x => BigInt(x ?? '0'))
  return { parts, version: parts.map(String).join('.') }
}
export function compareAppVersions(left, right) {
  const a = parseAppVersion(left), b = parseAppVersion(right)
  if (!a || !b) throw new TypeError('无效版本号：必须是数字段')
  for (let i = 0; i < 3; i++) {
    if (a.parts[i] > b.parts[i]) return 1
    if (a.parts[i] < b.parts[i]) return -1
  }
  return 0
}
function materialApk(release, asset) {
  const name = String(asset?.name || '')
  // Accept the former Material filename for a one-time update migration.
  // New releases and downloads use XX-WRT-Material-vX.Y.Z.apk.
  if (!/^(?:XX-WRT-Material|XX-WRT-M-Material-QWRT)-v\d+(?:\.\d+){1,2}\.apk$/i.test(name)) return false
  if (asset.state && asset.state !== 'uploaded') return false
  try {
    const url = new URL(asset.browser_download_url)
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.port === ''
      && decodeURIComponent(url.pathname) ===
        '/lmdbot/xxwrt-m-custom/releases/download/' + release.tag_name + '/' + name
  } catch (_) { return false }
}
export function selectLatestStableRelease(releases) {
  if (!Array.isArray(releases)) throw new TypeError('GitHub Releases 数据格式不正确')
  let latest = null
  for (const release of releases) {
    if (!release || release.draft || release.prerelease) continue
    const parsed = parseAppVersion(release.tag_name)
    if (!parsed) continue
    if (latest && compareAppVersions(parsed.version, latest.version) <= 0) continue
    const assets = Array.isArray(release.assets) ? release.assets : []
    const matching = assets.filter(asset => materialApk(release, asset))
    // Prefer the canonical new artifact name over the legacy compatibility alias.
    const apk = matching.find(asset => /^XX-WRT-Material-v/i.test(asset.name))
      || matching[0]
    latest = {
      tag: release.tag_name, version: parsed.version,
      title: String(release.name || release.tag_name),
      releaseUrl: String(release.html_url || ''),
      apkUrl: apk?.browser_download_url || '',
      apkName: apk?.name || '', apkSize: Number(apk?.size || 0),
      sha256: /^sha256:[a-f0-9]{64}$/.test(String(apk?.digest || ''))
        ? apk.digest.slice(7) : null
    }
  }
  return latest
}

// The primary update feed is a static JSON file served by the user's HTTPS
// update domain. Never trust arbitrary download URLs from an update manifest.
export function parseMirrorRelease(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.schemaVersion !== 1) {
    throw new TypeError('阿里云版本信息格式不正确')
  }
  const rawVersion = String(data.version ?? '')
  const parsed = parseAppVersion(rawVersion)
  if (!/^\d+\.\d+\.\d+$/.test(rawVersion) || !parsed || parsed.version !== rawVersion
      || data.tag !== 'v' + rawVersion) {
    throw new TypeError('阿里云版本号无效')
  }
  const apkName = 'XX-WRT-Material-v' + rawVersion + '.apk'
  const apkUrl = 'https://update.12130812.xyz/' + apkName
  const releaseUrl = 'https://github.com/lmdbot/xxwrt-m-custom/releases/tag/v' + rawVersion
  const githubApkUrl = 'https://github.com/lmdbot/xxwrt-m-custom/releases/download/v' + rawVersion + '/' + apkName
  if (data.apkName !== apkName || data.apkUrl !== apkUrl
      || data.releaseUrl !== releaseUrl || data.githubApkUrl !== githubApkUrl
      || !Number.isSafeInteger(data.apkSize) || data.apkSize <= 0
      || typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256)) {
    throw new TypeError('阿里云 APK 信息无效')
  }
  return {
    tag: data.tag, version: rawVersion,
    title: String(data.title || 'XX-WRT管理器 v' + rawVersion),
    releaseUrl, apkUrl, apkName, apkSize: data.apkSize,
    sha256: data.sha256, githubApkUrl, source: 'mirror'
  }
}
