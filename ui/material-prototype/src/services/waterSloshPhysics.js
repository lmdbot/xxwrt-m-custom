/**
 * Slosh is visual-only; real CPU/memory/disk percentages remain unchanged.
 * 18% fill should respond just as clearly as a half-full tile. The surface
 * tapers only at almost-empty or almost-full levels to avoid clipping.
 */
export const MAX_SLOSH_PX = 14
export const MAX_WATER_BOB_PX = 5
const bound = (value, low, high) => Math.max(low, Math.min(high, value))
const valid = value => typeof value === 'number' && Number.isFinite(value) ? value : 0

export function sloshTarget(gravityX = 0, accelerationX = 0) {
  return bound((valid(gravityX) / 9.81) * 13 + valid(accelerationX) * 2.4,
    -MAX_SLOSH_PX, MAX_SLOSH_PX)
}

/** Vertical / fore-aft shaking also disturbs the surface. */
export function waterBobTarget(accelerationX = 0, accelerationY = 0) {
  return bound(valid(accelerationY) * 1.65 + valid(accelerationX) * 0.28,
    -MAX_WATER_BOB_PX, MAX_WATER_BOB_PX)
}
export function tiltAttenuation(fillPercent) {
  const percent = Number(fillPercent)
  if (!Number.isFinite(percent)) return 0
  // 18% -> 1 (full response), 2% -> 0.125, 0% / 100% -> 0.
  return bound(Math.min(percent, 100 - percent) / 16, 0, 1)
}
export function sloshEdgeOffset(fillPercent, surfacePx, intensity = 1) {
  return bound(valid(surfacePx) * tiltAttenuation(fillPercent) * valid(intensity),
    -MAX_SLOSH_PX, MAX_SLOSH_PX)
}
export function waterBobOffset(fillPercent, bobPx, intensity = 1) {
  return bound(valid(bobPx) * tiltAttenuation(fillPercent) * valid(intensity),
    -MAX_WATER_BOB_PX, MAX_WATER_BOB_PX)
}
export function advanceWaterSpring(state, target, dtSeconds, limit = MAX_SLOSH_PX) {
  const max = bound(valid(limit), 0.1, MAX_SLOSH_PX)
  const step = bound(valid(dtSeconds), 0.001, 0.035)
  const at = bound(valid(state?.position), -max, max)
  const velocity = bound(valid(state?.velocity), -110, 110)
  // Slightly underdamped: deliberate tilt tracks the hand while a shake
  // creates a short, observable return/overshoot instead of a flat jump.
  const force = (bound(valid(target), -max, max) - at) * 165 - velocity * 13
  const nextVelocity = bound(velocity + force * step, -110, 110)
  return {
    position: bound(at + nextVelocity * step, -max, max),
    velocity: nextVelocity
  }
}
