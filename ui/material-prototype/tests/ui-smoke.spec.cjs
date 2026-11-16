const { test, expect } = require('@playwright/test')
const fs = require('node:fs')

const appGroups = {
  "ShadowSocksR Plus+": "插件中心", "OpenClash": "插件中心",
  "Lucky": "插件中心", "Vlmcsd KMS": "插件中心",
  "微信推送": "插件中心", "Internet Detector": "插件中心",
  "Carbon 主题设置": "插件中心",
  "进程": "系统管理", "启动项": "系统管理",
  "软件包": "系统管理", "服务管理": "系统管理",
  "系统定时任务": "系统管理",
  "网络诊断": "诊断与安全", "日志中心": "诊断与安全",
  "安全分析": "诊断与安全", "操作记录": "诊断与安全",
  "系统能力识别": "诊断与安全",
  "配置备份恢复": "维护与备份",
  "重启设备": "维护与备份", "恢复出厂": "维护与备份"
}
const networkFeatureNames = new Set(['路由表','DNS / DHCP','防火墙','DDNS 管理','ZeroTier'])
const deviceFeatureNames = new Set(['家长控制','网络唤醒'])

async function openApplication(page, name) {
  if (networkFeatureNames.has(name)) {
    await page.getByRole('button', { name: '网络', exact: true }).click()
    await page.locator('.v3-network-home .v3-feature-list button').filter({ hasText: name }).first().click()
    return
  }
  if (deviceFeatureNames.has(name)) {
    await page.getByRole('button', { name: '设备', exact: true }).click()
    await page.locator('.v3-inline-links button').filter({ hasText: name }).click()
    return
  }
  await page.getByRole('button', { name: '工具', exact: true }).click()
  const button = page.getByRole('button', { name: '打开' + name, exact: true }).first()
  if (!(await button.isVisible())) {
    await page.getByRole('button', { name: '展开' + appGroups[name], exact: true }).click()
  }
  await button.click()
}


/* Contrast smoke check for common text families. All selected nodes are text
   rendered on either a dark surface or the application's dark canvas.
   Test both backdrops so translucent cards cannot mask unreadable labels. */
async function auditDarkTextContrast(page, selectors) {
  const result = await page.evaluate((queries) => {
    const readRgb = value => {
      const values = String(value).match(/[\d.]+/g)?.map(Number) || []
      return values.length >= 3 ? values.slice(0, 3) : null
    }
    const luminance = rgb => {
      const transform = x => {
        const v = x / 255
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return rgb.map(transform).reduce((sum, value, i) =>
        sum + value * [0.2126, 0.7152, 0.0722][i], 0)
    }
    const contrast = (a, b) => {
      const x = luminance(a), y = luminance(b)
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }
    const backdrops = [[29, 32, 41], [17, 20, 27]]
    const checked = [], failures = []
    for (const query of queries) {
      const elements = [...document.querySelectorAll(query)].filter(node =>
        node.getClientRects().length && node.textContent?.trim())
      for (const node of elements.slice(0, 8)) {
        const color = readRgb(getComputedStyle(node).color)
        if (!color) continue
        const ratio = Math.min(...backdrops.map(bg => contrast(color, bg)))
        checked.push(query)
        if (ratio < 4.5) failures.push({
          selector: query, text: node.textContent.trim().slice(0, 45),
          color, ratio: +ratio.toFixed(2)
        })
      }
    }
    return { checked, failures }
  }, selectors)
  expect(result.checked.length).toBeGreaterThan(0)
  expect(result.failures).toEqual([])
}

let networkBytes = 1024 * 1024
let firewallRuleEnabled = '1'
let zeroTierRpcAllowed = true
let zeroTierInterfaceVisible = false
let zeroTierCliAllowed = true
let ssrExecAllowed = true
let ssrLuciAllowed = true
let terminalDhcpHost = null
let terminalEqosRate = null
let terminalHqosTest = false
let terminalHqosEnabled = false
let terminalHqosSetCount = 0
let terminalHqosRule = null
let wolToolEnabled = true

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
  if (object === 'luci.carbon_update' && method === 'status') return {
    state: 'idle', current: '1.1.5-r1', latest: '1.1.6-r1', manager: 'apk',
    can_upgrade: true, mirror: '', logo: ''
  }
  if (object === 'luci.carbon_update' && method === 'check') return { started: true }
  if (object === 'luci.carbon_update' && method === 'configure') return { mirror: params.mirror || '' }
  if (object === 'luci.carbon_update' && method === 'upgrade') return { started: true }
  if (object === 'luci-zerotier') zeroTierInterfaceVisible = true
  if (object === 'luci-zerotier' && zeroTierRpcAllowed && method === 'status') return { running: true, identity: 'abcdef1234' }
  if (object === 'luci-zerotier' && zeroTierRpcAllowed && method === 'get_networks_peers') return {
    code: 0,
    networks: JSON.stringify([{ id: '1234567890abcdef', name: 'home', status: 'OK',
      mac: 'aa:bb:cc:dd:ee:ff', type: 'PRIVATE', portDeviceName: 'ztsjsdnpbo',
      assignedAddresses: ['10.10.10.2/24'] }]),
    peers: '[]'
  }
  if (object === 'service' && method === 'list' && params.name === 'wechatpush') {
    return { wechatpush: { instances: { instance1: { running: true } } } }
  }
  if (object === 'network.interface' && method === 'dump') return {
    interface: [
      { interface: 'lan', device: 'br-lan', up: true, proto: 'static', 'ipv4-address': [{ address: '192.168.100.1', mask: 24 }] },
      { interface: 'wan', device: 'pppoe-wan', up: true, proto: 'pppoe', uptime: 90061, 'ipv4-address': [{ address: '10.12.4.5' }],
        'dns-server': ['223.5.5.5'], route: [{ target: '0.0.0.0', mask: 0, nexthop: '10.12.4.1' }] }
    ]
  }
  if (object === 'luci' && method === 'getOnlineUsers') return { onlineusers: '9' }
  // Lucky 3.1+ read-only rule editor responses for overlay regression.
  if (object === 'file' && method === 'exec' &&
      params.command === '/usr/libexec/package-manager-call') {
    const action = params.params?.[0]
    const control = (name, version, size, description) => [
      'Package: ' + name, 'Version: ' + version, 'Size: ' + size,
      'Description: ' + description, ''
    ].join('\n') + '\n'
    if (action === 'list-installed') return { code: 0, stdout:
      control('busybox', '1.35.0-1', 40000, 'Busybox') +
      '\n' + control('luci-app-demo', '1.0-1', 1200, 'Demo') }
    if (action === 'list-available') return { code: 0, stdout:
      control('busybox', '1.35.0-2', 42000, 'Busybox update') +
      control('luci-app-demo', '1.0-1', 1200, 'Demo') +
      Array.from({ length: 106 }, (_, i) =>
        control('testpackage-' + String(i).padStart(3, '0'), '1.0', 1000 + i, 'Test package ' + i)
      ).join('\n') }
    return { code: 0, stdout: JSON.stringify({
      code: 0, pkmcmd: 'opkg ' + action, stdout: 'Package operation completed', stderr: ''
    }) }
  }
  if (object === 'file' && method === 'exec' && params.command === '/usr/libexec/lucky-backup') {
    const operation = params.params?.[0]
    if (operation === 'core-status') return { code: 0,
      stdout: JSON.stringify({ ok: true, status: 'ready', info: { Version: '3.1.0' } }) }
    if (operation === 'rules-localips' || operation === 'rules-allowlist') {
      const allowlist = operation === 'rules-allowlist'
      return { code: 0, stdout: JSON.stringify({
        ok: true, token: 'a'.repeat(32), directory: '/etc/lucky',
        name: allowlist ? 'ip-allowlist.txt' : 'localips', content: '192.168.100.0/24\n'
      }) }
    }
    if (operation === 'cleanup') return { code: 0, stdout: '{"ok":true}' }
  }
  if (object === 'file' && method === 'exec' && params.command === '/usr/libexec/lucky-call') {
    return { code: 0, stdout: params.params?.[0] === 'status' ? 'true' : 'x86_64' }
  }
  if (object === 'file' && method === 'exec' && params.command === '/usr/libexec/lucky-watchdog')
    return { code: 0, stdout: '{"enabled":true,"scheduled":true,"paused":false}' }
  if (object === 'file' && method === 'read' && params.path === '/tmp/wechatpush/devices.json') {
    return { data: JSON.stringify({ devices: [
      { name: 'Phone', ip: '192.168.100.88', mac: 'AA:BB:CC:DD:EE:FF', status: 'online', interface: 'LAN', uptime: String(Math.floor(Date.now() / 1000) - 3661) },
      // AP monitor sees a device online although the router ARP lookup failed.
      { name: 'AP备注手机', ip: '192.168.100.89', mac: 'A6:83:E7:2C:91:0F', status: 'online', interface: '5G', uptime: '1小时' },
      { name: 'MacBook-Air', ip: '192.168.100.90', mac: 'F0:EE:7A:91:AA:12', status: 'offline', interface: '5G' }
    ] }) }
  }
  if (object === 'file' && method === 'read' && params.path === '/proc/sys/net/ipv4/tcp_congestion_control') {
    return { data: 'bbr\n' }
  }
  if (object === 'file' && method === 'read' && params.path === '/usr/share/wechatpush/api/diy.json') {
    return { data: '{"url":"https://example.invalid/test","type":{"text":"hello"}}\n' }
  }
  if (object === 'file' && method === 'write' && params.path === '/usr/share/wechatpush/api/diy.json') return {}
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
  if (object === 'luci-rpc' && method === 'getHostHints') return {
    'AA:BB:CC:DD:EE:FF': { name: 'Phone', ipaddrs: ['192.168.100.88'] },
    // Historical host hints intentionally include addresses for offline clients.
    'A6:83:E7:2C:91:0F': { name: 'iPhone-15-Pro', ipaddrs: ['192.168.100.89'] },
    'F0:EE:7A:91:AA:12': { name: 'MacBook-Air', ipaddrs: ['192.168.100.90'] },
    'BB:CC:DD:EE:FF:00': { name: '邻居电脑', ipaddrs: ['192.168.100.99'] }
  }
  if (object === 'hqos' && terminalHqosTest) {
    if (method === 'status') return {
      enabled: terminalHqosEnabled, supported: true, running: terminalHqosEnabled,
      configured_clients: terminalHqosSetCount, backend: 'cpu',
      capabilities: { max_rate: 10000000 }
    }
    if (method === 'get') return { mac: params.mac, name: 'Phone',
      enabled: true, upload: 0, download: 0, connections: 0, ...terminalHqosRule }
    if (method === 'set') {
      terminalHqosSetCount++
      terminalHqosRule = { ...params, enabled: true }
      if (params.upload > 0 || params.download > 0 || params.connections > 0)
        terminalHqosEnabled = true
      return { enabled: terminalHqosEnabled, running: true, supported: true }
    }
  }
  if (object === 'rc' && method === 'list') return {
    network: { enabled: true, running: true },
    firewall: { enabled: true, running: true },
    dnsmasq: { enabled: false, running: true },
    shadowsocksr: { enabled: true, running: true },
    wechatpush: { enabled: true }, // live state comes from service.list procd
    openclash: { enabled: true, running: true },
    'internet-detector': { enabled: true, running: true },
    zerotier: { enabled: true, running: true }
  }
  if (object === 'luci.wol' && method === 'stat') return { etherwake: wolToolEnabled, wakeonlan: false }
  if (object === 'luci.wol' && method === 'exec') return { code: 0, stdout: '' }
  if (object === 'file' && method === 'exec' && params.command === '/sbin/ip') {
    if (params.params?.[0] === '-j' && params.params?.[3] === 'dev' && params.params?.[4] === 'ztsjsdnpbo') {
      return { code: 0, stdout: JSON.stringify([{ ifname: 'ztsjsdnpbo', mtu: 2800,
        addr_info: [{ family: 'inet', local: '10.10.10.2', prefixlen: 24 },
          { family: 'inet6', local: 'fe80::b48e:88ff:fe62:c0c0', prefixlen: 64 }]
      }]) }
    }
    if (params.params?.[1] === 'neigh') return { code: 0, stdout: params.params[0] === '-4'
      ? '192.168.100.88 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE\n192.168.100.89 dev br-lan FAILED\n192.168.100.90 dev br-lan FAILED\n'
      : 'fe80::1 dev br-lan lladdr bb:cc:dd:ee:ff:00 STALE\n' }
    return { code: 0, stdout: 'default via 10.12.4.1 dev pppoe-wan\n10.0.0.0/24 via 10.12.4.1 dev pppoe-wan\n192.168.100.88 dev br-lan proto kernel scope link\n' }
  }
  if (object === 'file' && method === 'exec' && params.command === '/usr/sbin/nft') {
    return { code: 0, stdout: 'table inet fw4 { chain srcnat { fullcone ip saddr 192.168.100.0/24 } }' }
  }
  if (object === 'file' && method === 'exec' && params.command === '/usr/bin/zerotier-cli' && !zeroTierCliAllowed) return null
  if (object === 'file' && method === 'exec' && params.command === '/usr/bin/zerotier-cli') {
    if (params.params?.join(' ') === '-j info') return { code: 0, stdout: JSON.stringify({ address: 'abcdef1234', version: '1.14.0', online: true }) }
    if (params.params?.join(' ') === '-j listnetworks') return { code: 0, stdout: JSON.stringify([{ id: '1234567890abcdef', name: 'home', status: 'OK', mac: 'aa:bb:cc:dd:ee:ff', type: 'PRIVATE', portDeviceName: 'ztsjsdnpbo', assignedAddresses: ['10.10.10.2/24'] }]) }
    return { code: 0, stdout: '200 listnetworks 1234567890abcdef home aa:bb:cc:dd:ee:ff OK PRIVATE zt0 10.10.10.2/24\n' }
  }
  // WeChatPush ACL permits executing its script, but NOT arbitrary /bin/bash.
  if (object === 'file' && method === 'exec' && params.command === '/bin/bash') return null
  if (object === 'file' && method === 'exec' && params.command === '/usr/share/wechatpush/wechatpush') {
    if (params.params?.length === 1 && params.params[0] === 'test') return { code: 0, stdout: '{"url":"https://example.invalid/secret-webhook-key","content":"sensitive request payload"}' }
    return null
  }
  if (object === 'file' && method === 'exec' && !ssrExecAllowed &&
      ['/bin/nc', '/usr/bin/nping'].includes(params.command)) return null
  if (object === 'file' && method === 'exec' && params.command === '/usr/share/shadowsocksr/update_components.sh') {
    return { code: 0, stdout: 'component=xray\ncurrent_version=1.2.0\nlatest_version=1.3.0\npackage_manager=apk\ncan_upgrade=1\nsuccess=1\n' }
  }
  if (object === 'file' && method === 'exec') return { code: 0, stdout: 'test sent' }
  if (object === 'iwinfo' && method === 'devices') return { devices: ['wlan0'] }
  if (object === 'iwinfo' && method === 'assoclist') return {
    results: [{mac:'11:22:33:44:55:66', signal:-56, rx:{rate:144}, tx:{rate:130}, connected_time:50}]
  }
  if (object === 'network.device' && method === 'status') {
    if (params.name === 'ztsjsdnpbo') return { name: 'ztsjsdnpbo', up: true,
      macaddr: 'B6:8E:88:62:C0:C0', mtu: 2800,
      statistics: { rx_bytes: 755610, tx_bytes: 5347738 } }
    if (params.name) {
      networkBytes += 60 * 1024
      return { name: params.name, statistics: {
        rx_bytes: networkBytes, tx_bytes: networkBytes / 2,
        rx_packets: 1000, tx_packets: 900
      }}
    }
    return { 'br-lan': { up: true },
      ...(zeroTierInterfaceVisible ? { ztsjsdnpbo: { name: 'ztsjsdnpbo', up: true } } : {}) }
  }
  if (object === 'uci' && method === 'get' && params.config === 'dhcp') return {
    values: {
      lan: { '.type': 'dhcp', '.name': 'lan', interface: 'lan',
        ignore: '0', start: '100', limit: '150', leasetime: '12h',
        dhcpv6: 'server', ra: 'server' },
      ...(terminalDhcpHost ? { terminal_static: terminalDhcpHost } : {})
    }
  }
  if (object === 'uci' && method === 'get' && params.config === 'eqos') return {
    values: {
      global: { '.type': 'eqos', enabled: '1', wan: 'wan', upload: '50', download: '100' },
      ...(terminalEqosRate ? { eqos_device: terminalEqosRate } : {})
    }
  }
  if (object === 'uci' && method === 'get' && params.config === 'hqos') {
    return terminalHqosTest ? { values: { global: {
      '.type': 'hqos', enabled: terminalHqosEnabled ? '1' : '0',
      backend: 'auto', interface: 'br-lan'
    } } } : null
  }
  if (object === 'uci' && method === 'get' &&
      ['sqm', 'qosify', 'qos'].includes(params.config)) return null
  if (object === 'uci' && method === 'get' && ['nft-limiter', 'nft-qos'].includes(params.config)) return null
  if (object === 'uci' && method === 'add' && params.config === 'dhcp') {
    terminalDhcpHost = { '.type': 'host', ...params.values }
    return { section: 'terminal_static' }
  }
  if (object === 'uci' && method === 'set' && params.config === 'dhcp') {
    terminalDhcpHost = { ...(terminalDhcpHost || { '.type': 'host' }), ...params.values }
    return {}
  }
  if (object === 'uci' && method === 'delete' && params.config === 'dhcp') {
    terminalDhcpHost = null
    return {}
  }
  if (object === 'uci' && method === 'add' && params.config === 'eqos') {
    terminalEqosRate = { '.type': 'device', ...params.values }
    return { section: 'eqos_device' }
  }
  if (object === 'uci' && method === 'delete' && params.config === 'eqos') {
    terminalEqosRate = null
    return {}
  }
  if (object === 'uci' && method === 'get' && params.config === 'luci-wol') return { values: { demo: { '.type': 'target', '.name': 'demo', name: '测试主机', mac: 'AA:BB:CC:DD:EE:FF', iface: 'br-lan' } } }
  if (object === 'uci' && method === 'get' && params.config === 'shadowsocksr') return { values: {
    global: { '.type': 'global', '.name': 'global', global_server: 'node1', run_mode: 'gfw' },
    node1: { '.type': 'servers', '.name': 'node1', alias: '香港节点', type: 'ssr', server: '203.0.113.10', server_port: '8388' },
    node2: { '.type': 'servers', '.name': 'node2', alias: '新加坡节点', type: 'ssr', server: '203.0.113.11', server_port: '8388' },
    node3: { '.type': 'servers', '.name': 'node3', alias: '日本节点', type: 'ssr', server: '203.0.113.12', server_port: '8388' }
  } }
  if (object === 'uci' && method === 'get' && params.config === 'wechatpush') return { values: {
    config: { '.type': 'wechatpush', '.name': 'config', enable: '1', jsonpath: '/usr/share/wechatpush/api/pushplus.json', pushplus_token: 'test-token', sleeptime: '60' }
  } }
  if (object === 'uci' && method === 'get' && params.config === 'openclash') return { values: {
    config: { '.type': 'openclash', '.name': 'config', enable: '1', en_mode: 'fake-ip', proxy_mode: 'rule', ipv6_enable: '0', enable_udp_proxy: '1', router_self_proxy: '1' }
  } }
  if (object === 'uci' && method === 'get' && params.config === 'zerotier') return { values: {
    global: { '.type': 'zerotier', '.name': 'global', enabled: '1' },
    home: { '.type': 'network', '.name': 'home', id: '1234567890abcdef', enabled: '1' }
  } }
  if (object === 'uci' && method === 'get' && params.config === 'firewall') return { values: {
    lan: { '.type': 'zone', '.name': 'lan', name: 'lan', input: 'ACCEPT', output: 'ACCEPT', forward: 'ACCEPT', masq: '0', network: ['lan'] },
    wan: { '.type': 'zone', '.name': 'wan', name: 'wan', input: 'REJECT', output: 'ACCEPT', forward: 'REJECT', masq: '1', network: ['wan','wan6'] },
    rule1: { '.type': 'rule', '.name': 'rule1', name: 'Allow-DHCP-Renew', src: 'wan', proto: 'udp', dest_port: '68', target: 'ACCEPT', enabled: firewallRuleEnabled },
    rule2: { '.type': 'rule', '.name': 'rule2', name: 'Block-Guest-IoT', src: 'lan', dest: 'wan', proto: 'tcp', dest_port: '445', target: 'REJECT', enabled: '0' },
    redirect1: { '.type': 'redirect', '.name': 'redirect1', name: 'Web Admin', src: 'wan', dest: 'lan', proto: 'tcp', src_dport: '8080', dest_ip: '192.168.100.10', dest_port: '80', target: 'DNAT' }
  } }
  if (object === 'uci' && method === 'get' && params.config === 'luci') return { values: {
    main: { '.type': 'core', '.name': 'main', mediaurlbase: '/luci-static/carbon' },
    themes: { '.type': 'internal', '.name': 'themes', Bootstrap: '/luci-static/bootstrap', Carbon: '/luci-static/carbon' }
  } }
  if (object === 'uci' && method === 'get' && params.config === 'network') return { values: {
    cfg123: { '.type': 'route', interface: 'wan', target: '10.0.0.0/24', gateway: '10.12.4.1' },
    lan: { '.type': 'interface', '.name': 'lan', proto: 'static', auto: '1',
      device: 'br-lan', ipaddr: '192.168.100.1', netmask: '255.255.255.0', ip6assign: '64' },
    wan: { '.type': 'interface', '.name': 'wan', proto: 'dhcp', auto: '1',
      device: 'eth0', peerdns: '1' }
  } }
  if (object === 'uci' && method === 'add') return { section: 'new-app-section' }
  if (object === 'uci' && method === 'set' && params.config === 'firewall' && params.section === 'rule1') {
    firewallRuleEnabled = String(params.values?.enabled ?? firewallRuleEnabled)
    return {}
  }
  if (object === 'uci' && method === 'set') return {}
  if (object === 'uci' && method === 'changes') return { changes: [] }
  if (object === 'uci' && ['apply', 'confirm', 'rollback'].includes(method)) return {}
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
  if (object === 'luci-rpc' && method === 'getNetworkDevices') return {
    eth0: { up: true, type: 1, macaddr: '00:11:22:33:44:55', stats: {
      rx_bytes: 10485760, tx_bytes: 5242880, rx_packets: 1000, tx_packets: 500
    }},
    ...(zeroTierInterfaceVisible ? { ztsjsdnpbo: { name: 'ztsjsdnpbo', up: true, mtu: 2800,
      ipaddrs: [{ address: '10.10.10.2', netmask: '255.255.255.0' }],
      ip6addrs: [{ address: 'fe80::b48e:88ff:fe62:c0c0' }],
      stats: { rx_bytes: 755610, tx_bytes: 5347738 } } } : {})
  }
  if (object === 'luci-rpc' && method === 'getWirelessDevices') return { radio0: { up: true } }
  if (object === 'luci' && method === 'getProcessList') return {
    result: [{
      PID: '123', USER: 'root', '%CPU': '0.3%', VSZ: '12345',
      '%MEM': '1.2%', STAT: 'S', PPID: '1', COMMAND: 'rpcd'
    }]
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
    if (args[1] === 'luci-rpc' && args[2] === 'getDHCPLeases') {
    }
    return { jsonrpc: '2.0', id: item.id, result: output == null ? [6] : [0, output] }
  }
  await route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(Array.isArray(req) ? req.map(reply) : reply(req))
  })
}

test('outlined form labels do not overlap placeholders or entered text on narrow Android screens', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/')
  await page.getByRole('button', { name: '添加', exact: true }).click()

  for (const label of ['设备名称 / 备注', 'IP / 域名 / 端口', '登录用户名']) {
    const input = page.getByRole('textbox', { name: label })
    const field = input.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " v-field ")][1]')
    await expect(field).toHaveClass(/v-field--active/)

    // The painted title must remain above the editable text zone both empty
    // and filled; browser autofocus, prefilled values and placeholders must
    // never return it to the text baseline.
    const clearOfText = () => field.evaluate(element => {
      const textInput = element.querySelector('input')
      const textRect = textInput.getBoundingClientRect()
      const visibleLabels = [...element.querySelectorAll('.v-field-label')]
        .filter(node => {
          const style = getComputedStyle(node)
          return style.visibility !== 'hidden' && Number(style.opacity) > 0.5
        })
      return visibleLabels.length > 0 && visibleLabels.every(node =>
        node.getBoundingClientRect().bottom < textRect.top + textRect.height * 0.6)
    })
    await expect.poll(clearOfText).toBe(true)
    await input.fill('test-value')
    await expect.poll(clearOfText).toBe(true)
  }
  await page.getByRole('button', { name: '取消', exact: true }).click()
})

test('v3 keeps five tabs before login and preserves settings hierarchy', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/')
  const topBar = page.locator('.top-bar')
  await expect(topBar.getByRole('heading', { name: '路由器管理', level: 1 })).toBeVisible()
  await expect(topBar.getByRole('button', { name: '刷新设备状态' })).toBeVisible()
  await expect(topBar.getByRole('button', { name: '添加', exact: true })).toBeVisible()
  await expect(page.locator('.material-side-drawer')).toHaveCount(0)
  await expect(page.locator('.standard-bottom .v-btn')).toHaveCount(5)
  await expect(page.getByRole('button', { name: '设备', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await expect(page.getByTestId('more-page')).toBeVisible()
  await expect(page.locator('.more-page .more-menu-item')).toHaveCount(5)
  await page.getByRole('button', { name: '打开设置' }).click()
  await expect(page.locator('.settings-page .more-menu-item')).toHaveCount(5)
  await page.getByRole('button', { name: '打开显示设置' }).click()
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('显示')
  await expect(page.locator('.standard-bottom .v-btn')).toHaveCount(5)
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('settings')
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('设置')
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('settings')
  await expect(page.getByTestId('more-page')).toBeVisible()
  await page.getByRole('button', { name: '概览', exact: true }).click()
  await expect(page.getByRole('heading', { name: '路由器管理' })).toBeVisible()
})

test('authenticate to real RPC adapter and operate Material pages and bottom bars', async ({ page }) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => {
    if (m.type() === 'warning' && m.text().includes('Failed to resolve component')) errors.push(m.text())
  })
  await page.route('**/ubus', handler)
  await page.route('**/cgi-bin/luci/admin/services/shadowsocksr/component_status?**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ component: 'xray', current_version: '1.2.0',
        latest_version: '1.3.0', can_upgrade: '1', package_manager: 'apk' }) })
  })
  await page.route('**/cgi-bin/luci/admin/services/shadowsocksr/ping?**', async route => {
    if (!ssrLuciAllowed) {
      await route.fulfill({ status: 403, contentType: 'text/html', body: '<h1>Access denied</h1>' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ socket: true, ping: 23 }) })
  })
  await page.goto('/')
  fs.mkdirSync('test-results/screenshots', { recursive: true })
  await expect(page.getByRole('heading', { name: '路由器管理' })).toBeVisible()
  await expect(page.locator('.v-application')).toBeVisible()
  await expect(page.locator('v-app, v-card, v-btn')).toHaveCount(0)
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await expect(page.locator('.more-page .more-menu-item')).toHaveCount(5)
  await page.getByRole('button', { name: '打开路由器管理' }).click()
  await expect(page.locator('.settings-page-heading')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '路由器管理' })).toBeVisible()

  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: '打开显示设置' }).click()
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('显示')
  await expect(page.getByRole('button', { name: '标准底栏' })).toBeVisible()
  await expect(page.getByRole('button', { name: '液态底栏' })).toBeVisible()
  const motionSwitch=page.getByLabel('界面动效')
  await expect(motionSwitch).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-xxwrt-motion','on')
  await motionSwitch.click()
  await expect(motionSwitch).not.toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-xxwrt-motion','off')
  await page.getByRole('button', { name: '液态底栏' }).click()
  await expect(page.locator('.settings-nav-toggle .v-btn--active')).toContainText('液态')
  // Turning animations off also replaces the glass shader with static chrome.
  await expect(page.getByRole('button', { name: '标准底栏' })).toBeVisible()
  await motionSwitch.click()
  await expect(page.locator('html')).toHaveAttribute('data-xxwrt-motion','on')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('html')).toHaveAttribute('data-xxwrt-motion','off')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('html')).toHaveAttribute('data-xxwrt-motion','on')
  await page.getByRole('button', { name: '标准底栏' }).click()
  await page.getByRole('button', { name: '深色主题' }).click()
  await expect(page.locator('.theme-is-dark')).toBeVisible()
  await auditDarkTextContrast(page, ['.settings-option-heading p', '.settings-switch-row p'])
  await page.screenshot({ path: 'test-results/screenshots/settings-display.png', fullPage: true })

  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('设置')
  await page.getByRole('button', { name: '打开隐私设置' }).click()
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('隐私')
  await expect(page.getByLabel('隐藏主机名')).toBeVisible()
  await expect(page.getByLabel('隐藏 IP / 域名')).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/settings-privacy.png', fullPage: true })
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('settings')
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('设置')
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('settings')
  await expect(page.getByTestId('more-page')).toBeVisible()
  await page.getByRole('button', { name: '概览', exact: true }).click()
  await expect(page.getByRole('heading', { name: '路由器管理' })).toBeVisible()
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
  await expect(page.getByText('J4125 SoftRouter').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '展开系统与硬件详情' })).toBeVisible()
  await page.getByRole('button', { name: '展开系统与硬件详情' }).click()
  await expect(page.getByText('38℃')).toBeVisible()
  await expect(page.locator('.v3-health-metrics .v3-metric')).toHaveCount(4)
  await expect(page.locator('.v3-health-metrics')).toContainText('存储')
  await expect(page.locator('.v3-overview-network-state')).toBeVisible()
  await expect(page.locator('.v3-overview-network-state')).toContainText('WAN')
  await expect(page.locator('.v3-overview-network-state')).toContainText('IPv6')
  // The overview shortcut must remember its originating tab on Android Back.
  await page.locator('.v3-shortcuts .v3-shortcut').filter({ hasText: '接口' }).click()
  await expect(page.locator('.interface-card')).toHaveCount(2)
  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect(page.locator('.v3-overview')).toBeVisible()
  await expect(page.locator('.standard-bottom .v-btn--active')).toContainText('概览')
  await auditDarkTextContrast(page, ['.router-toolbar-context', '.details span', '.device-heading-label p', '.storage-label small', '.ethernet-port-counters'])
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /user-scalable=no/)
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /maximum-scale=1/);

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
  await expect(page.locator('.router-toolbar-title')).not.toContainText('更新于')
  await expect(page.locator('.router-toolbar-title')).not.toContainText('192.168.100.1')
  await expect(page.getByTestId('device-page-meta')).toHaveCount(0)
  await expect(page.locator('.device-page-meta')).toHaveCount(0)
  await expect(page.getByText('非官方 Material UI')).toHaveCount(0)
  await expect(page.getByText('通过真实 QWRT ubus 接口读取数据')).toHaveCount(0)
  await expect(page.locator('.device-page-meta')).toHaveCount(0)
  await expect(page.locator('.device-card.v-card')).toBeVisible()
  await expect(page.getByText('以太网接口')).toBeVisible()
  await expect(page.getByText('eth0', { exact: true })).toBeVisible()
  await expect(page.locator('.ethernet-port-item')).toHaveCount(1)
  await expect(page.locator('.ethernet-port-icon .v-icon')).toBeVisible()
  await expect(page.locator('.ethernet-port-row')).toHaveCount(0)
  await expect(page.locator('.ethernet-port-traffic')).toContainText('RX')
  await expect(page.locator('.ethernet-port-traffic')).toContainText('TX')
  await expect(page.locator('.ethernet-port-counters')).toContainText('累计接收')
  await expect(page.locator('.ethernet-port-counters')).toContainText('累计发送')
  await expect(page.getByText('已连接', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('磁盘占用')).toBeVisible()
  await expect(page.getByText('系统可写空间')).toBeVisible()
  await expect(page.getByText('临时空间')).toBeVisible()
  await expect(page.locator('.storage-card').getByText('75%', { exact: true })).toBeVisible()
  await expect(page.locator('.storage-card').getByText('25%', { exact: true })).toBeVisible()
  await expect(page.locator('.v-bottom-navigation')).toBeVisible()
  // Leave the statistics screen unopened while background sampling builds history.
  await page.waitForTimeout(7200)
  await page.getByRole('button', { name: '详细监控', exact: true }).click()
  await expect(page.getByTestId('device-page-meta')).toHaveCount(0)
  await expect(page.locator('.router-toolbar-title')).not.toContainText('更新于')
  await expect(page.getByText('实时带宽')).toBeVisible()
  await expect(page.getByText('系统负载历史')).toBeVisible()
  await expect(page.locator('.realtime-chart')).toHaveCount(2, { timeout: 3000 })
  await page.waitForTimeout(1200)
  await expect(page.locator('.realtime-chart')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/screenshots/actual-traffic-history.png', fullPage: true })
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('page')
  await expect(page.getByText('J4125 SoftRouter').first()).toBeVisible()
  await page.getByRole('button', { name: '详细监控', exact: true }).click()
  await expect(page.getByText('实时带宽')).toBeVisible()
  await page.getByRole('button', { name: '概览', exact: true }).click()

  // Test page scrolling in the actual logged-in screen.
  await page.evaluate(() => window.scrollTo(0, 0))
  const top = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(top + 10)
  await page.evaluate(() => window.scrollTo(0, 480))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(10)
  fs.mkdirSync('test-results/screenshots', { recursive: true })
  await page.screenshot({ path: 'test-results/screenshots/live-standard.png', fullPage: true })

  await page.getByRole('button', { name: '设备', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.getByTestId('device-page-meta')).toHaveCount(0)
  await expect(page.locator('.router-toolbar-title')).not.toContainText('更新于')
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('设备')
  await expect(page.locator('.terminal-category-grid')).toBeVisible()
  await expect(page.getByRole('button', { name: /全部终端/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.terminal-tile')).toHaveCount(5, { timeout: 15000 })
  // One OpenAppFilter record shares Phone's MAC and must not create a duplicate.
  await expect(page.locator('.terminal-tile').filter({ has: page.getByText('Phone', { exact: true }) })).toHaveCount(1)
  await page.getByRole('button', { name: /DHCPv4/ }).click()
  await expect(page.locator('.terminal-tile')).toHaveCount(3, { timeout: 15000 })
  await auditDarkTextContrast(page, ['.terminal-header p', '.terminal-mac', '.terminal-kind', '.terminal-source'])
  await expect(page.locator('.terminal-online-dot.is-online')).toHaveCount(2)
  await expect(page.locator('.terminal-online-dot.is-offline')).toHaveCount(1)
  // Proven online, proven offline and unknown are distinct filter states.
  await page.locator('.v3-terminal-status button').filter({ hasText: '在线' }).click()
  await expect(page.locator('.terminal-tile')).toHaveCount(2)
  await page.locator('.v3-terminal-status button').first().click()
  await expect(page.locator('.terminal-tile')).toHaveCount(3)
  // A stored host IP must never turn an unreachable terminal green.
  await expect(page.locator('.terminal-tile').filter({ hasText: 'AP备注手机' }).locator('.terminal-online-dot')).toHaveClass(/is-online/)
  await expect(page.locator('.terminal-tile').filter({ hasText: 'MacBook-Air' }).locator('.terminal-online-dot')).toHaveClass(/is-offline/)
  await expect(page.getByText('Apple · 手机')).toBeVisible()
  await expect(page.locator('.terminal-identity--brand')).toHaveCount(2)
  await expect(page.getByText('随机 MAC')).toHaveCount(2)
  await expect(page.getByText('MacBook-Air')).toBeVisible()
  await expect(page.locator('.terminal-category-card')).toHaveCount(5)
  await expect(page.locator('.v3-terminal-status button')).toHaveCount(4)
  await expect(page.locator('.terminal-category-grid')).toHaveCSS('display', 'flex')
  await expect(page.getByRole('button', { name: /DHCPv4/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /DHCPv6/ }).click()
  await expect(page.getByRole('button', { name: /DHCPv6/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.terminal-online-dot.is-unknown')).toHaveCount(1)
  await expect(page.getByText('IPv6-Phone')).toBeVisible()
  await page.getByRole('button', { name: /无线终端/ }).click()
  await expect(page.getByText('11:22:33:44:55:66')).toBeVisible()
  await page.getByRole('button', { name: /应用用户/ }).click()
  await expect(page.getByText('Phone', { exact: true })).toBeVisible()
  await expect(page.locator('.terminal-tile')).toHaveCount(1)
  await expect(page.locator('.terminal-tile').first()).toContainText('应用用户')
  await page.getByRole('textbox', { name: '搜索名称、IP 或 MAC' }).fill('NO-MATCH')
  await expect(page.locator('.terminal-tile')).toHaveCount(0)
  await page.getByRole('textbox', { name: '搜索名称、IP 或 MAC' }).fill('Phone')
  await expect(page.locator('.terminal-tile')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索名称、IP 或 MAC' }).fill('')
  await page.getByRole('button', { name: /DHCPv4/ }).click()
  await expect(page.getByText('Phone', { exact: true })).toBeVisible()
  await expect(page.locator('.terminal-tile.v-card')).toHaveCount(3)
  await page.getByRole('textbox', { name: '搜索名称、IP 或 MAC' }).fill('NO-MATCH')
  await expect(page.locator('.terminal-tile.v-card')).toHaveCount(0)
  await page.getByRole('textbox', { name: '搜索名称、IP 或 MAC' }).fill('192.168.100.88')
  await expect(page.locator('.terminal-tile.v-card')).toHaveCount(1)
  await page.locator('.terminal-search .v-field__clearable').click()
  await expect(page.locator('.terminal-tile.v-card')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/screenshots/terminal-cards.png', fullPage: true })
  await page.getByText('Phone', { exact: true }).click()
  await expect(page.getByText('终端管理')).toBeVisible()
  await expect(page.getByRole('dialog').getByText('AA:BB:CC:DD:EE:FF', { exact: true })).toBeVisible()
  await expect(page.getByText('静态 IPv4 绑定')).toBeVisible()
  await expect(page.getByText('终端网速限制')).toBeVisible()
  await page.getByRole('dialog').getByText('为该 MAC 固定分配 IPv4', { exact: true }).click()
  await page.getByRole('dialog').locator('input[placeholder="例如：192.168.100.50"]').fill('192.168.100.50')
  await page.getByRole('button', { name: '保存静态 IP' }).click()
  await expect(page.getByText('已保存并应用到路由器', { exact: false })).toBeVisible()
  await page.getByRole('dialog').locator('input[type="number"]').first().fill('10')
  await page.getByRole('dialog').locator('input[type="number"]').last().fill('5')
  await page.getByRole('button', { name: '保存终端限速' }).click()
  await expect(page.getByRole('dialog').locator('input[type="number"]').first()).toHaveValue('10')
  await expect(page.getByRole('dialog').locator('input[type="number"]').last()).toHaveValue('5')
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('dialog')
  await expect(page.getByText('终端管理')).not.toBeVisible()
  await page.getByText('Phone', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '网络', exact: true }).click()
  await expect(page.locator('.v3-network-home')).toBeVisible()
  await page.locator('.v3-network-home .v3-feature-list button').filter({ hasText: '网络接口' }).click()
  await expect(page.getByTestId('device-page-meta')).toHaveCount(0)
  await expect(page.getByText('运行秒数')).toHaveCount(0)
  await expect(page.getByText('1天 1小时 1分钟', { exact: true })).toBeVisible()
  await expect(page.getByText('10.12.4.5').first()).toBeVisible()
  // Network hub already selected “interfaces”; no redundant secondary category picker.
  await expect(page.locator('.network-category-grid')).toHaveCount(0)
  await expect(page.locator('.interface-card')).toHaveCount(2)
  await auditDarkTextContrast(page, ['.network-interface-details span', '.interface-card .muted-hint'])
  // Network config is fetched from UCI independently of the read-only netifd
  // status cards. LAN DHCP server and WAN DHCP client are separate settings.
  await expect(page.getByRole('button', { name: '配置接口 lan' })).toBeEnabled()
  await page.getByRole('button', { name: '配置接口 lan' }).click()
  await expect(page.getByText('配置网络接口 · lan')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'IPv4 地址' })).toHaveValue('192.168.100.1')
  await page.getByRole('tab', { name: 'DHCP 服务端' }).click()
  await expect(page.getByText('不是上级网络的 DHCP 客户端')).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: '地址池起始偏移（例如 100）' })).toHaveValue('100')
  // Simulate Android Back gesture while the network editor is visible.
  // It must close only the modal, never return to the router/device list.
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('dialog')
  await expect(page.getByText('配置网络接口 · lan')).not.toBeVisible()
  await expect(page.locator('.interface-card')).toHaveCount(2)
  await page.getByRole('button', { name: '配置接口 wan' }).click()
  await expect(page.getByText('配置网络接口 · wan')).toBeVisible()
  await page.getByRole('tab', { name: '常规' }).click()
  await expect(page.getByText('DHCP 客户端', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('dialog')
  await expect(page.getByText('配置网络接口 · wan')).not.toBeVisible()
  await expect(page.locator('.interface-card')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '断开接口 lan' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '断开接口 wan' })).toBeDisabled()
  // All network edits use timed rollback and require an explicit confirmation.
  await page.getByRole('button', { name: '配置接口 wan' }).click()
  // Vuetify renders VSwitch using a native checkbox. Clicking the visible
  // associated label is stable across Vuetify accessibility-role changes.
  const wanAutoInput = page.locator('.network-interface-editor .v-switch input[type="checkbox"]').first()
  await expect(wanAutoInput).toBeChecked()
  await page.locator('.network-interface-editor').getByText('开机自动启用接口', { exact: true }).click()
  await expect(wanAutoInput).not.toBeChecked()
  await page.getByRole('button', { name: '保存并应用（可回滚）' }).click()
  await expect(page.getByRole('button', { name: '确认保留配置' }).last()).toBeVisible()
  // A staged UCI change must not be abandoned or auto-confirmed by Back.
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('busy')
  await expect(page.getByText('配置网络接口 · wan')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认保留配置' }).last()).toBeVisible()
  // The toolbar switch handler must also honor the network editor's pending
  // confirmation. Dispatch directly because the modal normally intercepts taps.
  await page.getByRole('button', { name: '切换路由器' }).evaluate(button => button.click())
  await expect(page.getByText('配置网络接口 · wan')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认保留配置' }).last()).toBeVisible()
  await expect(page.getByRole('heading', { name: '路由器管理' })).toHaveCount(0)
  await page.getByRole('button', { name: '确认保留配置' }).last().click()
  await expect(page.getByText('已确认保留接口配置')).toBeVisible()
  await page.getByRole('button', { name: '返回上一页' }).click()
  await page.locator('.v3-network-home .v3-feature-list button').filter({ hasText: '物理设备' }).click()
  await expect(page.locator('.hardware-list')).toBeVisible()
  await expect(page.locator('.hardware-panel')).toHaveCount(1)
  await expect(page.locator('.hardware-panel').first().getByText('eth0')).toBeVisible()
  await expect(page.locator('.hardware-panel').first().locator('.hardware-sub')).toContainText('以太网')
  await auditDarkTextContrast(page, ['.hardware-sub', '.hardware-group-title'])
  await page.locator('.hardware-panel').first().locator('.v-expansion-panel-title').click()
  await expect(page.locator('.hardware-panel').first().getByText('00:11:22:33:44:55').last()).toBeVisible()
  await page.getByRole('button', { name: '返回上一页' }).click()
  await page.locator('.v3-network-home .v3-feature-list button').filter({ hasText: '无线设备' }).click()
  await expect(page.locator('.hardware-panel')).toHaveCount(1)
  await page.getByRole('button', { name: '返回上一页' }).click()
  await page.locator('.v3-network-home .v3-feature-list button').filter({ hasText: '网络接口' }).click()
  await expect(page.locator('.interface-card')).toHaveCount(2)
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).resolves.toBeTruthy()
  await page.screenshot({ path: 'test-results/screenshots/compact-network-interfaces.png', fullPage: true })
  await page.getByRole('button', { name: '工具', exact: true }).click()
  await expect(page.getByTestId('device-page-meta')).toHaveCount(0)
  await expect(page.locator('.router-toolbar-title')).not.toContainText('更新于')
  await expect(page.getByText('工具箱')).toBeVisible()
  await expect(page.locator('.app-favorite-tile')).toHaveCount(6)
  await expect(page.locator('.app-category-card')).toHaveCount(4)
  await expect(page.locator('.app-tool-row')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开Lucky' })).toBeVisible()
  await page.getByRole('textbox', { name: '搜索应用或功能' }).fill('Vlmcsd')
  await expect(page.getByRole('button', { name: '打开Vlmcsd KMS' })).toBeVisible()
  await expect(page.locator('.app-search-results .app-tool-row')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索应用或功能' }).fill('')
  await page.screenshot({ path: 'test-results/screenshots/compact-app-hub.png', fullPage: true })
  // Action feedback uses floating snackbars instead of permanent page-top alerts.
  await openApplication(page, 'Lucky')
  const luckyPanel = page.locator('.lucky-app-panel')
  await expect(luckyPanel.getByRole('button', { name: '刷新', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: '访问规则' }).click()
  await expect(page.locator('.v-snackbar').filter({ hasText: 'ip-allowlist.txt 已从路由器读取' })).toBeVisible()
  await expect(luckyPanel.locator('.v-alert').filter({ hasText: 'ip-allowlist.txt 已从路由器读取' })).toHaveCount(0)
  await page.getByRole('button', { name: '返回上一页' }).click()

  await openApplication(page, 'Vlmcsd KMS')
  const kmsPanel = page.locator('.vlmcsd-panel')
  await expect(kmsPanel.getByRole('button', { name: '刷新', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: '配置文件' }).click()
  const kmsEditor = kmsPanel.locator('.vlmcsd-config-editor textarea')
  await expect(kmsEditor).toHaveAttribute('rows', '6')
  await expect.poll(() => kmsEditor.evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(210)
  await page.getByRole('button', { name: '刷新当前页面' }).click()
  await expect(page.locator('.v-snackbar').filter({ hasText: 'Vlmcsd 状态已刷新' })).toBeVisible()
  await page.getByRole('button', { name: '返回上一页' }).click()

  await openApplication(page, 'ShadowSocksR Plus+')
  await expect(page.getByRole('heading', { name: '代理节点' })).toBeVisible()
  // Tapping the already selected Apps tab returns from a nested app page.
  await page.getByRole('button', { name: '工具', exact: true }).click()
  await expect(page.getByText('工具箱')).toBeVisible()
  await openApplication(page, 'ShadowSocksR Plus+')
  await expect(page.getByRole('heading', { name: '代理节点' })).toBeVisible()
  await expect(page.getByText('香港节点', { exact: true }).first()).toBeVisible()
  await auditDarkTextContrast(page, ['.router-app-summary span', '.app-compact-sub', '.muted-hint'])
  await page.getByRole('button', { name: '批量探测节点' }).click()
  await expect(page.getByText(/路由器插件检测可达|TCP 可连接/).first()).toBeVisible()
  await expect(page.locator('.ssr-node-probe')).toHaveCount(3)
  ssrLuciAllowed = false
  ssrExecAllowed = false
  await page.getByRole('button', { name: '批量探测节点' }).click()
  await expect(page.getByText(/路由器侧 SSR Plus\+ 探测接口不可用/)).toBeVisible()
  await expect(page.locator('.ssr-node-probe')).toHaveCount(0)
  ssrLuciAllowed = true
  ssrExecAllowed = true
  await page.getByRole('button', { name: '运行状态' }).click()
  await expect(page.getByText('SSR Plus+ 运行状态')).toBeVisible()
  await page.getByRole('button', { name: '组件更新' }).click()
  await expect(page.getByText('SSR Plus+ 组件更新')).toBeVisible()
  await page.getByRole('button', { name: '检测更新' }).click()
  await expect(page.getByText('检测到可安装更新')).toBeVisible()
  await page.getByRole('button', { name: '安装组件更新' }).click()
  await expect(page.getByText('确认安装 SSR Plus+ 更新？')).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()
  await page.getByRole('button', { name: '返回上一页' }).click()
  await openApplication(page, '微信推送')
  await expect(page.getByText('启用微信推送')).toBeVisible()
  await expect(page.getByText('PushPlus', { exact: true }).first()).toBeVisible()
  await page.getByRole('tab', { name: '在线设备' }).click()
  await expect(page.locator('.wechat-device-address').first()).toBeVisible()
  await auditDarkTextContrast(page, ['.wechat-device-address', '.wechat-device-address>span', '.app-compact-sub'])
  await expect(page.locator('.wechat-online-row')).toHaveCount(2)
  await expect(page.locator('.wechat-device-address')).toHaveCount(2)
  await expect(page.locator('.wechat-device-address').first().locator('.wechat-device-ip')).toContainText('192.168.100.88')
  await expect(page.locator('.wechat-device-address').first().locator('.wechat-device-mac')).toContainText('AA:BB:CC:DD:EE:FF')
  await expect(page.locator('.wechat-device-address').first()).toHaveCSS('white-space', 'nowrap')
  await expect(page.getByText('在线 1小时1分钟')).toBeVisible()
  await expect(page.getByText('AP备注手机', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '推送内容' }).click()
  await expect(page.getByText('设备上线通知')).toBeVisible()
  await expect(page.getByText('CPU 负载告警')).toBeVisible()
  await page.getByRole('tab', { name: '高级' }).click()
  await expect(page.getByText('小米 AP 设备信息辅助')).toBeVisible()
  await page.getByRole('tab', { name: '基本配置' }).click()
  await page.getByRole('button', { name: '发送测试推送' }).click()
  await expect(page.getByText('测试推送命令已执行，请检查接收端是否收到消息')).toBeVisible()
  await expect(page.getByText('https://example.invalid/secret-webhook-key')).toHaveCount(0)
  await expect(page.getByText('sensitive request payload')).toHaveCount(0)
  await page.getByRole('button', { name: '返回上一页' }).click()
  await openApplication(page, 'OpenClash')
  await expect(page.getByText('代理模式', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('运行模式', { exact: true }).last().first()).toBeVisible()
  await page.getByRole('button', { name: '返回上一页' }).click()
  await openApplication(page, 'Internet Detector')
  await expect(page.locator('.detector-row').first().getByText('正常', { exact: true })).toBeVisible()
  await auditDarkTextContrast(page, ['.app-compact-sub', '.router-app-summary span', '.muted-hint'])
  await page.getByRole('button', { name: '返回上一页' }).click()
  await openApplication(page, 'Carbon 主题设置')
  await expect(page.getByText('当前主题', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('Carbon 主题更新')).toBeVisible()
  await page.getByRole('button', { name: '检查更新' }).click()
  await expect(page.getByText('检测到可安装的 Carbon 新版本')).toBeVisible()
  await expect(page.getByRole('button', { name: '安装已验证更新' })).toBeEnabled()
  await page.getByRole('button', { name: '返回上一页' }).click()
  await openApplication(page, 'ZeroTier')
  await expect(page.getByText('1234567890abcdef').first()).toBeVisible()
  // The duplicate runtime network card has been removed; its network still
  // appears in the joined networks list and its NIC details remain visible.
  await expect(page.locator('.zt-network-card:not(.zt-interface-card)')).toHaveCount(0)
  await expect(page.getByText('当前运行网络信息')).toBeVisible()
  await expect(page.getByText('节点 ID')).toBeVisible()
  await expect(page.getByText('abcdef1234')).toBeVisible()
  const interfaceCard = page.locator('.zt-interface-card').filter({ hasText: 'ztsjsdnpbo' })
  await expect(interfaceCard).toBeVisible()
  await expect(interfaceCard.getByText('B6:8E:88:62:C0:C0')).toBeVisible()
  await expect(interfaceCard.getByText('10.10.10.2')).toBeVisible()
  await expect(interfaceCard.getByText('fe80::b48e:88ff:fe62:c0c0')).toBeVisible()
  await expect(interfaceCard.getByText('2800')).toBeVisible()
  await expect(interfaceCard.getByText('737.9 KiB')).toBeVisible()
  await expect(interfaceCard.getByText('5.1 MiB')).toBeVisible()
  await auditDarkTextContrast(page, ['.router-app-summary span', '.zt-interface-card .zt-interface-row'])
  zeroTierRpcAllowed = false
  zeroTierCliAllowed = false
  await page.getByRole('button', { name: '刷新当前页面' }).click()
  await expect(page.getByText(/未开放实时 ZeroTier 状态读取接口/)).toBeVisible()
  // No duplicate runtime card is shown, even when ZeroTier runtime RPC
  // is inaccessible. Only the real interface state remains visible.
  await expect(page.locator('.zt-network-card:not(.zt-interface-card)')).toHaveCount(0)
  await expect(interfaceCard.getByText('接口已启用', { exact: true })).toBeVisible()
  await expect(page.getByText('1234567890abcdef').first()).toBeVisible()
  zeroTierRpcAllowed = true
  zeroTierCliAllowed = true
  await page.getByRole('button', { name: '返回上一页' }).click()
  await openApplication(page, '防火墙')
  await expect(page.getByText('区域策略', { exact: true })).toBeVisible()
  await expect(page.getByText('Full Cone NAT')).toBeVisible()
  await expect(page.getByText('BBR', { exact: true })).toBeVisible()
  await expect(page.locator('.firewall-policy-preview')).toHaveCount(2)
  await auditDarkTextContrast(page, ['.router-app-summary span', '.firewall-kernel-item span', '.firewall-zone-title small'])
  await expect(page.locator('.firewall-policy-preview').first()).toContainText('入站 ACCEPT')
  await expect(page.locator('.firewall-policy-preview').first()).toContainText('出站 ACCEPT')
  await expect(page.locator('.firewall-policy-preview').first()).toContainText('转发 ACCEPT')
  await expect(page.locator('.firewall-policy-preview').last()).toContainText('入站 REJECT')
  await expect(page.locator('.firewall-policy-preview').last()).toContainText('出站 ACCEPT')
  await expect(page.locator('.firewall-policy-preview').last()).toContainText('转发 REJECT')
  await expect(page.getByText('Web Admin')).toBeVisible()
  await expect(page.locator('.firewall-rule-entry')).toHaveCount(2)
  await expect(page.locator('.firewall-rule-entry').filter({ hasText: 'Allow-DHCP-Renew' })).toContainText('目标端口')
  await expect(page.locator('.firewall-rule-entry').filter({ hasText: 'Allow-DHCP-Renew' })).toContainText('68')
  await expect(page.locator('.firewall-rule-entry').filter({ hasText: 'Block-Guest-IoT' })).toContainText('已停用')
  await expect(page.getByLabel('规则状态：已启用')).toHaveClass(/firewall-rule-status-chip--enabled/)
  await expect(page.getByLabel('规则状态：已停用')).toHaveClass(/firewall-rule-status-chip--disabled/)
  // Verify the status capsules' *actual computed* foreground/background contrast
  // in both modes; disabled must be visually distinct, not a pale tonal twin.
  const statusContrast = await page.evaluate(() => {
    const root = document.querySelector('.material-demo')
    const original = root.classList.contains('theme-is-dark')
    const parseRgb = value => [...value.matchAll(/[\d.]+/g)].slice(0, 3).map(x => +x[0])
    const luminance = rgb => rgb.map(v => {
      const value = v / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0)
    const contrast = (a, b) => {
      const left = luminance(a), right = luminance(b)
      return (Math.max(left, right) + .05) / (Math.min(left, right) + .05)
    }
    try {
      return [false, true].map(dark => {
        root.classList.toggle('theme-is-dark', dark)
        const samples = ['enabled', 'disabled'].map(state => {
          const chip = document.querySelector('.firewall-rule-status-chip--' + state)
          const style = getComputedStyle(chip)
          return { state, ratio: contrast(parseRgb(style.color), parseRgb(style.backgroundColor)),
            background: style.backgroundColor }
        })
        return { dark, samples }
      })
    } finally {
      root.classList.toggle('theme-is-dark', original)
    }
  })
  for (const theme of statusContrast) {
    for (const chip of theme.samples) {
      expect(chip.ratio, `contrast ${chip.state} dark=${theme.dark}`).toBeGreaterThanOrEqual(4.5)
    }
    expect(theme.samples[0].background).not.toBe(theme.samples[1].background)
  }
  await page.getByRole('button', { name: /已停用规则 1/ }).click()
  await expect(page.locator('.firewall-rule-entry')).toHaveCount(1)
  await expect(page.getByText('Block-Guest-IoT')).toBeVisible()
  await page.getByRole('button', { name: /全部规则 2/ }).click()
  await page.getByRole('textbox', { name: '搜索防火墙规则' }).fill('dhcp')
  await expect(page.locator('.firewall-rule-entry')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索防火墙规则' }).fill('')
  await page.screenshot({ path: 'test-results/screenshots/compact-firewall-rules.png', fullPage: true })
  await page.getByLabel('启用规则 Allow-DHCP-Renew').click()
  await expect(page.getByText('停用防火墙规则？')).toBeVisible()
  await page.getByRole('button', { name: '确认应用' }).click()
  await expect(page.locator('.firewall-rule-entry').filter({ hasText: 'Allow-DHCP-Renew' })).toContainText('已停用')
  await expect(page.locator('.firewall-rule-entry').filter({ hasText: 'Allow-DHCP-Renew' }).getByLabel('规则状态：已停用')).toBeVisible()
  await expect(page.locator('.firewall-rule-entry').filter({ hasText: 'Allow-DHCP-Renew' }).getByLabel('规则状态：已停用')).toHaveClass(/firewall-rule-status-chip--disabled/)
  expect(firewallRuleEnabled).toBe('0')
  await expect(page.getByText('已启用 0', { exact: false }).first()).toBeVisible()
  // Defer each list's first RPC: no empty states or zero-count cards before data loads.
  async function holdToolRpc(object, method) {
    let notify, release
    const started = new Promise(resolve => { notify = resolve })
    const gate = new Promise(resolve => { release = resolve })
    const interceptor = async route => {
      const req = route.request().postDataJSON()
      const items = Array.isArray(req) ? req : [req]
      if (items.some(item => item.params?.[1] === object && item.params?.[2] === method)) {
        notify()
        await gate
      }
      await handler(route)
    }
    await page.route('**/ubus', interceptor)
    return { started, resume: () => release(), dispose: () => page.unroute('**/ubus', interceptor) }
  }

  await page.getByRole('button', { name: '返回上一页' }).click()
  const heldProcess = await holdToolRpc('luci', 'getProcessList')
  await openApplication(page, '进程')
  await heldProcess.started
  await expect(page.getByText('正在读取进程数据…')).toBeVisible()
  await expect(page.getByText('暂无进程数据')).toHaveCount(0)
  await expect(page.locator('.compact-system-list')).toHaveCount(0)
  heldProcess.resume()
  await expect(page.getByText('rpcd')).toBeVisible()
  await heldProcess.dispose()
  await expect(page.getByText('状态 S')).toBeVisible()
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('page')
  await expect(page.getByText('工具箱')).toBeVisible()
  await openApplication(page, '进程')
  await expect(page.getByText('rpcd')).toBeVisible()
  await expect(page.locator('.compact-system-list .compact-entry')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索进程' }).fill('rpcd')
  await expect(page.locator('.compact-system-list .compact-entry')).toHaveCount(1)
  await page.getByRole('button', { name: '查看进程 123 完整命令' }).click()
  await expect(page.getByText('完整命令')).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/compact-processes.png', fullPage: true })
  await page.getByRole('button', { name: '返回上一页' }).click()
  await openApplication(page, '启动项')
  const expectedStartupServices = Object.keys(dataFor('rc', 'list')).length
  await expect(page.getByText('firewall')).toBeVisible()
  await expect(page.locator('.compact-system-list .compact-entry')).toHaveCount(expectedStartupServices)
  await page.getByRole('button', { name: /未自启 1/ }).click()
  await expect(page.locator('.compact-system-list .compact-entry')).toHaveCount(1)
  await expect(page.getByText('dnsmasq')).toBeVisible()
  await page.getByRole('button', { name: /全部自启状态/ }).click()
  await expect(page.locator('.compact-system-list .compact-entry')).toHaveCount(expectedStartupServices)
  await page.getByRole('textbox', { name: '搜索启动项' }).fill('firewall')
  await expect(page.locator('.compact-system-list .compact-entry')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索启动项' }).fill('')
  const heldStartup = await holdToolRpc('rc', 'list')
  await page.getByRole('button', { name: '刷新当前页面' }).click()
  await heldStartup.started
  await expect(page.getByText('正在读取启动项数据…')).toBeVisible()
  await expect(page.getByText('暂无服务数据')).toHaveCount(0)
  await expect(page.locator('.compact-system-list')).toHaveCount(0)
  heldStartup.resume()
  await expect(page.locator('.compact-system-list .compact-entry')).toHaveCount(expectedStartupServices)
  await heldStartup.dispose()
  await page.screenshot({ path: 'test-results/screenshots/compact-startup-services.png', fullPage: true })
  await page.getByRole('button', { name: '返回上一页' }).click()
  const heldRoutes = await holdToolRpc('uci', 'get')
  await openApplication(page, '路由表')
  await heldRoutes.started
  await expect(page.getByText('正在读取路由表数据…')).toBeVisible()
  await expect(page.getByText('尚未取得路由表数据，请检查 RPC 权限')).toHaveCount(0)
  await expect(page.locator('.compact-system-list')).toHaveCount(0)
  heldRoutes.resume()
  await expect(page.getByRole('button', { name: '刷新当前页面' })).toHaveCount(1)
  await expect(page.locator('.compact-system-list .route-entry')).toHaveCount(4)
  await heldRoutes.dispose()
  await expect(page.getByText('10.0.0.0/24', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('默认路由')).toBeVisible()
  await expect(page.getByText('网络路由').first()).toBeVisible()
  await expect(page.getByText('主机路由').first()).toBeVisible()
  await page.getByRole('textbox', { name: '搜索路由' }).fill('pppoe-wan')
  await expect(page.locator('.compact-system-list .route-entry')).toHaveCount(2)
  await page.getByRole('textbox', { name: '搜索路由' }).fill('')
  await page.screenshot({ path: 'test-results/screenshots/compact-route-table.png', fullPage: true })
  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect(page.getByRole('button', { name: '刷新当前页面' })).toHaveCount(1)
  let releaseWolResponse
  let notifyWolRequested
  const wolRequested = new Promise(resolve => { notifyWolRequested = resolve })
  const wolResponseHeld = new Promise(resolve => { releaseWolResponse = resolve })
  const delayedWolRpc = async route => {
    const request = route.request().postDataJSON()
    const batch = Array.isArray(request) ? request : [request]
    if (batch.some(item => item.params?.[1] === 'luci.wol' && item.params?.[2] === 'stat')) {
      notifyWolRequested()
      await wolResponseHeld
    }
    await handler(route)
  }
  await page.route('**/ubus', delayedWolRpc)
  await openApplication(page, '网络唤醒')
  await wolRequested
  await expect(page.getByText('正在读取网络唤醒配置与服务状态…')).toBeVisible()
  await expect(page.getByText(/WOL 唤醒工具未启用/)).toHaveCount(0)
  await expect(page.getByText('暂无已保存的网络唤醒目标。')).toHaveCount(0)
  releaseWolResponse()
  await page.unroute('**/ubus', delayedWolRpc)
  await expect(page.getByText('测试主机')).toBeVisible()
  await expect(page.getByText(/WOL 唤醒工具未启用/)).toHaveCount(0)
  await page.getByRole('button', { name: /网络邻居/ }).click()
  await expect(page.getByText('已发现的网络设备')).toBeVisible()
  await expect(page.getByText('邻居电脑')).toBeVisible()
  await expect(page.locator('.wol-neighbor-card')).toHaveCount(3)
  await auditDarkTextContrast(page, ['.wol-neighbor-card__address', '.wol-neighbor-card__address b'])
  const wolAddressRow = await page.locator('.wol-neighbor-card').first().evaluate(node => {
    const fields = [...node.querySelectorAll('.wol-neighbor-card__address')].map(x => x.getBoundingClientRect())
    return fields.length === 2 && Math.abs(fields[0].top - fields[1].top) < 2 &&
      Math.abs(fields[0].bottom - fields[1].bottom) < 2
  })
  expect(wolAddressRow).toBe(true)
  await expect(page.locator('.wol-neighbor-card').filter({ hasText: '邻居电脑' })).toContainText('192.168.100.99')
  await expect(page.locator('.wol-neighbor-card').filter({ hasText: '邻居电脑' })).toContainText('BB:CC:DD:EE:FF:00')
  const wolCardsOverflow = await page.locator('.wol-neighbor-card').evaluateAll(nodes =>
    nodes.some(node => node.getBoundingClientRect().right > innerWidth + 2 || node.scrollWidth > node.clientWidth + 2))
  expect(wolCardsOverflow).toBe(false)
  await page.locator('.wol-neighbors-search input').fill('192.168.100.89')
  await expect(page.locator('.wol-neighbor-card')).toContainText('AP备注手机')
  const wakeAlongsideName = await page.locator('.wol-neighbor-card').first().evaluate(node => {
    const name = node.querySelector('.wol-neighbor-card__name')?.getBoundingClientRect()
    const button = node.querySelector('.wol-neighbor-card__wake')?.getBoundingClientRect()
    return !!name && !!button && Math.abs((name.top + name.height/2) - (button.top + button.height/2)) < 25
  })
  expect(wakeAlongsideName).toBe(true)
  await page.locator('.wol-neighbors-search input').fill('192.168.100.99')
  await expect(page.locator('.wol-neighbor-card')).toHaveCount(1)
  await page.locator('.wol-neighbors-search input').fill('')
  await expect(page.locator('.wol-neighbor-card')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/screenshots/compact-wol-neighbors.png', fullPage: true })
  await page.getByRole('button', { name: '唤醒 邻居电脑' }).click()
  await expect(page.getByText(/已向 邻居电脑 发送网络唤醒包/)).toBeVisible()
  wolToolEnabled = false
  await page.getByRole('button', { name: '刷新当前页面' }).click()
  await expect(page.getByText('WOL 唤醒工具未启用，仍可查看邻居，但不能发送唤醒包。')).toBeVisible()
  wolToolEnabled = true
  await page.getByRole('button', { name: '刷新当前页面' }).click()
  await expect(page.getByText(/WOL 唤醒工具未启用/)).toHaveCount(0)
  await page.getByRole('button', { name: '返回上一页' }).click()
  await openApplication(page, '家长控制')
  await expect(page.getByText('OpenAppFilter 家长控制')).toBeVisible()
  await auditDarkTextContrast(page, ['.appfilter-kv span'])
  await page.getByRole('tab', { name: '应用分类' }).click()
  await expect(page.getByText('社交', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '保存应用过滤规则' }).click()
  await expect(page.getByText('应用分类规则：已提交')).toBeVisible()
  await page.getByRole('tab', { name: '高级设置' }).click()
  await page.getByRole('button', { name: '保存高级设置' }).click()
  await expect(page.getByText('高级设置：已提交')).toBeVisible()
  await page.getByRole('button', { name: '返回上一页' }).click()
  await openApplication(page, '恢复出厂')
  await expect(page.getByText('恢复 QWRT 出厂设置')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认恢复出厂' })).toBeDisabled()
  await page.getByRole('button', { name: '取消' }).click()
  await openApplication(page, '重启设备')
  await expect(page.getByText('确认重启 QWRT')).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()

  // Favorites can be edited, reordered, and expanded without losing app routes.
  await page.getByRole('button', { name: '编辑常用应用' }).click()
  await page.getByRole('button', { name: '移除常用Lucky' }).click()
  await page.getByRole('button', { name: '添加常用ShadowSocksR Plus+' }).click()
  await page.getByRole('button', { name: '上移ShadowSocksR Plus+' }).click()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.locator('.app-favorite-tile')).toHaveCount(6)
  await expect(page.locator('.app-favorites-grid').getByRole('button', { name: '打开ShadowSocksR Plus+' })).toBeVisible()
  await expect(page.locator('.app-favorites-grid').getByRole('button', { name: '打开Lucky' })).toHaveCount(0)
  await page.getByRole('button', { name: '展开全部应用' }).click()
  // V3 has 20 canonical Tools entries; other legacy features live under Overview, Devices and Network.
  await expect(page.locator('.app-tool-row')).toHaveCount(20)
  for (const title of ['网络诊断', '日志中心', '配置备份恢复', '服务管理',
    '系统定时任务', '系统能力识别', '操作记录', '安全分析']) {
    await expect(page.getByRole('button', { name: '打开' + title })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: '打开软件包' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开恢复出厂' })).toBeVisible()
  // Deep tools return to their previous app-list scroll position.
  const hubScroll=await page.evaluate(()=>{
    const max=Math.max(0,document.scrollingElement.scrollHeight-window.innerHeight)
    window.scrollTo(0,Math.min(max,580))
    return window.scrollY||document.scrollingElement.scrollTop
  })
  expect(hubScroll).toBeGreaterThan(80)
  await page.evaluate(()=>{
    const button=document.querySelector('button[aria-label="打开日志中心"]')
    if(!button)throw new Error('日志中心入口缺失')
    button.click()
  })
  await expect(page.getByRole('button', { name: '返回上一页' })).toBeVisible()
  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect(page.getByText('工具箱')).toBeVisible()
  await expect.poll(async()=>Math.abs((await page.evaluate(()=>
    window.scrollY||document.scrollingElement.scrollTop))-hubScroll)).toBeLessThan(30)
  // Re-tapping the selected Apps root tab returns to top, unlike Back.
  await page.getByRole('button', { name: '工具', exact: true }).click()
  await expect.poll(async()=>page.evaluate(()=>
    window.scrollY||document.scrollingElement.scrollTop)).toBeLessThan(20)
  // Opening a tool and tapping Apps must FIRST return to the saved hub spot.
  await page.evaluate(()=>window.scrollTo(0,Math.min(520,
    document.scrollingElement.scrollHeight-window.innerHeight)))
  const savedAppOffset=await page.evaluate(()=>
    window.scrollY||document.scrollingElement.scrollTop)
  expect(savedAppOffset).toBeGreaterThan(70)
  await page.evaluate(()=>{
    const tool=document.querySelector('button[aria-label="打开日志中心"]')
    if(!tool)throw new Error('日志中心入口缺失')
    tool.click()
  })
  await expect(page.getByRole('button', { name: '返回上一页' })).toBeVisible()
  await page.getByRole('button', { name: '工具', exact: true }).click()
  await expect.poll(async()=>Math.abs((await page.evaluate(()=>
    window.scrollY||document.scrollingElement.scrollTop))-savedAppOffset)).toBeLessThan(35)
  await page.getByRole('button', { name: '工具', exact: true }).click()
  await expect.poll(async()=>page.evaluate(()=>
    window.scrollY||document.scrollingElement.scrollTop)).toBeLessThan(20)
  await page.getByRole('button', { name: '收起维护与备份' }).click()
  await expect(page.getByRole('button', { name: '打开恢复出厂' })).toHaveCount(0)

  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: '打开显示设置' }).click()
  await page.getByRole('button', { name: '液态底栏' }).click()
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('settings')
  await expect(page.locator('.v-navigation-drawer--active')).toHaveCount(0)
  await expect(page.locator('.liquid-bottom .glass-nav')).toBeVisible()
  await page.getByRole('button', { name: '概览', exact: true }).click()
  await expect(page.getByText('J4125 SoftRouter').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/live-liquid.png', fullPage: true })
  await page.getByRole('button', { name: '网络', exact: true }).click()
  await expect(page.locator('.top-bar .router-toolbar-name')).toHaveText('网络')
  expect(await page.evaluate(() => window.__xxwrtTestBack())).toBe('list')
  await expect(page.getByRole('heading', { name: '路由器管理' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '路由器管理' })).toBeVisible()
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
  const invalidAddressMessage = '地址只填写 IP、域名和可选端口，不要包含路径或账号密码'
  const errorToast = page.locator('.v-snackbar').filter({ hasText: invalidAddressMessage })
  await expect(errorToast).toBeVisible()
  await expect(page.getByText(invalidAddressMessage, { exact: true })).toHaveCount(1)
  await expect(page.locator('#device-editor .v-alert')).toHaveCount(0)
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
  await expect(page.getByText('J4125 SoftRouter').first()).toBeVisible()
  await page.getByRole('button', { name: '切换路由器' }).click()
  await expect(page.getByRole('button', { name: '进入 副路由' })).toBeVisible()
  await page.getByRole('button', { name: '进入 副路由' }).click()
  await page.getByRole('textbox', { name: '路由器密码' }).fill('p2')
  await page.getByRole('button', { name: '登录并进入' }).click()
  await expect(page.getByText('J4125 SoftRouter').first()).toBeVisible()
  await page.getByRole('button', { name: '切换路由器' }).click()
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
  await expect(page.getByText('J4125 SoftRouter').first()).toBeVisible()
  await page.getByRole('button', { name: '切换路由器' }).click()
  await expect(page.locator('.router-meter')).toHaveCount(2, { timeout: 12000 })
  await expect(page.getByText('上传', { exact: true })).toBeVisible()
  await expect(page.getByText('下载', { exact: true })).toBeVisible()
  await expect(page.getByText('连接数', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('终端', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '切换到列表模式' }).click()
  await expect(page.locator('.saved-device-grid-compact')).toBeVisible()
  await page.getByRole('button', { name: '隐藏路由器地址' }).click()
  await expect(page.locator('.router-address')).toContainText('•••')
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: '打开隐私设置' }).click()
  await page.getByLabel('隐藏主机名').click()
  await page.getByRole('button', { name: '概览', exact: true }).click()
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
    .toBe('#0F1727')
  await page.evaluate(() => localStorage.setItem('xxwrt_material_color_mode', 'light'))
  await page.reload()
  await expect(page.locator('.material-demo.theme-is-dark')).toHaveCount(0)
  await expect.poll(() => page.locator('meta[name="theme-color"]').getAttribute('content'))
    .toBe('#F3F7FD')

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
  // Hardware is intentionally collapsed on Design A home; expand before checking
  // that a background refresh does not unmount it.
  await expect(page.locator('.v3-health-card')).toBeVisible()
  await page.getByRole('button', { name: '展开系统与硬件详情' }).click()
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
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /user-scalable=no/)
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /maximum-scale=1/);

  resumeRequest()
  await expect(page.getByRole('button', { name: '刷新当前页面' }))
    .not.toHaveClass(/v-btn--loading/)

  await page.getByRole('button', { name: '切换路由器' }).click()
  await expect(page.locator('.router-list-card')).toBeVisible()
  await expect(page.locator('.router-stat-block')).toBeVisible()
  await expect(page.getByText('已登录 · 在线')).toBeVisible()
  await expect(page.locator('.router-meta-line .router-connection-group .router-uptime')).toBeVisible()
  await expect(page.locator('.router-name-row .router-uptime')).toHaveCount(0)
  await expect(page.locator('.router-meta-line .router-temp')).toBeVisible()
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

test('software packages shows opkg lists, filters and protects installation actions', async ({ page }) => {
  await page.route('**/ubus', handler)
  // Mock LuCI's streaming cgi-io path used for large indexes (>7000 packages).
  await page.route('**/cgi-bin/cgi-exec', route => {
    const command = new URLSearchParams(route.request().postData() || '').get('command') || ''
    const action = command.endsWith('list-installed') ? 'list-installed' : 'list-available'
    const output = dataFor('file', 'exec', {
      command: '/usr/libexec/package-manager-call', params: [action]
    })
    return route.fulfill({ status: 200, contentType: 'text/plain',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: output.stdout })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page.getByRole('textbox', { name: '设备名称 / 备注' }).fill('QWRT 包管理测试')
  await page.getByRole('textbox', { name: 'IP / 域名 / 端口' }).fill('http://192.168.100.1')
  await page.getByRole('textbox', { name: '登录用户名' }).fill('root')
  await page.getByRole('button', { name: '保存设备' }).click()
  await page.getByRole('button', { name: '进入 QWRT 包管理测试' }).click()
  await page.getByRole('textbox', { name: '路由器密码' }).fill('mock-only')
  await page.getByRole('button', { name: '登录并进入' }).click()
  await expect(page.getByText('J4125 SoftRouter').first()).toBeVisible()
  await page.getByRole('button', { name: '工具', exact: true }).click()
  await openApplication(page, '软件包')
  await expect(page.locator('.package-manager-panel')).toBeVisible()
  await expect(page.getByText('正在显示 1–100，共 108')).toBeVisible()
  await expect(page.locator('.package-entry')).toHaveCount(100)
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.locator('.package-entry')).toHaveCount(8)
  await page.getByRole('tab', { name: /已安装/ }).click()
  await expect(page.getByText('正在显示 1–2，共 2')).toBeVisible()
  await page.getByRole('tab', { name: /更新/ }).click()
  await expect(page.locator('.package-entry')).toHaveCount(1)
  await expect(page.locator('.package-entry')).toContainText('当前 1.35.0-1')
  await page.getByRole('button', { name: '升级…' }).click()
  await expect(page.getByText('升级核心软件包可能与当前固件不兼容')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '取消' }).click()
  await page.getByRole('button', { name: '更新列表' }).click()
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.locator('.package-exec-output')).toContainText('Package operation completed')
  await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click()
})

test('terminal QoS backend selector keeps EQOS and HQoS writes separate', async ({ page }) => {
  terminalHqosTest = true
  terminalHqosEnabled = false
  terminalHqosSetCount = 0
  terminalHqosRule = { mac: 'aa:bb:cc:dd:ee:ff', name: 'Phone',
    enabled: true, download: 4096, upload: 1024, connections: 30 }
  try {
    await page.route('**/ubus', handler)
    await page.goto('/')
    await page.getByRole('button', { name: '添加', exact: true }).click()
    await page.getByRole('textbox', { name: '设备名称 / 备注' }).fill('QWRT 多 QoS 测试')
    await page.getByRole('textbox', { name: 'IP / 域名 / 端口' }).fill('http://192.168.100.1')
    await page.getByRole('textbox', { name: '登录用户名' }).fill('root')
    await page.getByRole('button', { name: '保存设备' }).click()
    await page.getByRole('button', { name: '进入 QWRT 多 QoS 测试' }).click()
    await page.getByRole('textbox', { name: '路由器密码' }).fill('mock-only')
    await page.getByRole('button', { name: '登录并进入' }).click()
    await page.getByRole('button', { name: '设备', exact: true }).click()
    // Default is the combined multi-source list; select DHCPv4 for the
    // original three-lease QoS regression scenario.
    await page.getByRole('button', { name: /DHCPv4，\d+ 条/ }).click()
    await expect(page.locator('.terminal-tile')).toHaveCount(3, { timeout: 15000 })
    await page.getByText('Phone', { exact: true }).click()

    const modal = page.getByRole('dialog').filter({ hasText: '终端管理' })
    const select = modal.getByRole('combobox', { name: '管理 QoS 后端' })
    await expect(select).toBeVisible()
    // Vuetify VSelect renders its selected item in the combobox input value,
    // not as a text child, so check the actual input value.
    await expect(select).toHaveValue(/EQOS/)
    await expect(modal.getByRole('spinbutton', { name: '下载限速 (Mbps)' })).toBeVisible()

    // Vuetify paints a selection text span over its native combobox input.
    // Click the user-visible selection, not the obscured input itself.
    const selectionText = modal.locator('.v-select__selection-text')
    await expect(selectionText).toBeVisible()
    await selectionText.click()
    await page.getByRole('option', { name: /QWRT HQoS/ }).click()
    const down = modal.getByRole('spinbutton', { name: '下载限速 (kbps)' })
    const up = modal.getByRole('spinbutton', { name: '上传限速 (kbps)' })
    const connections = modal.getByRole('spinbutton', { name: '并发连接数' })
    await expect(down).toHaveValue('4096')
    await expect(up).toHaveValue('1024')
    await expect(connections).toHaveValue('30')
    await expect(modal.getByText(/其他已启用的服务：EQOS/)).toBeVisible()
    await down.fill('8192')
    await modal.getByRole('button', { name: '保存终端限速' }).click()
    await expect(page.getByText('确认 QoS 变更风险')).toBeVisible()
    expect(terminalHqosSetCount).toBe(0)
    await page.getByRole('button', { name: '确认风险并保存' }).click()
    await expect.poll(() => terminalHqosSetCount).toBe(1)
    await expect(down).toHaveValue('8192')

    // EQOS is still independent and must retain its Mbps editor.
    await selectionText.click()
    await page.getByRole('option', { name: /EQOS/ }).click()
    await expect(modal.getByRole('spinbutton', { name: '下载限速 (Mbps)' })).toBeVisible()
    await expect(modal.getByRole('spinbutton', { name: '并发连接数' })).toHaveCount(0)
  } finally {
    terminalHqosTest = false
    terminalHqosEnabled = false
    terminalHqosRule = null
  }
})
