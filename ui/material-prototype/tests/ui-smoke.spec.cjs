const { test, expect } = require('@playwright/test')
const fs = require('node:fs')
let networkBytes = 1024 * 1024

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
  if (object === 'luci' && method === 'getMountPoints') return { result: [
    {device: '/dev/root', mount: '/', size: 2147483648, free: 1073741824},
    {device: '/dev/sda2', mount: '/overlay', size: 536870912, free: 134217728},
    {device: 'tmpfs', mount: '/tmp', size: 1073741824, free: 805306368},
    {device: 'devtmpfs', mount: '/dev', size: 10485760, free: 5242880}
  ] }
  if (object === 'luci.internet-detector' && method === 'UIPoll') return {
    instances: [
      { instance: 'netease_music', inet: 0 }, { instance: 'telegram', inet: 0 },
      { instance: 'chatgpt', inet: 0 }, { instance: 'google', inet: 1 }
    ]
  }
  if (object === 'network.interface' && method === 'dump') return {
    interface: [
      { interface: 'lan', device: 'br-lan', up: true, proto: 'static', 'ipv4-address': [{ address: '192.168.100.1' }] },
      { interface: 'wan', device: 'pppoe-wan', up: true, proto: 'pppoe', uptime: 90061, 'ipv4-address': [{ address: '10.12.4.5' }],
        'dns-server': ['223.5.5.5'], route: [{ target: '0.0.0.0', mask: 0, nexthop: '10.12.4.1' }] }
    ]
  }
  if (object === 'luci' && method === 'getOnlineUsers') return { onlineusers: '9' }
  if (object === 'file' && method === 'read') {
    return { data: 'nf_conntrack_count' === 'nf_conntrack_count' ? '2070' : '65535' }
  }
  if (object === 'luci-rpc' && method === 'getDHCPLeases') {
    return { dhcp_leases: [
      { macaddr: 'AA:BB:CC:DD:EE:FF', ipaddr: '192.168.100.88', hostname: 'Phone', expires: 40000 },
      { macaddr: 'A6:83:E7:2C:91:0F', ipaddr: '192.168.100.89', hostname: 'iPhone-15-Pro', expires: 40000 },
      { macaddr: 'F0:EE:7A:91:AA:12', ipaddr: '192.168.100.90', hostname: 'MacBook-Air', expires: 40000 }
    ], dhcp6_leases: [{hostname:'IPv6-Phone', ip6addr:'2408::1234', duid:'123456'}] }
  }
  if (object === 'luci-rpc' && method === 'getHostHints') return { 'AA:BB:CC:DD:EE:FF': { name: 'Phone' } }
  if (object === 'rc' && method === 'list') return { network: { enabled: true, running: true }, firewall: { enabled: true, running: true } }
  if (object === 'luci.wol' && method === 'stat') return { etherwake: true }
  if (object === 'luci.wol' && method === 'exec') return { code: 0, stdout: '' }
  if (object === 'file' && method === 'exec' && params.command === '/sbin/ip') {
    return { code: 0, stdout: 'default via 10.12.4.1 dev pppoe-wan\n10.0.0.0/24 via 10.12.4.1 dev pppoe-wan\n' }
  }
  if (object === 'iwinfo' && method === 'devices') return { devices: ['wlan0'] }
  if (object === 'iwinfo' && method === 'assoclist') return {
    results: [{mac:'11:22:33:44:55:66', signal:-56, rx:{rate:144}, tx:{rate:130}, connected_time:50}]
  }
  if (object === 'network.device' && method === 'status') {
    if (params.name) {
      networkBytes += 60 * 1024
      return { name: params.name, statistics: {
        rx_bytes: networkBytes, tx_bytes: networkBytes / 2,
        rx_packets: 1000, tx_packets: 900
      }}
    }
    return { 'br-lan': { up: true } }
  }
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
  if (object === 'appfilter' && method === 'get_all_users') return { data: { list: [{mac:'AA:BB:CC:DD:EE:FF',nickname:'Phone'}] } }
  if (object === 'appfilter' && method === 'class_list') return {
    class_list: [{name:'社交',app_list:['1,ChatApp,11','2,MessageApp,12']}]
  }
  if (object === 'appfilter' && method === 'get_app_filter_time') return {
    data: {mode:0,time_list:[{start:'08:00',end:'22:00'}],weekday_list:[1,2,3,4,5],allow_time:20,deny_time:60}
  }
  if (object === 'appfilter' && method === 'get_app_filter_user') return {data:{mode:0,list:[]}}
  if (object === 'appfilter' && method === 'get_app_filter_adv') return {
    data:{auto_load_engine:1,lan_ifname:'br-lan',disable_hnat:1}
  }
  if (object === 'appfilter' && ['set_app_filter','set_app_filter_time','set_app_filter_user','set_app_filter_adv','add_app_filter_user','del_app_filter_user'].includes(method)) return {}
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
  fs.mkdirSync('test-results/screenshots', { recursive: true })
  await expect(page.getByRole('heading', { name: '设备列表' })).toBeVisible()
  await expect(page.locator('.v-application')).toBeVisible()
  await expect(page.locator('v-app, v-card, v-btn')).toHaveCount(0)
  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await expect(page.locator('.settings-category-card')).toHaveCount(6)
  await expect(page.getByRole('button', { name: '打开路由器设置' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开显示设置' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开隐私设置' })).toBeVisible()
  await expect(page.getByText('语言设置', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '打开路由器设置' }).click()
  await expect(page.getByRole('heading', { name: '路由器', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: '打开设备列表' }).click()
  await expect(page.getByRole('heading', { name: '设备列表' })).toBeVisible()

  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await page.getByRole('button', { name: '打开显示设置' }).click()
  await expect(page.getByRole('heading', { name: '显示', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: '标准底栏' })).toBeVisible()
  await expect(page.getByRole('button', { name: '液态底栏' })).toBeVisible()
  await page.getByRole('button', { name: '液态底栏' }).click()
  await expect(page.locator('.settings-nav-toggle .v-btn--active')).toContainText('液态')
  await page.getByRole('button', { name: '标准底栏' }).click()
  await page.screenshot({ path: 'test-results/screenshots/settings-display.png', fullPage: true })

  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await page.getByRole('button', { name: '打开隐私设置' }).click()
  await expect(page.getByRole('heading', { name: '隐私', level: 1 })).toBeVisible()
  await expect(page.getByLabel('隐藏主机名')).toBeVisible()
  await expect(page.getByLabel('隐藏 IP / 域名')).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/settings-privacy.png', fullPage: true })
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('settings')
  await expect(page.getByRole('heading', { name: '显示', level: 1 })).toBeVisible()
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('settings')
  await expect(page.getByRole('heading', { name: '设备列表' })).toBeVisible()
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
  await expect(page.getByText('联网检测', { exact: true })).toBeVisible()
  await expect(page.getByText('联网监测', { exact: true })).toHaveCount(0)
  const detectorColorMatches = await page.evaluate(() => {
    const heading = document.querySelector('.detector-title')
    const uptimeLabel = [...document.querySelectorAll('.device-card .details span')]
      .find(element => element.textContent.trim() === '运行时间')
    if (!heading || !uptimeLabel) return false
    const a = getComputedStyle(heading), b = getComputedStyle(uptimeLabel)
    return a.color === b.color && a.fontSize === b.fontSize && a.fontWeight === b.fontWeight
  })
  expect(detectorColorMatches).toBe(true)
  await expect(page.getByText('网易云')).toBeVisible()
  await expect(page.getByText('3 / 4 正常')).toBeVisible()
  await expect(page.locator('.status-chip.v-chip')).toHaveCount(4)
  await expect(page.locator('.page-head')).not.toContainText('更新于')
  await expect(page.locator('.page-head')).not.toContainText('192.168.100.1')
  await expect(page.getByTestId('device-page-meta')).toHaveCount(1)
  await expect(page.getByTestId('device-page-meta')).toContainText('更新于')
  await expect(page.getByTestId('device-page-meta')).toContainText('192.168.100.1')
  await expect(page.getByText('非官方 Material UI')).toHaveCount(0)
  await expect(page.getByText('通过真实 QWRT ubus 接口读取数据')).toHaveCount(0)
  const footerAfterCards = await page.evaluate(() => {
    const meta = document.querySelector('[data-testid="device-page-meta"]')
    const card = document.querySelector('.device-card')
    return !!meta && !!card && !!(card.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(footerAfterCards).toBe(true)
  await expect(page.locator('.device-card.v-card')).toBeVisible()
  await expect(page.getByText('磁盘占用')).toBeVisible()
  await expect(page.getByText('系统可写空间')).toBeVisible()
  await expect(page.getByText('临时空间')).toBeVisible()
  await expect(page.getByText('75%', { exact: true })).toBeVisible()
  await expect(page.getByText('25%', { exact: true })).toBeVisible()
  await expect(page.locator('.v-bottom-navigation')).toBeVisible()
  await page.getByRole('button', { name: '统计' }).click()
  await expect(page.getByTestId('device-page-meta')).toHaveCount(1)
  await expect(page.locator('.page-head')).not.toContainText('更新于')
  await expect(page.getByText('实时带宽')).toBeVisible()
  await expect(page.getByText('系统负载历史')).toBeVisible()
  await expect(page.locator('.realtime-chart').first()).toBeVisible({ timeout: 12000 })
  await page.waitForTimeout(3600)
  await expect(page.locator('.realtime-chart')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/screenshots/actual-traffic-history.png', fullPage: true })
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('page')
  await expect(page.getByText('J4125 SoftRouter')).toBeVisible()
  await page.getByRole('button', { name: '统计' }).click()
  await expect(page.getByText('实时带宽')).toBeVisible()
  await page.getByRole('button', { name: '首页' }).click()

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
  await expect(page.getByTestId('device-page-meta')).toHaveCount(1)
  await expect(page.locator('.page-head')).not.toContainText('更新于')
  await expect(page.getByRole('heading', { name: '终端', level: 1 })).toBeVisible()
  await expect(page.locator('.terminal-category-grid')).toBeVisible()
  await expect(page.locator('.terminal-tile')).toHaveCount(3)
  await expect(page.getByText('Apple · 手机')).toBeVisible()
  await expect(page.locator('.terminal-identity--brand')).toHaveCount(2)
  await expect(page.getByText('随机 MAC')).toBeVisible()
  await expect(page.getByText('MacBook-Air')).toBeVisible()
  await expect(page.locator('.terminal-category-card')).toHaveCount(4)
  const categoryColumns = await page.locator('.terminal-category-grid').evaluate(el =>
    getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(categoryColumns).toBe(2)
  await expect(page.getByRole('button', { name: /DHCPv4/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /DHCPv6/ }).click()
  await expect(page.getByRole('button', { name: /DHCPv6/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('IPv6-Phone')).toBeVisible()
  await page.getByRole('button', { name: /无线终端/ }).click()
  await expect(page.getByText('11:22:33:44:55:66')).toBeVisible()
  await page.getByRole('button', { name: /应用用户/ }).click()
  await expect(page.getByText('Phone')).toBeVisible()
  await page.getByRole('button', { name: /DHCPv4/ }).click()
  await expect(page.getByText('Phone')).toBeVisible()
  await expect(page.locator('.terminal-tile.v-card')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索名称、IP 或 MAC' }).fill('NO-MATCH')
  await expect(page.locator('.terminal-tile.v-card')).toHaveCount(0)
  await page.getByRole('textbox', { name: '搜索名称、IP 或 MAC' }).fill('192.168.100.88')
  await expect(page.locator('.terminal-tile.v-card')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/screenshots/terminal-cards.png', fullPage: true })
  await page.getByText('Phone').click()
  await expect(page.getByText('终端详情')).toBeVisible()
  await expect(page.getByRole('dialog').getByText('AA:BB:CC:DD:EE:FF', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('dialog')
  await expect(page.getByText('终端详情')).not.toBeVisible()
  await page.getByText('Phone').click()
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '网络' }).click()
  await expect(page.getByTestId('device-page-meta')).toHaveCount(1)
  await expect(page.getByText('运行秒数')).toHaveCount(0)
  await expect(page.getByText('1天 1小时 1分钟', { exact: true })).toBeVisible()
  await expect(page.getByText('10.12.4.5').first()).toBeVisible()
  await expect(page.locator('.hardware-list')).toBeVisible()
  await expect(page.locator('.hardware-panel')).toHaveCount(2)
  await expect(page.locator('.hardware-panel').first().getByText('eth0')).toBeVisible()
  await page.locator('.hardware-panel').first().locator('.v-expansion-panel-title').click()
  await expect(page.locator('.hardware-panel').first().getByText('00:11:22:33:44:55').last()).toBeVisible()
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).resolves.toBeTruthy()
  await page.screenshot({ path: 'test-results/screenshots/compact-network-interfaces.png', fullPage: true })
  await page.getByRole('button', { name: '应用' }).click()
  await expect(page.getByTestId('device-page-meta')).toHaveCount(1)
  await expect(page.locator('.page-head')).not.toContainText('更新于')
  await expect(page.getByText('应用管理')).toBeVisible()
  await expect(page.locator('.app-launcher-tile')).toHaveCount(7)
  await expect(page.getByText('firewall')).toHaveCount(0)
  await page.getByRole('button', { name: '打开进程' }).click()
  await expect(page.getByText('rpcd')).toBeVisible()
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('page')
  await expect(page.getByText('应用管理')).toBeVisible()
  await page.getByRole('button', { name: '打开进程' }).click()
  await expect(page.getByText('rpcd')).toBeVisible()
  await expect(page.locator('.compact-system-list .compact-entry')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索进程' }).fill('rpcd')
  await expect(page.locator('.compact-system-list .compact-entry')).toHaveCount(1)
  await page.getByRole('button', { name: '查看进程 123 完整命令' }).click()
  await expect(page.getByText('完整命令')).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/compact-processes.png', fullPage: true })
  await page.getByRole('button', { name: '返回应用功能列表' }).click()
  await page.getByRole('button', { name: '打开启动项' }).click()
  await expect(page.getByText('firewall')).toBeVisible()
  await expect(page.locator('.compact-system-list .compact-entry')).toHaveCount(2)
  await page.getByRole('textbox', { name: '搜索启动项' }).fill('firewall')
  await expect(page.locator('.compact-system-list .compact-entry')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索启动项' }).fill('')
  await page.screenshot({ path: 'test-results/screenshots/compact-startup-services.png', fullPage: true })
  await page.getByRole('button', { name: '返回应用功能列表' }).click()
  await page.getByRole('button', { name: '打开路由表' }).click()
  await expect(page.locator('.compact-system-list .route-entry')).toHaveCount(3)
  await expect(page.getByText('10.0.0.0/24', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('默认路由')).toBeVisible()
  await page.getByRole('textbox', { name: '搜索路由' }).fill('pppoe-wan')
  await expect(page.locator('.compact-system-list .route-entry')).toHaveCount(2)
  await page.getByRole('textbox', { name: '搜索路由' }).fill('')
  await page.screenshot({ path: 'test-results/screenshots/compact-route-table.png', fullPage: true })
  await page.getByRole('button', { name: '返回应用功能列表' }).click()
  await page.getByRole('button', { name: '打开网络唤醒' }).click()
  await expect(page.getByText('测试主机')).toBeVisible()
  await page.getByRole('button', { name: '唤醒', exact: true }).click()
  await expect(page.getByText(/已向 测试主机 发送网络唤醒包/)).toBeVisible()
  await page.getByRole('button', { name: '返回应用功能列表' }).click()
  await page.getByRole('button', { name: '打开家长控制' }).click()
  await expect(page.getByText('OpenAppFilter 家长控制')).toBeVisible()
  await page.getByRole('tab', { name: '应用分类' }).click()
  await expect(page.getByText('社交', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '保存应用过滤规则' }).click()
  await expect(page.getByText('应用分类规则：已提交')).toBeVisible()
  await page.getByRole('tab', { name: '高级设置' }).click()
  await page.getByRole('button', { name: '保存高级设置' }).click()
  await expect(page.getByText('高级设置：已提交')).toBeVisible()
  await page.getByRole('button', { name: '返回应用功能列表' }).click()
  await page.getByRole('button', { name: '打开恢复出厂' }).click()
  await expect(page.getByText('恢复 QWRT 出厂设置')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认恢复出厂' })).toBeDisabled()
  await page.getByRole('button', { name: '取消' }).click()
  await page.getByRole('button', { name: '打开重启设备' }).click()
  await expect(page.getByText('确认重启 QWRT')).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()

  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await page.getByRole('button', { name: '打开显示设置' }).click()
  await page.getByRole('button', { name: '液态底栏' }).click()
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('settings')
  await expect(page.locator('.v-navigation-drawer--active')).toHaveCount(0)
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
  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect(page.getByRole('button', { name: '进入 副路由' })).toBeVisible()
  await page.getByRole('button', { name: '进入 副路由' }).click()
  await page.getByRole('textbox', { name: '路由器密码' }).fill('p2')
  await page.getByRole('button', { name: '登录并进入' }).click()
  await expect(page.getByText('J4125 SoftRouter')).toBeVisible()
  await page.getByRole('button', { name: '返回上一页' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '进入 主路由' })).toBeVisible()
  await expect(page.getByRole('button', { name: '进入 副路由' })).toBeVisible()
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('xxwrt_material_saved_devices_v1') || '[]'))
  expect(records).toHaveLength(2)
  expect(records.every(d => !('password' in d) && !('session' in d))).toBeTruthy()
  expect(records[1].address).toBe('https://router.example.test:8443')
})

test('device list main parity and persistent hostname/address privacy', async ({ page }) => {
  await page.route('**/ubus', handler)
  await page.goto('/')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page.getByRole('textbox', { name: '设备名称 / 备注' }).fill('Private Gateway')
  await page.getByRole('textbox', { name: 'IP / 域名 / 端口' }).fill('http://192.168.100.1')
  await page.getByRole('button', { name: '保存设备' }).click()
  await expect(page.locator('.router-name')).toHaveText('Private Gateway')
  await expect(page.locator('.router-address')).toHaveText('http://192.168.100.1')
  await expect(page.getByRole('button', { name: '切换到列表模式' })).toBeVisible()
  await page.getByRole('button', { name: '进入 Private Gateway' }).click()
  await page.getByRole('textbox', { name: '路由器密码' }).fill('mock-password')
  await page.getByRole('button', { name: '登录并进入' }).click()
  await expect(page.getByText('J4125 SoftRouter')).toBeVisible()
  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect(page.locator('.router-meter')).toHaveCount(2, { timeout: 12000 })
  await expect(page.getByText('上传', { exact: true })).toBeVisible()
  await expect(page.getByText('下载', { exact: true })).toBeVisible()
  await expect(page.getByText('连接数', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('终端', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '切换到列表模式' }).click()
  await expect(page.locator('.saved-device-grid-compact')).toBeVisible()
  await page.getByRole('button', { name: '隐藏路由器地址' }).click()
  await expect(page.locator('.router-address')).toContainText('•••')
  await page.getByRole('button', { name: '打开侧栏菜单' }).click()
  await page.getByRole('button', { name: '打开隐私设置' }).click()
  await page.getByLabel('隐藏主机名').click()
  await page.getByRole('button', { name: '返回设置上一级' }).click()
  await expect(page.locator('.router-name')).toHaveText('路由器 1')
  await expect(page.getByRole('button', { name: '进入 路由器 1' })).toBeVisible()
  await expect(page.locator('.router-address')).toContainText('•••')
  await page.reload()
  await expect(page.locator('.router-name')).toHaveText('路由器 1')
  await expect(page.locator('.router-address')).toContainText('•••')
  await expect(page.locator('.saved-device-grid-compact')).toBeVisible()
  await page.getByRole('button', { name: '进入 路由器 1' }).click()
  await expect(page.getByText('连接 路由器 1')).toBeVisible()
  await expect(page.getByText('http://192.168.100.1', { exact: true })).not.toBeVisible()
})


test('theme survives reload and refresh keeps existing cards mounted without checking-state flash', async ({ page }) => {
  // Native Android chrome is checked by Gradle build; browser verifies the
  // same reactive theme state and underlying CSS/meta color.
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('xxwrt_material_color_mode', 'dark'))
  await page.reload()
  await expect(page.locator('.material-demo.theme-is-dark')).toBeVisible()
  await expect.poll(() => page.locator('meta[name="theme-color"]').getAttribute('content'))
    .toBe('#11141B')
  await page.evaluate(() => localStorage.setItem('xxwrt_material_color_mode', 'light'))
  await page.reload()
  await expect(page.locator('.material-demo.theme-is-dark')).toHaveCount(0)
  await expect.poll(() => page.locator('meta[name="theme-color"]').getAttribute('content'))
    .toBe('#F5F6FB')

  let holdNext = false
  let blocked = false
  let resumeRequest = null
  await page.route('**/ubus', async route => {
    if (holdNext && !blocked && route.request().method() === 'POST') {
      blocked = true
      await new Promise(resolve => { resumeRequest = resolve })
    }
    await handler(route)
  })

  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page.getByRole('textbox', { name: '设备名称 / 备注' }).fill('QWRT')
  await page.getByRole('textbox', { name: 'IP / 域名 / 端口' }).fill('http://192.168.100.1')
  await page.getByRole('button', { name: '保存设备' }).click()
  await page.getByRole('button', { name: '进入 QWRT' }).click()
  await page.getByRole('textbox', { name: '路由器密码' }).fill('test-only')
  await page.getByRole('button', { name: '登录并进入' }).click()
  await expect(page.locator('.device-card.v-card')).toBeVisible()
  await expect(page.getByText('磁盘占用')).toBeVisible()

  // Delay one ubus response while the homepage is already displayed.
  holdNext = true
  blocked = false
  await page.evaluate(() => { void window.__xxwrtTestRefreshDashboard() })
  await expect.poll(() => blocked).toBe(true)
  await expect(page.locator('.device-card.v-card')).toBeVisible()
  await expect(page.getByText('磁盘占用')).toBeVisible()
  await expect(page.getByText('38℃')).toBeVisible()
  resumeRequest()
  await expect(page.getByRole('button', { name: '刷新数据' }))
    .not.toHaveClass(/v-btn--loading/)

  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect(page.locator('.router-list-card')).toBeVisible()
  await expect(page.locator('.router-stat-block')).toBeVisible()
  await expect(page.getByText('已登录 · 在线')).toBeVisible()
  await expect(page.getByRole('button', { name: '刷新设备状态' }))
    .not.toHaveClass(/v-btn--loading/)

  // The old code immediately set deviceStatuses[id] = 'checking',
  // unmounting all online-only metrics and causing visible flashing.
  holdNext = true
  blocked = false
  resumeRequest = null
  await page.evaluate(() => { void window.__xxwrtTestRefreshDevices() })
  await expect.poll(() => blocked).toBe(true)
  await expect(page.locator('.router-stat-block')).toBeVisible()
  await expect(page.getByText('已登录 · 在线')).toBeVisible()
  await expect(page.locator('.router-name')).toHaveText('QWRT')
  await page.screenshot({ path: 'test-results/screenshots/refresh-without-flicker.png', fullPage: true })
  resumeRequest()
  await expect(page.getByRole('button', { name: '刷新设备状态' }))
    .not.toHaveClass(/v-btn--loading/)
  await expect(page.locator('.router-stat-block')).toBeVisible()
  await expect(page.getByText('已登录 · 在线')).toBeVisible()
})
