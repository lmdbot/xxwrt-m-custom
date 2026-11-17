import test from 'node:test'
import assert from 'node:assert/strict'
import { waterSurfacePath } from '../src/services/waterSurfacePath.js'

const edges = d => {
  const first = /^M 0 ([\d.]+) C /.exec(d)
  const last = /100 ([\d.]+) L 100 100 L 0 100 Z$/.exec(d)
  assert.ok(first && last, 'surface is one continuous two-cubic shape')
  return [Number(first[1]), Number(last[1])]
}
test('18% storage fill has one continuous liquid surface even at ±70° tilt', () => {
  for (const slope of [-14, 14]) {
    const path = waterSurfacePath(18, slope, 0, 1.2, 140)
    assert.equal((path.match(/ C /g) || []).length, 2)
    assert.equal((path.match(/ M /g) || []).length, 0)
    assert.equal((path.match(/ L 100 100 L 0 100 Z/g) || []).length, 1)
    const [left, right] = edges(path)
    assert.ok(left >= 0 && right >= 0 && left <= 100 && right <= 100)
    assert.ok(Math.abs((left + right) / 2 - 82) < .02)
    assert.ok(Math.abs(left - right) > 15, 'large tilts stay visible')
  }
})
test('vertical shaking shifts the entire curved surface without introducing spikes', () => {
  const normal = edges(waterSurfacePath(18, 0, 0, 1, 140))
  const shake = edges(waterSurfacePath(18, 0, -5, 1, 140))
  assert.ok(normal.every((v,i)=>v > shake[i]))
})
test('empty/full water, missing values, and extreme sensor data stay within bounds', () => {
  assert.equal(waterSurfacePath(0), 'M 0 100 L 100 100 Z')
  assert.equal(waterSurfacePath(100), 'M 0 0 L 100 0 L 100 100 L 0 100 Z')
  assert.equal(waterSurfacePath(NaN), 'M 0 100 L 100 100 Z')
  for (const pct of [2,10,18,50,95,99]) {
    const [left,right]=edges(waterSurfacePath(pct,2000,-9999,30,70))
    assert.ok([left,right].every(v=>Number.isFinite(v)&&v>=0&&v<=100))
  }
})
