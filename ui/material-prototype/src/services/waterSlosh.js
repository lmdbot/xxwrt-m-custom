import { Capacitor, registerPlugin } from '@capacitor/core'
import { advanceWaterSpring, sloshEdgeOffset, sloshTarget } from './waterSloshPhysics.js'

const WaterMotion = registerPlugin('WaterMotion')

/**
 * Directly updates three CSS variables, not the large reactive Vue dashboard.
 * Activity is controlled by page visibility, selected tab and motion settings.
 */
export function createWaterSlosh({ getContainer }) {
  let active = false
  let generation = 0
  let subscription = null
  let nativeStarted = false
  let frame = 0
  let previousFrame = 0
  let gravityX = 0
  let accelerationX = 0
  let state = { position: 0, velocity: 0 }
  let lastAccelerometerAt = 0
  const webCallbacks = []

  function schedule() {
    if (active && !frame) frame = requestAnimationFrame(render)
  }
  function render(timestamp) {
    frame = 0
    if (!active) return
    const dt = previousFrame ? (timestamp - previousFrame) / 1000 : 1 / 60
    previousFrame = timestamp
    // Linear acceleration is temporary; it must not leave the surface tilted.
    const elapsed = Math.max(0, timestamp - lastAccelerometerAt)
    const transient = elapsed > 250 ? accelerationX * Math.exp(-(elapsed - 250) / 230) : accelerationX
    const target = sloshTarget(gravityX, transient)
    state = advanceWaterSpring(state, target, dt)
    const tiles = getContainer()?.querySelectorAll('.v3-metric--water') || []
    let index = 0
    for (const tile of tiles) {
      const fill = parseFloat(tile.style.getPropertyValue('--v3-water-percent'))
      const offset = sloshEdgeOffset(fill, state.position, 1 - (index % 3) * 0.085)
      tile.style.setProperty('--v3-water-slope', offset.toFixed(2) + 'px')
      index++
    }
    if (Math.abs(target - state.position) > 0.025 || Math.abs(state.velocity) > 0.06) schedule()
  }
  function sensorSample(gravity, acceleration) {
    if (!active) return
    gravityX = Number.isFinite(Number(gravity)) ? Number(gravity) : 0
    if (Number.isFinite(Number(acceleration))) {
      accelerationX = Number(acceleration)
      lastAccelerometerAt = performance.now()
    }
    schedule()
  }
  function webSensorFallback() {
    if (!active || typeof window === 'undefined') return
    const onOrientation = event => {
      // gamma is roll around the screen's lengthwise axis.
      if (typeof event.gamma !== 'number' || !Number.isFinite(event.gamma)) return
      gravityX = Math.sin(event.gamma * Math.PI / 180) * 9.81
      schedule()
    }
    const onMotion = event => {
      const linear = event.acceleration?.x
      if (typeof linear === 'number' && Number.isFinite(linear)) {
        accelerationX = linear
        lastAccelerometerAt = performance.now()
        schedule()
      } else if (typeof event.accelerationIncludingGravity?.x === 'number' &&
                 Number.isFinite(event.accelerationIncludingGravity.x)) {
        gravityX = event.accelerationIncludingGravity.x
        schedule()
      }
    }
    window.addEventListener('deviceorientation', onOrientation, { passive: true })
    window.addEventListener('devicemotion', onMotion, { passive: true })
    webCallbacks.push(() => window.removeEventListener('deviceorientation', onOrientation))
    webCallbacks.push(() => window.removeEventListener('devicemotion', onMotion))
  }
  async function start() {
    if (active) return
    active = true
    const token = ++generation
    state = { position: 0, velocity: 0 }
    gravityX = 0
    accelerationX = 0
    previousFrame = 0
    lastAccelerometerAt = 0
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('WaterMotion')) {
      try {
        const listener = await WaterMotion.addListener('sample', data =>
          sensorSample(data.gravityX, data.accelerationX))
        if (!active || token !== generation) { await listener.remove(); return }
        subscription = listener
        const info = await WaterMotion.start()
        if (!active || token !== generation) {
          await WaterMotion.stop().catch(() => {})
          return
        }
        nativeStarted = Boolean(info?.available)
        if (nativeStarted) return
        await listener.remove()
        subscription = null
      } catch {
        // Older APK/WebViews can fall back without making the dashboard unusable.
        if (subscription) { await subscription.remove().catch(() => {}); subscription = null }
      }
    }
    if (active && token === generation) webSensorFallback()
  }
  function stop() {
    active = false
    ++generation
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    previousFrame = 0
    while (webCallbacks.length) webCallbacks.pop()()
    const listener = subscription
    subscription = null
    if (listener) void listener.remove().catch(() => {})
    if (nativeStarted || listener) void WaterMotion.stop().catch(() => {})
    nativeStarted = false
    for (const tile of getContainer()?.querySelectorAll('.v3-metric--water') || [])
      tile.style.removeProperty('--v3-water-slope')
  }
  return { start, stop }
}
