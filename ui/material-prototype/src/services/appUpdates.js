import { CapacitorHttp } from '@capacitor/core'
import { selectLatestStableRelease } from './appReleases.js'
const API = 'https://api.github.com/repos/lmdbot/xxwrt-m-custom/releases?per_page=100'
export async function fetchLatestStableRelease() {
  const response = await CapacitorHttp.get({
    url: API,
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    connectTimeout: 7000, readTimeout: 12000
  })
  if (response.status !== 200) {
    if (response.status === 403 || response.status === 429) throw new Error('GitHub 请求受限，请稍后重试')
    throw new Error('GitHub 请求失败，HTTP ' + response.status)
  }
  let data = response.data
  if (typeof data === 'string') {
    try { data = JSON.parse(data) }
    catch (_) { throw new Error('GitHub 返回了无效的 JSON') }
  }
  return selectLatestStableRelease(data)
}
