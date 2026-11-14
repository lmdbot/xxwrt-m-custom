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
  if (!/^XX-WRT-M-Material-QWRT-v\d+(?:\.\d+){1,2}\.apk$/i.test(name)) return false
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
    const apk = (Array.isArray(release.assets) ? release.assets : [])
      .find(asset => materialApk(release, asset))
    latest = {
      tag: release.tag_name, version: parsed.version,
      title: String(release.name || release.tag_name),
      releaseUrl: String(release.html_url || ''),
      apkUrl: apk?.browser_download_url || '',
      apkName: apk?.name || '', apkSize: Number(apk?.size || 0)
    }
  }
  return latest
}
