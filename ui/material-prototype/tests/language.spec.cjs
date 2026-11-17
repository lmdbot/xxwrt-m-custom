const { test, expect } = require('@playwright/test')

test('More settings language switches immediately and survives restart', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByRole('heading', { name: '路由器管理' })).toBeVisible()

  await page.getByRole('button', { name: '我的', exact: true }).click()
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
  await expect(page.getByRole('heading', { name: 'Router management' })).toBeVisible()
  await page.getByRole('button', { name: 'Me', exact: true }).click()
  await page.locator('.more-menu-item').filter({ hasText: 'Language' }).click()
  await page.getByRole('radio', { name: '繁體中文' }).check()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await expect(page.getByText('應用語言')).toBeVisible()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await expect(page.getByRole('heading', { name: '路由器管理' })).toBeVisible()
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.locator('.more-menu-item').filter({ hasText: '語言' }).click()
  await page.getByRole('radio', { name: '简体中文' }).check()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByText('应用语言')).toBeVisible()
})

test('English also localizes dropdowns and notification overlays created after changing language', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '我的', exact: true }).click()
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


test('Design A Me groups router, five settings and About without an extra directory', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/')
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await expect(page.getByTestId('more-page')).toBeVisible()
  await expect(page.locator('.more-page .more-menu-item')).toHaveCount(7)
  await expect(page.locator('.standard-bottom .v-btn')).toHaveCount(5)

  await page.getByRole('button', { name: '打开隐私设置' }).click()
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('隐私')
  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect(page.getByTestId('more-page')).toBeVisible()

  await page.getByRole('button', { name: '打开关于' }).click()
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('关于')
  await expect(page.locator('.about-design-section')).toHaveCount(3)
  await page.locator('.about-design-more summary').click()
  await page.getByRole('button', { name: '帮助与反馈' }).click()
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('帮助与反馈')
  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect(page.getByTestId('more-page')).toBeVisible()

  await page.getByRole('button', { name: '打开显示设置' }).click()
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('显示')
  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect(page.getByTestId('more-page')).toBeVisible()

  await page.getByRole('button', { name: '概览' }).click()
  await expect(page.getByRole('heading', { name: '路由器管理' })).toBeVisible()
})
