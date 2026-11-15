/**
 * Recognize an intentional rightward swipe starting near the left edge.
 * Ordinary vertical scrolling and chart touch events should not open UI.
 */
export const DRAWER_EDGE_WIDTH = 72
export const DRAWER_MIN_TRAVEL = 72

export function isLeftEdgeDrawerSwipe(start, end) {
  if (!start || !end) return false
  if (![start.x, start.y, start.time, end.x, end.y, end.time]
    .every(Number.isFinite)) return false
  if (start.x < 0 || start.x > DRAWER_EDGE_WIDTH) return false
  const dx = end.x - start.x
  const dy = Math.abs(end.y - start.y)
  const duration = end.time - start.time
  return dx >= DRAWER_MIN_TRAVEL && dy <= Math.max(18, dx * 0.5) &&
    duration >= 0 && duration <= 1000
}
