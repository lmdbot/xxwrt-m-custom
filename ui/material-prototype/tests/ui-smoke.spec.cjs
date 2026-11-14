const { test, expect } = require('@playwright/test')
const fs = require('node:fs')

const dataFor = (object, method, params = {}) => {
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
  if (object === 'luci.wol' && method === 'stat') return { etherwake: true }
  if (object === 'luci.wol' && method === 'exec') return { code: 0, stdout: '' }
  if (object === 'network.device' && method === 'status') return { 'br-lan': { up: true } }
  if (object === 'uci' && method === 'get' && params.config === 'luci-wol') return { values: { demo: { '.type': 'target', '.name': 'demo', name: '测试主机', mac: 'AA:BB:CC:DD:EE:FF', iface: 'br-lan' } } }
  if (object === 'uci' && method === 'get' && params.config === 'network') return { values: { cfg123: { '.type': 'route', interface: 'wan', target: '10.0.0.0/24', gateway: '10.12.4.1' } } }
  if (object === 'uci' && method === 'add') return { section: 'new-wol-target' }
  if (object === 'uci' && method === 'commit') return {}
  if (object === 'uci' && method === 'revert') return {}
  if (object === 'uci' && method === 'delete') return {}
  if (object === 'appfilter' && method === 'get_app_filter_base') return { data: { enable: 1, record_enable: 0, work_mode: 0 } }
  if (object === 'appfilter' && method === 'get_oaf_status') return { data: { version: '2.0', engine_version: '2.1' } }
  if (object === 'appfilter' && method === 'set_app_filter_base') return {}
  if (object === 'appfilter' && method === 'get_app_filter') return { app_list: [1,2] }
  if (object === 'appfilter' && method === 'get_all_users') return { data: { list: [] } }
  if (object === 'luci-rpc' && method === 'getNetworkDevices') return { eth0: { up: true, macaddr: '00:11:22:33:44:55' } }
  if (object === 'luci-rpc' && method === 'getWirelessDevices') return { radio0: { up: true } }
  if (object === 'luci' && method === 'getProcessList') return {
    processes: [{ pid: 123, user: 'root', cpu: '0.3', mem: '1.2', command: 'rpcd' }]
  }
  if (object === 'uci' && method === 'get') return {
    values: { cfg123: { '.type': 'route', interface: 'wan', target: '10.0.0.0/24', gateway: '10.12.4.1' } }
  }
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
  await expect(page.getByRole('heading', { name: '设备列表' })).toBeVisible()
  await expect(page.locator('.v-application')).toBeVisible()
  await expect(page.locator('v-app, v-card, v-btn')).toHaveCount(0)
  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await expect(page.getByText('语言设置', { exact: true })).toBeVisible()
  await expect(page.getByText('外观模式', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '标准底栏' })).toBeVisible()
  await expect(page.getByRole('button', { name: '液态底栏' })).toBeVisible()
  await page.getByRole('button', { name: '关闭侧栏菜单' }).click()
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page.getByRole('textbox', { name: '设备名称 / 备注' }).fill('QWRT 主路由')
  await page.getByRole('textbox', { name: 'IP / 域名 / 端口' }).fill('http://192.168.100.1')
  await page.getByRole('textbox', { name: '登录用户名' }).fill('root')
  await page.getByRole('button', { name: '保存设备' }).click()
  await expect(page.getByText('QWRT 主路由')).toBeVisible()
  await page.getByRole('button', { name: '进入 QWRT 主路由' }).click()
  await expect(page.getByText('连接 QWRT 主路由')).toBeVisible()
  await page.getByRole('textbox', { name: '路由器密码' }).fill('mock-only')
  await page.getByRole('button', { name: '登录并进入' }).click()
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
  await expect(page.locator('.terminal-tile.v-card')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索名称、IP 或 MAC' }).fill('NO-MATCH')
  await expect(page.locator('.terminal-tile.v-card')).toHaveCount(0)
  await page.getByRole('textbox', { name: '搜索名称、IP 或 MAC' }).fill('192.168.100.88')
  await expect(page.locator('.terminal-tile.v-card')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/screenshots/terminal-cards.png', fullPage: true })
  await page.getByText('Phone').click()
  await expect(page.getByText('终端详情')).toBeVisible()
  await expect(page.getByText('AA:BB:CC:DD:EE:FF', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()
  await page.getByRole('button', { name: '网络' }).click()
  await expect(page.getByText('10.12.4.5').first()).toBeVisible()
  await page.getByRole('button', { name: '应用' }).click()
  await expect(page.getByText('firewall')).toBeVisible()
  await expect(page.getByText('基础版管理工具')).toBeVisible()
  await page.getByRole('button', { name: '进程管理' }).click()
  await expect(page.getByText('rpcd')).toBeVisible()
  await page.getByRole('button', { name: '静态路由' }).click()
  await expect(page.getByText('10.0.0.0/24')).toBeVisible()
  await page.getByRole('button', { name: '网络唤醒' }).click()
  await expect(page.getByText('测试主机')).toBeVisible()
  await page.getByRole('button', { name: '唤醒', exact: true }).click()
  await expect(page.getByText(/已向 测试主机 发送网络唤醒包/)).toBeVisible()
  await page.getByRole('button', { name: '家长控制' }).click()
  await expect(page.getByText('家长控制 / OpenAppFilter')).toBeVisible()
  await page.getByRole('button', { name: '保存家长控制基础设置' }).click()
  await expect(page.getByText('家长控制基础设置已提交')).toBeVisible()
  await page.getByRole('button', { name: '重启路由器' }).click()
  await expect(page.getByText('确认重启 QWRT')).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()

  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await page.getByRole('button', { name: '液态底栏' }).click()
  await page.getByRole('button', { name: '关闭侧栏菜单' }).click()
  await expect(page.locator('.liquid-bottom .glass-nav')).toBeVisible()
  await page.getByRole('button', { name: '首页' }).click()
  await expect(page.getByText('J4125 SoftRouter')).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/live-liquid.png', fullPage: true })
  await page.reload()
  await expect(page.getByRole('heading', { name: '设备列表' })).toBeVisible()
  await expect(page.getByText('QWRT 主路由')).toBeVisible()
  await expect(page.locator('.v-bottom-navigation')).toHaveCount(0)
  await page.getByRole('button', { name: '进入 QWRT 主路由' }).click()
  await expect(page.getByRole('textbox', { name: '路由器密码' })).toHaveValue('')
  await page.getByRole('button', { name: '返回列表' }).click()
  await page.getByRole('button', { name: '编辑QWRT 主路由' }).click()
  await expect(page.getByText('编辑 OpenWrt 设备')).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()
  await page.getByRole('button', { name: '删除QWRT 主路由' }).click()
  await expect(page.getByText('确定从设备列表移除这台 OpenWrt 吗？', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByText('还没有添加 OpenWrt 设备')).toBeVisible()
  expect(errors).toEqual([])
})

test('reject invalid router addresses before attempting authentication', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page.getByRole('textbox', { name: '设备名称 / 备注' }).fill('测试设备')
  await page.getByRole('textbox', { name: 'IP / 域名 / 端口' }).fill('http://192.168.100.1/ubus')
  await page.getByRole('button', { name: '保存设备' }).click()
  await expect(page.getByText('地址只填写 IP、域名和可选端口，不要包含路径或账号密码')).toBeVisible()
})


test('saved routers retain independent addresses and can switch without overwriting entries', async ({ page }) => {
  await page.route('**/ubus', handler)
  await page.goto('/')
  for (const [name, address] of [
    ['主路由', 'http://192.168.100.1'],
    ['副路由', 'https://router.example.test:8443']
  ]) {
    await page.getByRole('button', { name: '添加', exact: true }).click()
    await page.getByRole('textbox', { name: '设备名称 / 备注' }).fill(name)
    await page.getByRole('textbox', { name: 'IP / 域名 / 端口' }).fill(address)
    await page.getByRole('button', { name: '保存设备' }).click()
  }
  await expect(page.getByRole('button', { name: '进入 主路由' })).toBeVisible()
  await expect(page.getByRole('button', { name: '进入 副路由' })).toBeVisible()
  await page.getByRole('button', { name: '进入 主路由' }).click()
  await page.getByRole('textbox', { name: '路由器密码' }).fill('p1')
  await page.getByRole('button', { name: '登录并进入' }).click()
  await expect(page.getByText('J4125 SoftRouter')).toBeVisible()
  await page.getByRole('button', { name: '返回设备列表' }).click()
  await expect(page.getByRole('button', { name: '进入 副路由' })).toBeVisible()
  await page.getByRole('button', { name: '进入 副路由' }).click()
  await page.getByRole('textbox', { name: '路由器密码' }).fill('p2')
  await page.getByRole('button', { name: '登录并进入' }).click()
  await expect(page.getByText('J4125 SoftRouter')).toBeVisible()
  await page.getByRole('button', { name: '返回设备列表' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '进入 主路由' })).toBeVisible()
  await expect(page.getByRole('button', { name: '进入 副路由' })).toBeVisible()
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('xxwrt_material_saved_devices_v1') || '[]'))
  expect(records).toHaveLength(2)
  expect(records.every(d => !('password' in d) && !('session' in d))).toBeTruthy()
  expect(records[1].address).toBe('https://router.example.test:8443')
})
