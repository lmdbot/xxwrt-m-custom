const { test, expect } = require('@playwright/test')
const { version: localAppVersion } = require('../package.json')
const nextAppVersion = localAppVersion.replace(/(\d+)$/, patch => String(Number(patch) + 1))
async function openAbout(page) {
  await page.goto('/')
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.locator('.v3-me-about-entry').click()
}
test('about displays newer official APK and filters prereleases', async ({ page }) => {
  const tag='v'+nextAppVersion,name='XX-WRT-Material-'+tag+'.apk'
  await page.route('https://update.12130812.xyz/version.json',route=>
    route.fulfill({status:503,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},body:'{}'}))
  await page.route('https://api.github.com/repos/lmdbot/xxwrt-m-custom/releases?*',route=>
    route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},
      body:JSON.stringify([
        {tag_name:'material-wrt-v99.0.0',prerelease:true,draft:false,assets:[]},
        {tag_name:'v2.3.0',prerelease:false,draft:false,assets:[]},
        {tag_name:tag,prerelease:false,draft:false,assets:[{
          name,state:'uploaded',browser_download_url:
            'https://github.com/lmdbot/xxwrt-m-custom/releases/download/'+tag+'/'+name
        }]}
      ])}))
  await openAbout(page)
  await expect(page.getByText('发现新版本 v'+nextAppVersion,{exact:false})).toBeVisible()
  await expect(page.getByRole('button',{name:'下载 APK'})).toBeEnabled()
  await expect(page.getByText('v'+localAppVersion,{exact:true}).first()).toBeVisible()
})
test('older release does not show update', async ({ page }) => {
  await page.route('https://update.12130812.xyz/version.json',route=>
    route.fulfill({status:503,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},body:'{}'}))
  await page.route('https://api.github.com/repos/lmdbot/xxwrt-m-custom/releases?*',route=>
    route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},
      body:JSON.stringify([{tag_name:'v2.0.0',prerelease:false,draft:false,assets:[]}])}))
  await openAbout(page)
  await expect(page.getByText('当前已是最新版')).toBeVisible()
  await expect(page.getByRole('button',{name:'下载 APK'})).toHaveCount(0)
})

test('about opens MIT and third-party licensing information offline', async ({ page }) => {
  await openAbout(page)
  await page.getByRole('button', { name: '查看开源许可证' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('XX-WRT Material 原创代码依据 MIT License')).toBeVisible()
  await expect(dialog.getByText('主要第三方运行依赖')).toBeVisible()
  await expect(dialog.getByText('Apache ECharts')).toBeVisible()
  await dialog.getByText('MIT License · 项目原创部分').click()
  await expect(dialog.getByText('Copyright (c) 2026 lmdbot')).toBeVisible()
  await dialog.getByRole('button', { name: '关闭开源许可证' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('关于')
})


test('Aliyun static manifest is preferred over GitHub API', async ({ page }) => {
  const version=nextAppVersion, tag='v'+version, name='XX-WRT-Material-'+tag+'.apk'
  let githubCalls=0
  await page.route('https://api.github.com/repos/lmdbot/xxwrt-m-custom/releases?*', route => {
    githubCalls++
    return route.fulfill({status:500,body:'unexpected GitHub fallback'})
  })
  await page.route('https://update.12130812.xyz/version.json',route=>
    route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},
      body:JSON.stringify({
        schemaVersion:1,version,tag,title:'XX-WRT管理器 '+tag,
        apkName:name,apkUrl:'https://update.12130812.xyz/'+name,
        releaseUrl:'https://github.com/lmdbot/xxwrt-m-custom/releases/tag/'+tag,
        githubApkUrl:'https://github.com/lmdbot/xxwrt-m-custom/releases/download/'+tag+'/'+name,
        apkSize:7115152,sha256:'a'.repeat(64)
      })}))
  await openAbout(page)
  await expect(page.getByText('发现新版本 v'+nextAppVersion,{exact:false})).toBeVisible()
  await expect(page.getByText('阿里云',{exact:true})).toBeVisible()
  expect(githubCalls).toBe(0)
})

test('version changelog displays Aliyun manifest notes without requesting GitHub', async ({ page }) => {
  const version = '3.0.1', tag = 'v' + version, name = 'XX-WRT-Material-' + tag + '.apk'
  let githubCalls = 0
  await page.route('https://api.github.com/repos/lmdbot/xxwrt-m-custom/releases**', route => {
    githubCalls++
    return route.fulfill({ status: 500, body: 'GitHub should not be used' })
  })
  await page.route('https://update.12130812.xyz/version.json', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        schemaVersion: 1, version, tag, title: 'XX-WRT管理器 ' + tag,
        apkName: name, apkUrl: 'https://update.12130812.xyz/' + name,
        releaseUrl: 'https://github.com/lmdbot/xxwrt-m-custom/releases/tag/' + tag,
        githubApkUrl: 'https://github.com/lmdbot/xxwrt-m-custom/releases/download/' + tag + '/' + name,
        apkSize: 7115152, sha256: 'a'.repeat(64),
        releaseNotes: '# v3.0.1\n## 新功能\n- 阿里云变更日志'
      })
    }))
  await openAbout(page)
  await expect(page.getByText('阿里云', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '版本日志' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('阿里云变更日志')).toBeVisible()
  await expect(dialog.getByText('新功能', { exact: true })).toBeVisible()
  expect(githubCalls).toBe(0)
  await dialog.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByRole('button', { name: '查看问题与反馈（Issues）' })).toBeVisible()
})

test('legacy Aliyun manifest fetches exact-tag changelog from GitHub', async ({ page }) => {
  const version = '3.0.1', tag = 'v' + version, name = 'XX-WRT-Material-' + tag + '.apk'
  let tagCalls = 0
  await page.route('https://update.12130812.xyz/version.json', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        schemaVersion: 1, version, tag, title: 'XX-WRT管理器 ' + tag,
        apkName: name, apkUrl: 'https://update.12130812.xyz/' + name,
        releaseUrl: 'https://github.com/lmdbot/xxwrt-m-custom/releases/tag/' + tag,
        githubApkUrl: 'https://github.com/lmdbot/xxwrt-m-custom/releases/download/' + tag + '/' + name,
        apkSize: 7115152, sha256: 'a'.repeat(64)
      })
    }))
  await page.route('https://api.github.com/repos/lmdbot/xxwrt-m-custom/releases/tags/*', route => {
    tagCalls++
    return route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        tag_name: tag, draft: false, prerelease: false,
        body: '## 修复\n- GitHub 对应版本备用变更日志'
      })
    })
  })
  await openAbout(page)
  await expect(page.getByText('阿里云', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '版本日志' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('GitHub 对应版本备用变更日志')).toBeVisible()
  await expect(dialog.getByText(/GitHub 备用/)).toBeVisible()
  expect(tagCalls).toBe(1)
})
