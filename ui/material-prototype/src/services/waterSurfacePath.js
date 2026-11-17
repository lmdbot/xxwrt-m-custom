/**
 * One unbroken, continuous liquid shape spanning the whole resource tile.
 * The native gravity and shake deltas affect this path directly rather than
 * intersecting CSS cutouts with a polygon at high phone tilt.
 * Coordinates use SVG viewBox 0..100 on both axes; slopes remain measured in
 * CSS pixels so tilting responds consistently across device sizes.
 */
const limit = (n, a, b) => Math.max(a, Math.min(b, n))
const finite = (n, fallback=0) => Number.isFinite(Number(n)) ? Number(n) : fallback
const fixed = n => limit(n, 0, 100).toFixed(2)

export function waterSurfacePath(fillPercent, slopePx=0, bobPx=0, ripplePx=1.1, tileHeightPx=140) {
  const fill = limit(finite(fillPercent), 0, 100)
  if (fill <= 0) return 'M 0 100 L 100 100 Z'
  if (fill >= 100) return 'M 0 0 L 100 0 L 100 100 L 0 100 Z'

  const height = Math.max(1, finite(tileHeightPx, 140))
  // Bounded deltas from the spring; prevents unexpected sensor spikes from
  // drawing beyond the card even when a device has noisy accelerometers.
  const slope = limit(finite(slopePx), -14, 14) / height * 100
  const bob = limit(finite(bobPx), -5, 5) / height * 100
  const attenuation = limit(Math.min(fill, 100 - fill) / 16, 0, 1)
  const ripple = limit(finite(ripplePx), 0, 2) / height * 100 * attenuation
  const mid = limit(100 - fill + bob, 0, 100)
  const left = limit(mid + slope, 0, 100)
  const right = limit(mid - slope, 0, 100)
  // Two cubic segments share their exact midpoint and tangent: C1 continuity.
  // The up/down ripple adjustments are symmetrical, preserving the average
  // water percentage rather than generating a detached surface fragment.
  const a = left + (mid - left) * .34 - ripple
  const b = left + (mid - left) * .66 - ripple
  const c = mid + (right - mid) * .34 + ripple
  const d = mid + (right - mid) * .66 + ripple
  return `M 0 ${fixed(left)} C 17 ${fixed(a)} 33 ${fixed(b)} 50 ${fixed(mid)} C 67 ${fixed(c)} 83 ${fixed(d)} 100 ${fixed(right)} L 100 100 L 0 100 Z`
}
