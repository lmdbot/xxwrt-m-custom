import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_SLOSH_PX, MAX_WATER_BOB_PX,
  sloshTarget, tiltAttenuation, sloshEdgeOffset, waterBobOffset,
  waterBobTarget, advanceWaterSpring
} from '../src/services/waterSloshPhysics.js'

test('device tilt and lateral shaking create a visible bounded liquid response', () => {
  assert.equal(sloshTarget(0, 0), 0)
  assert.ok(sloshTarget(9.81, 0) >= 12)
  assert.ok(sloshTarget(-9.81, 0) <= -12)
  assert.ok(sloshTarget(0, 3) > 5)
  assert.equal(sloshTarget(100, 200), MAX_SLOSH_PX)
  assert.equal(sloshTarget(-100, -200), -MAX_SLOSH_PX)
  assert.equal(sloshTarget(NaN, Infinity), 0)
})
test('at 18 percent the surface can visibly tilt and bob; zero/full stay fixed', () => {
  assert.equal(tiltAttenuation(0), 0)
  assert.equal(tiltAttenuation(100), 0)
  assert.equal(tiltAttenuation(NaN), 0)
  assert.equal(tiltAttenuation(18), 1)
  assert.equal(tiltAttenuation(50), 1)
  assert.equal(sloshEdgeOffset(0, 14), 0)
  assert.equal(sloshEdgeOffset(100, 14), 0)
  assert.equal(sloshEdgeOffset(18, 14), 14)
  assert.equal(sloshEdgeOffset(2, 14), 1.75)
  assert.equal(waterBobOffset(18, 4), 4)
  assert.equal(waterBobOffset(0, 4), 0)
  assert.ok(sloshEdgeOffset(50, -14) < 0)
  assert.ok(sloshEdgeOffset(50, 500) <= MAX_SLOSH_PX)
})
test('vertical shaking works even when sideways acceleration is zero', () => {
  assert.ok(waterBobTarget(0, 4) > 3)
  assert.ok(waterBobTarget(0, -4) < -3)
  assert.equal(waterBobTarget(0, 100), MAX_WATER_BOB_PX)
  assert.equal(waterBobTarget(0, -100), -MAX_WATER_BOB_PX)
  assert.equal(waterBobTarget(NaN, Infinity), 0)
})
test('spring overshoots smoothly then settles, with bounded energy at 18 percent', () => {
  let state = { position: 0, velocity: 0 }
  for (let i=0; i<18; i++) state=advanceWaterSpring(state, 12, 1/60)
  assert.ok(state.position > 0 && state.position <= MAX_SLOSH_PX)
  for (let i=0; i<240; i++) state=advanceWaterSpring(state, 0, 1/60)
  assert.ok(Math.abs(state.position) < 0.03)
  assert.ok(Math.abs(state.velocity) < 0.03)
  let bob = { position: 0, velocity: 0 }
  for (let i=0; i<20; i++) bob=advanceWaterSpring(bob, -5, 1/60, MAX_WATER_BOB_PX)
  assert.ok(bob.position < -0.5 && bob.position >= -MAX_WATER_BOB_PX)
  for (let i=0; i<240; i++) bob=advanceWaterSpring(bob, 0, 1/60, MAX_WATER_BOB_PX)
  assert.ok(Math.abs(bob.position) < 0.03)
})
