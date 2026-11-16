// Keep motion preferences on the device. Android and web both honour the OS
// reduced-motion setting even if the user enables animations in this app.
export const MOTION_PREFERENCE_KEY = 'xxwrt_material_motion_enabled_v1'
export function readMotionPreference(storage) {
  try { return storage?.getItem(MOTION_PREFERENCE_KEY) !== 'false' }
  catch (_) { return true }
}
export function motionAllowed(userEnabled, systemPrefersReduced) {
  return Boolean(userEnabled) && !Boolean(systemPrefersReduced)
}
export function motionScrollBehavior(allowed) {
  return allowed ? 'smooth' : 'auto'
}
export function isCurrentTabRoot(activeTab, targetTab, toolPanel='', connected=true, settingsOpen=false) {
  return connected && !settingsOpen && activeTab === targetTab &&
    (!toolPanel || activeTab !== 'apps')
}
