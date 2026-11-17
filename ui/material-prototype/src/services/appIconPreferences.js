/**
 * Local-only appearance preferences. Android launcher aliases work only for
 * prepackaged artwork. Uploaded art can be used inside the app and as a pinned
 * launcher shortcut, but cannot replace an installed package icon in-place.
 */
export const APP_ICON_CHOICE_KEY = 'xxwrt_lab_app_icon_choice_v1'
export const APP_ICON_CUSTOM_KEY = 'xxwrt_lab_app_icon_uploaded_v1'
export const DEFAULT_APP_ICON = 'anime'
export const APP_ICON_PRESETS = Object.freeze([
  { id:'anime', title:'二次元（默认）', description:'当前 XX-WRT 图标' },
  { id:'classic', title:'XX-WRT M 经典版', description:'从旧版项目提取的蓝色图标' },
  { id:'openwrt', title:'OpenWrt 标识', description:'从旧版项目提取的 OpenWrt 图标' }
])
export const MAX_CUSTOM_ICON_DATA_BYTES = 1024 * 1024

export function validIconChoice(choice) {
  return APP_ICON_PRESETS.some(item => item.id===choice) || choice==='custom'
}
export function isCustomPng(data) {
  if (typeof data!=='string' || data.length>MAX_CUSTOM_ICON_DATA_BYTES * 4/3+100) return false
  const prefix='data:image/png;base64,'
  return data.startsWith(prefix) &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(data.slice(prefix.length)) &&
    data.slice(prefix.length).length % 4 === 0
}
export function loadCustomAppIcon(storage) {
  try {
    const value=storage.getItem(APP_ICON_CUSTOM_KEY)
    return isCustomPng(value)?value:null
  } catch { return null }
}
export function loadAppIconChoice(storage) {
  try {
    const choice=storage.getItem(APP_ICON_CHOICE_KEY)
    if (choice==='custom' && !loadCustomAppIcon(storage)) return DEFAULT_APP_ICON
    return validIconChoice(choice)?choice:DEFAULT_APP_ICON
  } catch { return DEFAULT_APP_ICON }
}
export function saveAppIconChoice(storage,choice) {
  if (!validIconChoice(choice)) return false
  if (choice==='custom' && !loadCustomAppIcon(storage)) return false
  try { storage.setItem(APP_ICON_CHOICE_KEY,choice); return true } catch { return false }
}
export function storeCustomAppIcon(storage,data) {
  if (!isCustomPng(data)) return false
  try {
    storage.setItem(APP_ICON_CUSTOM_KEY,data)
    return true
  } catch { return false }
}
export function resetAppIconPreferences(storage) {
  try {
    storage.removeItem(APP_ICON_CHOICE_KEY)
    storage.removeItem(APP_ICON_CUSTOM_KEY)
    return true
  } catch { return false }
}
