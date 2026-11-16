const { test, expect } = require('@playwright/test')

// Deterministic, data-independent constraints from doc/04-design-system.md.
// These complement, but never replace, page-by-page golden screenshots.
test('Design A gutters and five bottom tabs match 360/393/430dp specifications', async ({ page }) => {
  await page.goto('/')
  for (const [width, height, inset] of [[360, 800, 16], [393, 852, 18], [430, 932, 18]]) {
    await page.setViewportSize({ width, height })
    const layout = await page.evaluate(() => {
      const main = document.querySelector('.xxwrt-v3 .main-container')
      if (!main) return null
      const css = getComputedStyle(main)
      return {
        left: parseFloat(css.paddingLeft),
        right: parseFloat(css.paddingRight),
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        nav: [...document.querySelectorAll('.standard-bottom .v-btn')].map(node => ({
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
          text: node.textContent.trim()
        }))
      }
    })
    expect(layout).not.toBeNull()
    expect(layout.left).toBe(inset)
    expect(layout.right).toBe(inset)
    expect(layout.documentWidth).toBeLessThanOrEqual(width + 2)
    expect(layout.nav).toHaveLength(5)
    expect(layout.nav.map(item => item.text)).toEqual(['概览', '设备', '网络', '工具', '我的'])
    expect(layout.nav.every(item => item.width >= 48 && item.height >= 48)).toBe(true)
  }
})

test('Design A themes use the documented semantic colors rather than legacy aliases', async ({ page }) => {
  await page.goto('/')
  const cases = [
    { mode: 'light', dark: false, colors: {
      '--ui-primary': '#2477ee', '--ui-bg': '#f3f7fd',
      '--ui-surface': '#ffffff', '--ui-muted': '#63758e', '--ui-border': '#dce6f4'
    } },
    { mode: 'dark', dark: true, colors: {
      '--ui-primary': '#83b6ff', '--ui-bg': '#0f1727',
      '--ui-surface': '#182437', '--ui-muted': '#a9b7cc', '--ui-border': '#34445c'
    } }
  ]
  for (const entry of cases) {
    await page.evaluate(mode => localStorage.setItem('xxwrt_material_color_mode', mode), entry.mode)
    await page.reload()
    const tokens = await page.locator('.xxwrt-v3').evaluate(element => {
      const css = getComputedStyle(element)
      return {
        dark: element.classList.contains('theme-is-dark'),
        pairs: Object.fromEntries(['--ui-primary', '--ui-bg', '--ui-surface',
          '--ui-muted', '--ui-border'].map(name => [name, css.getPropertyValue(name).trim().toLowerCase()]))
      }
    })
    expect(tokens.dark).toBe(entry.dark)
    expect(tokens.pairs).toEqual(entry.colors)
  }
})
