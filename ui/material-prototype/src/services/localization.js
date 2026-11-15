import OpenCC from 'opencc-js'
import englishCore from './locales/en-core.js'
import englishApps from './locales/en-apps.js'
import englishOther from './locales/en-other.js'

export const LANGUAGE_STORAGE_KEY = 'xxwrt_material_language'
export const LANGUAGES = Object.freeze([
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'en', name: 'English' }
])

const ENGLISH = Object.freeze({
  ...englishCore,
  ...englishApps,
  ...englishOther,
  '首页': 'Home', '统计': 'Statistics', '终端': 'Clients', '网络': 'Network',
  '应用': 'Apps', '显示': 'Display', '隐私': 'Privacy', '刷新': 'Refresh',
  '实验室': 'Labs', '关于': 'About', '语言': 'Language',
  '设备管理、连接与系统信息': 'Device management, connections & system information',
  '界面主题、导航与列表布局': 'Themes, navigation & list layouts',
  '主机名、IP 地址与隐私显示': 'Hostnames, IP addresses & privacy',
  '设备状态与数据更新策略': 'Device status & refresh policy',
  '高级选项与实验性功能': 'Advanced & experimental features',
  '语言、帮助、反馈与版本': 'Help, feedback & version information',
  '帮助、反馈与版本': 'Help, feedback & version information',
  '应用语言': 'App language',
  '打开路由器设置': 'Open router settings',
  '打开显示设置': 'Open display settings',
  '打开隐私设置': 'Open privacy settings',
  '打开刷新设置': 'Open refresh settings',
  '打开实验室设置': 'Open labs settings',
  '打开语言设置': 'Open language settings',
  '打开关于设置': 'Open about settings',
  '简体中文、繁體中文和 English': 'Simplified Chinese, Traditional Chinese & English',
  '选择应用界面语言，切换后立即生效。': 'Choose the app language. Changes take effect immediately.',
  '语言偏好保存在本机，重启应用后仍然有效。': 'Your language preference is saved on this device and retained after restart.',
  '我的设备': 'My devices', '已登录 · 在线': 'Signed in · Online',
  '路由器': 'Router', '应用详情': 'App details', '在线': 'Online', '离线': 'Offline',
  '正在刷新路由器数据…': 'Refreshing router data…',
  '正在通过 QWRT 探测节点…': 'Probing nodes from QWRT…',
  '正在读取 SSR 组件版本或执行更新…': 'Reading SSR versions or installing updates…',
  '正在检查 Carbon 更新…': 'Checking Carbon updates…',
  '正在提交配置，请稍候…': 'Applying settings. Please wait…',
  '家长控制': 'Parental controls', '静态与运行路由': 'Static and active routes',
  '系统运行进程': 'Running processes', '开机启动服务': 'Startup services',
  '远程唤醒终端': 'Wake devices remotely', '代理节点与服务管理': 'Proxy nodes & service management',
  '运行状态、访问规则与备份维护': 'Status, access rules & backups',
  '服务开关、自动激活与配置文件': 'Service control, auto activation & configuration',
  '通知渠道与推送配置': 'Notification channels & push settings',
  '代理模式与运行控制': 'Proxy mode & service controls',
  '联网监测状态': 'Connectivity monitoring',
  'Carbon 主题设置': 'Carbon theme settings', 'LuCI 主题与在线更新': 'LuCI theme & online updates',
  '虚拟组网与网络成员': 'Virtual networks & members',
  '防火墙': 'Firewall', '区域策略与端口转发': 'Zone policies & port forwarding',
  '重启设备': 'Reboot device', '需要二次确认': 'Confirmation required',
  '恢复出厂': 'Factory reset', '清除配置，请谨慎操作': 'Erases configuration; use caution',
  'CPU 占用': 'CPU usage', '内存占用': 'Memory usage', '内存缓存': 'Memory cache',
  '连接数': 'Connections', '负载 ': 'Load ', '无线终端': 'Wireless clients',
  '应用用户': 'App users', '接收 RX': 'Receive RX', '发送 TX': 'Transmit TX',
  '1 分钟': '1 minute', '5 分钟': '5 minutes', '15 分钟': '15 minutes',
  '秒': 'sec', '分钟': 'min', '小时': 'hr', '天': 'days',
  '添加成功': 'Added successfully', '保存成功': 'Saved successfully',
  '操作成功': 'Operation completed', '读取失败': 'Failed to load',
  '网络唤醒': 'Wake on LAN', '微信推送': 'WeChat Push',
  '未知': 'Unknown', '待确认': 'Unconfirmed', '运行中': 'Running',
  '未运行': 'Not running', '正常': 'Healthy', '未连接': 'Disconnected',
  '状态': 'Status', '功能': 'Features', '更多': 'More',
  '已启用': 'Enabled', '已关闭': 'Off', '已停用': 'Disabled',
  '正在加载': 'Loading', '正在读取': 'Loading',
  '已保存': 'Saved', '正在连接': 'Connecting', '登录': 'Sign in',
  '退出登录': 'Sign out', '添加': 'Add', '保存': 'Save',
  '删除': 'Delete', '编辑': 'Edit', '取消': 'Cancel', '确认': 'Confirm',
  '关闭': 'Close', '搜索': 'Search', '检查更新': 'Check for updates',
  '完整': 'Complete', '信息': 'Information',
  '无线': 'Wireless', '有线': 'Wired',
  '失败': 'Failed', '成功': 'Successful'
})

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' })
const CHINESE = /[\u3400-\u9fff]/
const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt', 'label']
const EXCLUDED = 'script,style,code,pre,[contenteditable="true"],[data-localize-ignore],[translate="no"]'
const ENGLISH_FRAGMENTS = Object.entries(ENGLISH)
  .filter(([source]) => source.length > 1 && CHINESE.test(source))
  .sort((a, b) => b[0].length - a[0].length)

export function normalizeLanguage(value) {
  return LANGUAGES.some(option => option.code === value) ? value : 'zh-CN'
}

export function savedLanguage() {
  try { return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)) }
  catch (_) { return 'zh-CN' }
}

export function persistLanguage(value) {
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizeLanguage(value)) }
  catch (_) { /* Private browsing or restricted storage must not break the UI. */ }
}

export function translateText(value, language) {
  const original = String(value ?? '')
  const locale = normalizeLanguage(language)
  if (locale === 'zh-CN' || !CHINESE.test(original)) return original
  if (locale === 'zh-TW') return toTraditional(original)

  // Preserve indentation and spaces inside controls while translating labels.
  const match = original.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!match) return original
  const [, leading, raw, trailing] = match
  const exact = ENGLISH[raw]
  if (exact !== undefined) return leading + exact + trailing

  // Uptime/lease values are assembled at runtime rather than stored as labels.
  const duration = raw.replace(/(\\d+(?:\\.\\d+)?)\\s*(天|小时|分钟|秒)/g,
    (_, amount, unit) => amount + ({ '天': 'd', '小时': 'h', '分钟': 'm', '秒': 's' })[unit])
  if (duration !== raw && !CHINESE.test(duration)) return leading + duration + trailing

  // The Vue templates often split a sentence around {{ expressions }}.
  // Translate those fragments without modifying numbers, IDs or addresses.
  let translated = raw
  for (const [source, english] of ENGLISH_FRAGMENTS) {
    if (translated.includes(source)) translated = translated.split(source).join(english)
  }
  // Also cover dynamic title/ARIA labels assembled from short Chinese terms.
  return leading + translated + trailing
}

/**
 * Translate rendered Vue/Vuetify UI labels, including teleported dialogs,
 * while retaining each source text so changes are reversible without reload.
 * A MutationObserver also handles lazy router panels and async RPC status.
 *
 * This is intentionally view-only: do not alter input values, router payloads,
 * user-entered names, device IDs, passwords, or application state.
 */
export function mountLocalization(root, currentLanguage) {
  if (!root || typeof MutationObserver === 'undefined') {
    return { refresh() {}, dispose() {} }
  }
  let language = normalizeLanguage(currentLanguage)
  const textSources = new WeakMap()
  const textRendered = new WeakMap()
  const attrSources = new WeakMap()
  const attrRendered = new WeakMap()

  function excluded(element) {
    return !element || element.closest?.(EXCLUDED) != null
  }

  function translateNode(node) {
    if (node.nodeType !== 3 || excluded(node.parentElement)) return
    const seen = textRendered.get(node)
    const actual = node.nodeValue ?? ''
    const source = seen !== undefined && actual === seen
      ? textSources.get(node) : actual
    textSources.set(node, source)
    const next = translateText(source, language)
    textRendered.set(node, next)
    if (actual !== next) node.nodeValue = next
  }

  function translateAttributes(element) {
    if (excluded(element)) return
    let sources = attrSources.get(element)
    let rendered = attrRendered.get(element)
    if (!sources) { sources = new Map(); attrSources.set(element, sources) }
    if (!rendered) { rendered = new Map(); attrRendered.set(element, rendered) }
    for (const name of ATTRIBUTES) {
      if (!element.hasAttribute(name)) {
        sources.delete(name); rendered.delete(name)
        continue
      }
      const actual = element.getAttribute(name)
      const seen = rendered.get(name)
      const source = seen !== undefined && actual === seen
        ? sources.get(name) : actual
      sources.set(name, source)
      const next = translateText(source, language)
      rendered.set(name, next)
      if (next !== actual) element.setAttribute(name, next)
    }
  }

  function visit(node) {
    if (node.nodeType === 3) { translateNode(node); return }
    if (node.nodeType !== 1 || excluded(node)) return
    translateAttributes(node)
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
    let child
    while ((child = walker.nextNode())) {
      if (child.nodeType === 3) translateNode(child)
      else translateAttributes(child)
    }
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') translateNode(record.target)
      else if (record.type === 'attributes') translateAttributes(record.target)
      else for (const added of record.addedNodes) visit(added)
    }
  })
  observer.observe(root, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ATTRIBUTES })

  function refresh(value = language) {
    language = normalizeLanguage(value)
    document.documentElement.lang = language
    visit(root)
  }
  refresh(language)
  return { refresh, dispose: () => observer.disconnect() }
}
