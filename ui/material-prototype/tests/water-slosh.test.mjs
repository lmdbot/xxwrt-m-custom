import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_SLOSH_PX, sloshTarget, tiltAttenuation, sloshEdgeOffset, advanceWaterSpring
} from '../src/services/waterSloshPhysics.js'

test('phone roll and acceleration drive bounded liquid surface, with no fabricated values', () => {
  assert.equal(sloshTarget(0, 0), 0)
  assert.ok(sloshTarget(9.81, 0) > 0)
  assert.ok(sloshTarget(-9.81, 0) < 0)
  assert.equal(sloshTarget(100, 200), MAX_SLOSH_PX)
  assert.equal(sloshTarget(-100, -200), -MAX_SLOSH_PX)
  assert.equal(sloshTarget(NaN, Infinity), 0)
})
test('zero and full water remain fixed, partial fill can tilt without level change', () => {
  assert.equal(tiltAttenuation(0), 0)
  assert.equal(tiltAttenuation(100), 0)
  assert.equal(tiltAttenuation(NaN), 0)
  assert.equal(tiltAttenuation(50), 1)
  assert.equal(sloshEdgeOffset(0, 8), 0)
  assert.equal(sloshEdgeOffset(100, 8), 0)
  assert.ok(sloshEdgeOffset(2, 8) > 0)
  assert.ok(sloshEdgeOffset(50, -8) < 0)
  assert.ok(sloshEdgeOffset(50, 100) <= MAX_SLOSH_PX)
})
test('damped inertia settles after a phone shake with finite bounded steps', () => {
  let state = { position: 0, velocity: 0 }
  for (let i=0; i<18; i++) state=advanceWaterSpring(state, 7, 1/60)
  assert.ok(state.position > 0)
  assert.ok(Math.abs(state.position) <= MAX_SLOSH_PX)
  for (let i=0; i<240; i++) state=advanceWaterSpring(state, 0, 1/60)
  assert.ok(Math.abs(state.position) < 0.03)
  assert.ok(Math.abs(state.velocity) < 0.03)
})
