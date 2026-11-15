import { CapacitorHttp } from '@capacitor/core'
import { parseMirrorRelease, selectLatestStableRelease } from './appReleases.js'

const MIRROR_API = 'https://update.12130812.xyz/version.json'
const GITHUB_API = 'https://api.github.com/repos/lmdbot/xxwrt-m-custom/releases?per_page=100'

function jsonBody(response, source) {
  let data = response.data
  if (typeof data === 'string') {
    try { data = JSON.parse(data) }
    catch (_) { throw new Error(source + '返回了无效的 JSON') }
  }
  return data
}

async function fetchFromMirror() {
  const response = await CapacitorHttp.get({
    url: MIRROR_API,
    headers: { Accept: 'application/json' },
    connectTimeout: 7000, readTimeout: 12000
  })
  if (response.status !== 200) throw new Error('阿里云更新服务 HTTP ' + response.status)
  return parseMirrorRelease(jsonBody(response, '阿里云更新服务'))
}

async function fetchFromGithub() {
  const response = await CapacitorHttp.get({
    url: GITHUB_API,
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    connectTimeout: 7000, readTimeout: 12000
  })
  if (response.status !== 200) {
    if (response.status === 403 || response.status === 429) throw new Error('GitHub 请求受限，请稍后重试')
    throw new Error('GitHub 请求失败，HTTP ' + response.status)
  }
  const latest = selectLatestStableRelease(jsonBody(response, 'GitHub'))
  return latest ? { ...latest, source: 'github' } : null
}

export async function fetchLatestStableRelease() {
  try {
    return await fetchFromMirror()
  } catch (_) {
    // The mirror may not be configured yet or may be temporarily unavailable.
    // Keep existing installations updatable without making GitHub the default.
    return fetchFromGithub()
  }
}

/**
 * A legacy Aliyun manifest may not include releaseNotes. Fetch ONLY the
 * exact version's notes from GitHub (not GitHub's unrelated latest release).
 * The caller uses this only after checking the mirror's inline notes.
 */
export async function fetchGithubReleaseNotes(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(String(tag || '')))
    throw new Error('版本标签无效，无法查询版本日志')
  const response = await CapacitorHttp.get({
    url: 'https://api.github.com/repos/lmdbot/xxwrt-m-custom/releases/tags/' + tag,
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    connectTimeout: 7000, readTimeout: 12000
  })
  if (response.status !== 200) {
    if (response.status === 403 || response.status === 429)
      throw new Error('GitHub 访问受限，请稍后重试')
    throw new Error('GitHub 版本日志请求失败（HTTP ' + response.status + '）')
  }
  const data = jsonBody(response, 'GitHub 版本日志')
  if (data?.tag_name !== tag || data.draft || data.prerelease)
    throw new Error('GitHub 未返回对应的正式版本日志')
  return typeof data.body === 'string' ? data.body.slice(0, 48000) : ''
}
