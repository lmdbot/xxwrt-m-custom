const { test, expect } = require('@playwright/test')
const { version: localAppVersion } = require('../package.json')
async function openAbout(page) {
  await page.goto('/')
  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await page.getByRole('button', { name: '打开关于设置' }).click()
}
test('about displays newer official APK and filters prereleases', async ({ page }) => {
  const tag='v2.21.0',name='XX-WRT-Material-'+tag+'.apk'
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
  await expect(page.getByText('发现新版本 v2.21.0',{exact:false})).toBeVisible()
  await expect(page.getByRole('button',{name:'下载最新 APK'})).toBeEnabled()
  await expect(page.getByText('v'+localAppVersion,{exact:true})).toBeVisible()
})
test('older release does not show update', async ({ page }) => {
  await page.route('https://api.github.com/repos/lmdbot/xxwrt-m-custom/releases?*',route=>
    route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},
      body:JSON.stringify([{tag_name:'v2.0.0',prerelease:false,draft:false,assets:[]}])}))
  await openAbout(page)
  await expect(page.getByText('当前已是最新版')).toBeVisible()
  await expect(page.getByRole('button',{name:'下载最新 APK'})).toHaveCount(0)
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
