import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  advanceWaterSpring, sloshEdgeOffset, sloshTarget, waterBobOffset,
  waterBobTarget, MAX_WATER_BOB_PX
} from './waterSloshPhysics.js'

const WaterMotion = registerPlugin('WaterMotion')

/**
 * Only touches visual CSS variables on the water elements. A sensor sample
 * never forces an entire reactive Vue dashboard to re-render.
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
  let accelerationY = 0
  let tilt = { position: 0, velocity: 0 }
  let bob = { position: 0, velocity: 0 }
  let lastAccelerationAt = 0
  const webCallbacks = []

  function schedule() {
    if (active && !frame) frame = requestAnimationFrame(render)
  }
  function render(timestamp) {
    frame = 0
    if (!active) return
    const dt = previousFrame ? (timestamp - previousFrame) / 1000 : 1 / 60
    previousFrame = timestamp
    // Acceleration fades after a shake; gravity/roll persists until the
    // phone is returned upright.
    const elapsed = Math.max(0, performance.now() - lastAccelerationAt)
    const decay = elapsed > 120 ? Math.exp(-(elapsed - 120) / 250) : 1
    const target = sloshTarget(gravityX, accelerationX * decay)
    const bobGoal = waterBobTarget(accelerationX * decay, accelerationY * decay)
    tilt = advanceWaterSpring(tilt, target, dt)
    bob = advanceWaterSpring(bob, bobGoal, dt, MAX_WATER_BOB_PX)
    const tiles = getContainer()?.querySelectorAll('.v3-metric--water') || []
    let index = 0
    for (const tile of tiles) {
      const fill = parseFloat(tile.style.getPropertyValue('--v3-water-percent'))
      const wave = tile.querySelector('.v3-metric-water')
      if (!wave) continue
      const intensity = 1 - (index % 3) * .055
      const slope = sloshEdgeOffset(fill, tilt.position, intensity)
      const bobOffset = waterBobOffset(fill, bob.position, intensity)
      // Store motion on the water itself: Vue patching the parent percentage
      // style cannot erase the sensor values on every telemetry refresh.
      wave.style.setProperty('--v3-water-slope', slope.toFixed(2) + 'px')
      wave.style.setProperty('--v3-water-bob', bobOffset.toFixed(2) + 'px')
      index++
    }
    const moving = Math.abs(target - tilt.position) > 0.025 ||
      Math.abs(tilt.velocity) > 0.06 ||
      Math.abs(bobGoal - bob.position) > 0.025 ||
      Math.abs(bob.velocity) > 0.06
    if (moving) schedule()
  }

  function sensorSample(gravity, ax, ay) {
    if (!active) return
    gravityX = Number.isFinite(gravity) ? gravity : 0
    if (Number.isFinite(ax) || Number.isFinite(ay)) {
      accelerationX = Number.isFinite(ax) ? ax : 0
      accelerationY = Number.isFinite(ay) ? ay : 0
      lastAccelerationAt = performance.now()
    }
    schedule()
  }
  function webSensorFallback() {
    if (!active || typeof window === 'undefined') return
    const onOrientation = event => {
      if (typeof event.gamma !== 'number' || !Number.isFinite(event.gamma)) return
      gravityX = Math.sin(event.gamma * Math.PI / 180) * 9.81
      schedule()
    }
    const onMotion = event => {
      const linear = event.acceleration
      if (Number.isFinite(linear?.x) || Number.isFinite(linear?.y)) {
        sensorSample(gravityX, linear?.x, linear?.y)
      } else if (Number.isFinite(event.accelerationIncludingGravity?.x)) {
        // Browsers without linear acceleration still provide visual tilt.
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
    tilt = { position: 0, velocity: 0 }
    bob = { position: 0, velocity: 0 }
    gravityX = 0
    accelerationX = 0
    accelerationY = 0
    previousFrame = 0
    lastAccelerationAt = 0
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('WaterMotion')) {
      try {
        const listener = await WaterMotion.addListener('sample', sample =>
          sensorSample(sample.gravityX, sample.accelerationX, sample.accelerationY))
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
        // Older APK/WebView will keep the ordinary CSS wave if no sensor works.
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
    for (const tile of getContainer()?.querySelectorAll('.v3-metric-water') || []) {
      tile.style.removeProperty('--v3-water-slope')
      tile.style.removeProperty('--v3-water-bob')
    }
  }
  return { start, stop }
}
