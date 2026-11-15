const { test, expect } = require('@playwright/test')

test('sidebar language selection switches immediately and survives restart', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByRole('heading', { name: '设备列表' })).toBeVisible()

  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await page.getByRole('button', { name: '打开语言设置' }).click()
  await expect(page.getByText('应用语言')).toBeVisible()
  await page.getByRole('radio', { name: 'English' }).check()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('Language')
  await expect(page.getByText('Choose the app language. Changes take effect immediately.')).toBeVisible()
  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem('xxwrt_material_language'))).toBe('en')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { name: 'Device list' })).toBeVisible()
  await page.getByRole('button', { name: 'Open sidebar menu' }).click()
  await page.locator('.settings-category-card').filter({ hasText: 'Language' }).click()
  await page.getByRole('radio', { name: '繁體中文' }).check()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await expect(page.getByText('應用語言')).toBeVisible()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await expect(page.getByRole('heading', { name: '設備列表' })).toBeVisible()
  await page.getByRole('button', { name: '打開側欄菜單' }).click()
  await page.locator('.settings-category-card').filter({ hasText: '語言' }).click()
  await page.getByRole('radio', { name: '简体中文' }).check()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByText('应用语言')).toBeVisible()
})

test('English also localizes dropdowns and notification overlays created after changing language', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await page.getByRole('button', { name: '打开语言设置' }).click()
  await page.getByRole('radio', { name: 'English' }).check()

  // Vuetify teleports dialogs, select menus and snackbars to document.body.
  // Test their late-added content, attributes, and an untranslated code value.
  await page.evaluate(() => {
    const root = document.createElement('section')
    root.id = 'locale-overlay-probe'
    root.innerHTML = [
      '<div class="v-overlay__content" role="dialog"><span>重新读取会丢弃此文件的未保存修改，是否继续？</span></div>',
      '<div class="v-overlay__content" role="listbox"><div role="option">关闭推送</div><div role="option">企业微信 Markdown</div></div>',
      '<div class="v-snackbar__content" role="status">最新状态已刷新</div>',
      '<span id="overlay-tooltip" title="检查更新失败：HTTP 403">Info</span>',
      '<code>/usr/share/wechatpush/api/diy.json</code>'
    ].join('')
    document.body.append(root)
  })
  const overlay = page.locator('#locale-overlay-probe')
  await expect(overlay.getByRole('dialog')).toContainText('Reloading will discard unsaved changes')
  await expect(overlay.getByRole('option', { name: 'Disable notifications' })).toBeVisible()
  await expect(overlay.getByRole('option', { name: 'WeCom Markdown' })).toBeVisible()
  await expect(overlay.getByRole('status')).toHaveText('Status refreshed')
  await expect(overlay.locator('#overlay-tooltip')).toHaveAttribute('title', 'Update check failed: HTTP 403')
  await expect(overlay.locator('code')).toHaveText('/usr/share/wechatpush/api/diy.json')

  // A locale switch must retranslate the original source, not the English text.
  await page.getByRole('radio', { name: '繁體中文' }).check()
  await expect(overlay.getByRole('option', { name: '關閉推送' })).toBeVisible()
  await expect(overlay.getByRole('status')).toHaveText('最新狀態已刷新')
  await page.getByRole('radio', { name: 'English' }).check()
  await expect(overlay.getByRole('status')).toHaveText('Status refreshed')
})


test('all sidebar settings categories use the top app-bar title and a single back button', async ({ page }) => {
  await page.goto('/')
  for (const category of ['路由器', '显示', '隐私', '刷新', '实验室', '语言', '关于']) {
    await page.getByRole('button', { name: '打开侧栏菜单' }).click()
    await page.getByRole('button', { name: '打开' + category + '设置' }).click()
    await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText(category)
    await expect(page.locator('.settings-page-heading')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '返回设置上一级' })).toHaveCount(1)
  }

  // Back remains visible when opening settings from the device list.
  await page.reload()
  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await page.getByRole('button', { name: '打开路由器设置' }).click()
  await page.getByRole('button', { name: '返回设置上一级' }).click()
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('我的 OpenWrt')
  await expect(page.getByRole('heading', { name: '设备列表' })).toBeVisible()
})
