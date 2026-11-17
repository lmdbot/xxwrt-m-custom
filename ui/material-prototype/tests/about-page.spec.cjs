const { test, expect } = require('@playwright/test')
const { version } = require('../package.json')

async function openAbout(page) {
  await page.goto('/')
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.getByRole('button', { name: '打开关于' }).click()
  await expect(page.getByTestId('about-page')).toBeVisible()
}

test('About uses the actual Android launcher artwork and preserves update actions', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await openAbout(page)

  await page.locator('.about-design-more summary').click()
  const icon = page.getByRole('img', { name: 'XX-WRT 应用图标' })
  await expect(icon).toHaveAttribute('src', /qwrt-chibi-openwrt-router/)
  await expect.poll(() => icon.evaluate(element => element.naturalWidth)).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: '打开 GitHub 项目' })).toBeVisible()
  await expect(page.locator('.about-design-hero h2')).toHaveText('XX-WRT 管理器')
  await expect(page.locator('.about-design-hero p')).toContainText('v' + version)
  await expect(page.getByRole('button', { name: '检查更新' })).toBeVisible()
  await expect(page.getByRole('button', { name: '版本日志' })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看开源许可证' })).toBeVisible()

  await page.getByRole('button', { name: '版本详情' }).click()
  await expect(page.getByRole('dialog', { name: '应用版本详情' })).toBeVisible()
  await expect(page.getByText('com.lmdbot.xxwrt.materialpreview')).toBeVisible()
  await expect(page.getByText('构建号')).toBeVisible()
  await expect(page.getByText('构建日期')).toBeVisible()
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('dialog')
  await expect(page.getByRole('dialog', { name: '应用版本详情' })).toHaveCount(0)

  await page.getByRole('button', { name: '查看隐私与免责声明' }).click()
  await expect(page.getByRole('dialog', { name: '隐私与免责声明' })).toBeVisible()
  await expect(page.getByText('本地存储', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('dialog')
  await expect(page.getByRole('dialog', { name: '隐私与免责声明' })).toHaveCount(0)

  await page.getByRole('button', { name: '查看开源许可证' }).click()
  await expect(page.getByRole('dialog', { name: '开源许可证' })).toBeVisible()
  await page.getByRole('button', { name: '关闭开源许可证' }).click()
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('关于')
})

test('About follows English and Traditional Chinese through More → Settings', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.getByRole('button', { name: '打开语言设置' }).click()
  await page.getByRole('radio', { name: 'English' }).check()
  await page.getByRole('button', { name: 'Me', exact: true }).click()
  await page.locator('.more-menu-item').filter({ hasText: 'About' }).click()
  await expect(page.locator('.about-design-section')).toHaveCount(3)
  await page.getByRole('button', { name: 'View privacy and disclaimer' }).click()
  await expect(page.getByText('Local storage', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).last().click()

  await page.getByRole('button', { name: 'Me', exact: true }).click()
  await page.locator('.more-menu-item').filter({ hasText: 'Language' }).click()
  await page.getByRole('radio', { name: '繁體中文' }).check()
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.locator('.more-menu-item').filter({ hasText: '關於' }).click()
  await expect(page.getByText('隱私與免責聲明', { exact: true })).toBeVisible()
})
