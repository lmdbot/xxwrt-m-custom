// Motion primitives for user-driven navigation. Never triggered by telemetry.
export const TAB_ORDER = Object.freeze(['home', 'statistics', 'clients', 'network', 'apps'])
export const MOTION_DURATIONS = Object.freeze({ navigation: 270, section: 210 })
export const MOTION_EASING = 'cubic-bezier(0.2, 0, 0, 1)'

export function describeNavigationMotion(previous, next) {
  if (!Array.isArray(previous) || !Array.isArray(next) || previous.length < 6 || next.length < 6) return null
  const [fromTab, fromTool, fromMode, fromSettings, fromCategory, fromDevice] = previous
  const [toTab, toTool, toMode, toSettings, toCategory, toDevice] = next
  if (fromSettings !== toSettings)
    return {kind: 'navigation', direction: toSettings ? 1 : -1}
  if (fromSettings && toSettings && fromCategory !== toCategory)
    return {kind: 'navigation', direction: 1}
  if (fromMode !== toMode)
    return {kind: 'navigation', direction: toMode === 'detail' ? 1 : -1}
  if (fromDevice !== toDevice)
    return {kind: 'navigation', direction: 1}
  if (fromTab !== toTab) {
    const before = TAB_ORDER.indexOf(fromTab), after = TAB_ORDER.indexOf(toTab)
    if (before < 0 || after < 0) return null
    return {kind: 'navigation', direction: after > before ? 1 : -1}
  }
  if (toTab === 'apps' && fromTool !== toTool)
    return {kind: 'navigation', direction: toTool ? 1 : -1}
  return null
}

export function keyframesForMotion(kind, direction = 1) {
  if (kind === 'section') return [
    {opacity: 0.60, transform: 'translate3d(0, 10px, 0) scale(0.992)'},
    {opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)'}
  ]
  const sign = direction < 0 ? -1 : 1
  return [
    {opacity: 0.63, transform: 'translate3d(' + (sign * 17) + 'px, 4px, 0) scale(0.993)'},
    {opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)'}
  ]
}

export function playInterfaceMotion(element, motion, enabled) {
  if (!enabled || !element || typeof element.animate !== 'function' || !motion) return null
  const kind = motion.kind === 'section' ? 'section' : 'navigation'
  return element.animate(keyframesForMotion(kind, motion.direction), {
    duration: MOTION_DURATIONS[kind], easing: MOTION_EASING, iterations: 1, fill: 'none'
  })
}
