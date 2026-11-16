// Capture all five Design A root pages and 11 representative secondary
// categories, at 360/393/430dp in both themes. This is a *design reference*:
// the prototype uses fictitious counters and is not a production gold image.
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium, devices } = require('@playwright/test')

const prototype = pathToFileURL(path.resolve(__dirname, '../../../doc/prototype.html')).href
const output = path.resolve(__dirname, '../test-results/design-a/reference')
const views = [
  { id: '00-overview', tab: 0 },
  { id: '01-devices', tab: 1 },
  { id: '02-network', tab: 2 },
  { id: '03-tools', tab: 3 },
  { id: '04-me', tab: 4 },
  { id: '05-monitor', tab: 0, detail: '详细监控' },
  { id: '06-terminal-detail', tab: 1, detail: 'Alienware X51' },
  { id: '07-network-interfaces', tab: 2, detail: '网络接口' },
  { id: '08-firewall', tab: 2, detail: '防火墙' },
  { id: '09-dns-dhcp', tab: 2, detail: 'DNS / DHCP' },
  { id: '10-ddns', tab: 2, detail: 'DDNS' },
  { id: '11-zerotier', tab: 2, detail: 'ZeroTier' },
  { id: '12-plugin-lucky', tab: 3, detail: 'Lucky' },
  { id: '13-services', tab: 3, detail: '服务管理' },
  { id: '14-software-packages', tab: 3, detail: '软件包' },
  { id: '15-logs', tab: 3, detail: '日志中心' },
  { id: '16-diagnostics', tab: 3, detail: '网络诊断' },
  { id: '17-security', tab: 3, detail: '安全分析' },
  { id: '18-backup', tab: 3, detail: '配置备份恢复' },
  { id: '19-settings', tab: 4, detail: '显示与外观' },
  { id: '20-about', tab: 4, detail: '关于 XX-WRT' }
]
const sizes = [[360, 800], [393, 852], [430, 932]]
async function main() {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({
      ...devices['Pixel 7'], viewport: { width: 393, height: 852 },
      reducedMotion: 'reduce'
    })
    const page = await context.newPage()
    await page.goto(prototype)
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height })
      for (const dark of [false, true]) {
        const folder = path.join(output, String(width), dark ? 'dark' : 'light')
        fs.mkdirSync(folder, { recursive: true })
        for (const view of views) {
          await page.evaluate(({tab,detail,dark}) => {
            state.tab = tab
            state.details = detail ? [detail] : []
            state.dark = dark
            document.body.classList.toggle('dark', dark)
            render()
          }, {...view, dark})
          await page.screenshot({
            path: path.join(folder, view.id + '.png'),
            animations: 'disabled', fullPage: false
          })
        }
        console.log(`Reference ${width}dp ${dark ? 'dark' : 'light'}: ${views.length} screens`)
      }
    }
    await context.close()
  } finally {
    await browser.close()
  }
  fs.writeFileSync(path.join(path.dirname(output), 'manifest.json'), JSON.stringify({
    source: 'doc/prototype.html (demonstration-only; data are fictitious)',
    referenceIsApprovedGolden: false,
    screenshotViewports: sizes.map(([width,height])=>({width,height})),
    themes: ['light','dark'],
    pages: views
  }, null, 2))
}
main().catch(err => { console.error(err); process.exitCode = 1 })
