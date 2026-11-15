import test from 'node:test'
import assert from 'node:assert/strict'
import { isLeftEdgeDrawerSwipe, DRAWER_EDGE_WIDTH } from '../src/services/drawerSwipe.js'

const start = (x = 32, y = 250, time = 0) => ({ x, y, time })
const end = (x = 128, y = 252, time = 270) => ({ x, y, time })

test('rightward swipe from the left edge opens the drawer', () => {
  assert.equal(isLeftEdgeDrawerSwipe(start(), end()), true)
  assert.equal(isLeftEdgeDrawerSwipe(start(DRAWER_EDGE_WIDTH), end(180)), true)
  assert.equal(isLeftEdgeDrawerSwipe(start(0), end(86)), true)
})

test('ordinary taps, scrolls, chart swipes and opposite direction do not open', () => {
  assert.equal(isLeftEdgeDrawerSwipe(start(130), end(250)), false)
  assert.equal(isLeftEdgeDrawerSwipe(start(), end(55)), false)
  assert.equal(isLeftEdgeDrawerSwipe(start(), end(-70)), false)
  assert.equal(isLeftEdgeDrawerSwipe(start(), end(101, 390)), false)
  assert.equal(isLeftEdgeDrawerSwipe(start(), end(115, 320)), false)
})

test('reject invalid, multi-second and interrupted gestures', () => {
  assert.equal(isLeftEdgeDrawerSwipe(null, end()), false)
  assert.equal(isLeftEdgeDrawerSwipe(start(), null), false)
  assert.equal(isLeftEdgeDrawerSwipe(start(), end(140, 254, 1500)), false)
  assert.equal(isLeftEdgeDrawerSwipe(start(), end(140, 254, -1)), false)
  assert.equal(isLeftEdgeDrawerSwipe(start(-1), end()), false)
  assert.equal(isLeftEdgeDrawerSwipe(start(NaN), end()), false)
})
