const { test, expect } = require('@playwright/test')
const fs = require('node:fs')

test('Material components render and both bottom bars respond to taps', async ({ page }) => {
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => {
    if (m.type() === 'warning' && m.text().includes('Failed to resolve component'))
      errors.push(m.text())
  })
  await page.goto('/')
  await expect(page.getByText('J4125 SoftRouter')).toBeVisible()

  // The former broken build rendered raw <v-app>, <v-card> tags as unknown
  // HTML elements, so visually everything collapsed and all buttons were inert.
  await expect(page.locator('v-app, v-card, v-btn')).toHaveCount(0)
  await expect(page.locator('.v-application')).toBeVisible()
  await expect(page.locator('.v-app-bar')).toBeVisible()
  await expect(page.locator('.device-card.v-card')).toBeVisible()
  await expect(page.locator('.status-chip.v-chip')).toHaveCount(8)
  await expect(page.locator('.v-bottom-navigation')).toBeVisible()

  const cardRadius = await page.locator('.device-card.v-card').evaluate(
    node => parseFloat(getComputedStyle(node).borderTopLeftRadius)
  )
  expect(cardRadius).toBeGreaterThan(10)
  await page.getByRole('button', { name: '统计' }).click()
  await expect(page.getByRole('heading', { name: '统计' })).toBeVisible()
  await page.getByRole('button', { name: '首页' }).click()
  await expect(page.getByText('J4125 SoftRouter')).toBeVisible()

  // A mobile view must be scrollable; not frozen underneath an overlay.
  const before = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 850)
  await page.waitForTimeout(350)
  const after = await page.evaluate(() => window.scrollY)
  expect(after).toBeGreaterThan(before + 10)
  await page.evaluate(() => window.scrollTo(0, 0))

  fs.mkdirSync('test-results/screenshots', { recursive: true })
  await page.screenshot({ path: 'test-results/screenshots/standard.png', fullPage: true })

  await page.getByRole('button', { name: '液态底栏' }).click()
  await expect(page.locator('.liquid-bottom .glass-nav')).toBeVisible()
  await page.getByRole('button', { name: '网络' }).click()
  await expect(page.getByRole('heading', { name: '网络' })).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/liquid.png', fullPage: true })

  await page.reload()
  await expect(page.locator('.liquid-bottom .glass-nav')).toBeVisible()
  await page.getByRole('button', { name: '标准底栏' }).click()
  await expect(page.locator('.v-bottom-navigation')).toBeVisible()
  expect(errors).toEqual([])
})
