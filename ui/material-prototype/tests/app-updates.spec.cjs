const { test, expect } = require('@playwright/test')
async function openAbout(page) {
  await page.goto('/')
  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await page.getByRole('button', { name: '打开关于设置' }).click()
}
test('about displays newer official APK and filters prereleases', async ({ page }) => {
  const tag='v2.21.0',name='XX-WRT-M-Material-QWRT-'+tag+'.apk'
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
  await expect(page.getByText('v2.0.1',{exact:true})).toBeVisible()
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
