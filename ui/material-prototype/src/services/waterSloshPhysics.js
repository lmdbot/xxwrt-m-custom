/**
 * Horizontal liquid-surface offset in px, unrelated to the data fill level.
 * Gravity follows device roll; lateral acceleration produces short-lived slosh.
 */
export const MAX_SLOSH_PX = 8
const bound = (value, low, high) => Math.max(low, Math.min(high, value))
const valid = value => typeof value === 'number' && Number.isFinite(value) ? value : 0

export function sloshTarget(gravityX = 0, accelerationX = 0) {
  return bound((valid(gravityX) / 9.81) * 8 + valid(accelerationX) * 1.3,
    -MAX_SLOSH_PX, MAX_SLOSH_PX)
}
export function tiltAttenuation(fillPercent) {
  const percent = Number(fillPercent)
  if (!Number.isFinite(percent)) return 0
  return bound(Math.min(percent, 100 - percent) / 12, 0, 1)
}
export function sloshEdgeOffset(fillPercent, surfacePx, intensity = 1) {
  return bound(valid(surfacePx) * tiltAttenuation(fillPercent) * valid(intensity),
    -MAX_SLOSH_PX, MAX_SLOSH_PX)
}
export function advanceWaterSpring(state, target, dtSeconds) {
  const step = bound(valid(dtSeconds), 0.001, 0.035)
  const at = bound(valid(state?.position), -MAX_SLOSH_PX, MAX_SLOSH_PX)
  const velocity = bound(valid(state?.velocity), -75, 75)
  // Damped spring: moves toward gravity, overshoots briefly after shaking,
  // and then returns naturally when the phone stops moving.
  const force = (bound(valid(target), -MAX_SLOSH_PX, MAX_SLOSH_PX) - at) * 135 - velocity * 15
  const nextVelocity = bound(velocity + force * step, -75, 75)
  return {
    position: bound(at + nextVelocity * step, -MAX_SLOSH_PX, MAX_SLOSH_PX),
    velocity: nextVelocity
  }
}
