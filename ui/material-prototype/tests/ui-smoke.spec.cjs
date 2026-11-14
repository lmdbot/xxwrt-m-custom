const { test, expect } = require('@playwright/test')
const fs = require('node:fs')

const dataFor = (object, method) => {
  if (object === 'session' && method === 'login') return { ubus_rpc_session: '0123456789abcdef0123456789abcdef' }
  if (object === 'system' && method === 'board') return {
    hostname: 'QWRT', model: 'J4125 SoftRouter', system: 'Intel Celeron J4125',
    kernel: '7.3.4', release: { description: 'QWRT R26.11.13', target: 'x86/64' }
  }
  if (object === 'system' && method === 'info') return {
    uptime: 68402, localtime: 1794653100,
    memory: { total: 8200000000, available: 7380000000, cached: 510000000 },
    load: [13107, 19661, 26214]
  }
  if (object === 'luci' && method === 'getCPUUsage') return { cpuusage: '7%' }
  if (object === 'luci' && method === 'getTempInfo') return { tempinfo: '38°C' }
  if (object === 'luci.internet-detector' && method === 'UIPoll') return {
    instances: [
      { instance: 'netease_music', inet: 0 }, { instance: 'telegram', inet: 0 },
      { instance: 'chatgpt', inet: 0 }, { instance: 'google', inet: 1 }
    ]
  }
  if (object === 'network.interface' && method === 'dump') return {
    interface: [
      { interface: 'lan', device: 'br-lan', up: true, proto: 'static', 'ipv4-address': [{ address: '192.168.100.1' }] },
      { interface: 'wan', device: 'pppoe-wan', up: true, proto: 'pppoe', 'ipv4-address': [{ address: '10.12.4.5' }],
        'dns-server': ['223.5.5.5'], route: [{ target: '0.0.0.0', mask: 0, nexthop: '10.12.4.1' }] }
    ]
  }
  if (object === 'luci' && method === 'getOnlineUsers') return { onlineusers: '9' }
  if (object === 'file' && method === 'read') {
    return { data: 'nf_conntrack_count' === 'nf_conntrack_count' ? '2070' : '65535' }
  }
  if (object === 'luci-rpc' && method === 'getDHCPLeases') {
    return { dhcp_leases: [{ macaddr: 'AA:BB:CC:DD:EE:FF', ipaddr: '192.168.100.88', hostname: 'Phone', expires: 40000 }], dhcp6_leases: [] }
  }
  if (object === 'luci-rpc' && method === 'getHostHints') return { 'AA:BB:CC:DD:EE:FF': { name: 'Phone' } }
  if (object === 'rc' && method === 'list') return { network: { enabled: true, running: true }, firewall: { enabled: true, running: true } }
  return null
}

const handler = async route => {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    } })
    return
  }
  const req = route.request().postDataJSON()
  const reply = item => {
    const args = item.params || []
    const output = dataFor(args[1], args[2], args[3])
    return { jsonrpc: '2.0', id: item.id, result: output == null ? [6] : [0, output] }
  }
  await route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(Array.isArray(req) ? req.map(reply) : reply(req))
  })
}

test('authenticate to real RPC adapter and operate Material pages and bottom bars', async ({ page }) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => {
    if (m.type() === 'warning' && m.text().includes('Failed to resolve component')) errors.push(m.text())
  })
  await page.route('**/ubus', handler)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '连接路由器' })).toBeVisible()
  await expect(page.locator('.v-application')).toBeVisible()
  await expect(page.locator('v-app, v-card, v-btn')).toHaveCount(0)
  await page.getByLabel('登录密码').fill('mock-only')
  await page.getByRole('button', { name: '连接并读取路由器' }).click()
  await expect(page.getByText('J4125 SoftRouter')).toBeVisible()
  await expect(page.getByText('38℃')).toBeVisible()
  await expect(page.getByText('网易云')).toBeVisible()
  await expect(page.getByText('3 / 4 正常')).toBeVisible()
  await expect(page.locator('.status-chip.v-chip')).toHaveCount(4)
  await expect(page.locator('.device-card.v-card')).toBeVisible()
  await expect(page.locator('.v-bottom-navigation')).toBeVisible()

  // Test page scrolling in the actual logged-in screen.
  await page.evaluate(() => window.scrollTo(0, 0))
  const top = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(top + 10)
  await page.evaluate(() => window.scrollTo(0, 0))
  fs.mkdirSync('test-results/screenshots', { recursive: true })
  await page.screenshot({ path: 'test-results/screenshots/live-standard.png', fullPage: true })

  await page.getByRole('button', { name: '终端' }).click()
  await expect(page.getByRole('heading', { name: '终端', level: 1 })).toBeVisible()
  await expect(page.getByText('Phone')).toBeVisible()
  await page.getByRole('button', { name: '网络' }).click()
  await expect(page.getByText('10.12.4.5')).toBeVisible()
  await page.getByRole('button', { name: '应用' }).click()
  await expect(page.getByText('firewall')).toBeVisible()
  await page.getByRole('button', { name: '重启路由器' }).click()
  await expect(page.getByText('确认重启 QWRT')).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()

  await page.getByRole('button', { name: '液态底栏' }).click()
  await expect(page.locator('.liquid-bottom .glass-nav')).toBeVisible()
  await page.getByRole('button', { name: '首页' }).click()
  await expect(page.getByText('J4125 SoftRouter')).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/live-liquid.png', fullPage: true })
  await page.reload()
  await expect(page.getByRole('heading', { name: '连接路由器' })).toBeVisible()
  await expect(page.locator('.v-bottom-navigation')).toHaveCount(0)
  // Password and session must not survive a full reload.
  await expect(page.getByLabel('登录密码')).toHaveValue('')
  expect(errors).toEqual([])
})

test('reject invalid router addresses before attempting authentication', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('设备地址').fill('http://192.168.100.1/ubus')
  await page.getByLabel('登录密码').fill('sample')
  await page.getByRole('button', { name: '连接并读取路由器' }).click()
  await expect(page.getByText('地址只填写 IP、域名和可选端口，不要包含路径或账号密码')).toBeVisible()
})
