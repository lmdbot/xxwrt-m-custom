import test from 'node:test'
import assert from 'node:assert/strict'
import { formatLeaseDuration } from '../src/services/leaseTime.js'

test('DHCP remaining lease seconds use adaptive Chinese time units', () => {
  for (const [input, expected] of [
    [38, '38秒'],
    [60, '1分钟'],
    [125, '2分钟'],
    [3661, '1小时1分钟'],
    [86400, '1天'],
    [93600, '1天2小时'],
    [176460, '2天1小时1分钟'],
    ['3661', '1小时1分钟'],
  ]) {
    assert.equal(formatLeaseDuration(input), expected, String(input))
  }
})

test('DHCP remaining lease special and invalid values', () => {
  assert.equal(formatLeaseDuration(0), '已到期')
  assert.equal(formatLeaseDuration(-1), '永久租约')
  assert.equal(formatLeaseDuration(-20), '--')
  assert.equal(formatLeaseDuration(null), '--')
  assert.equal(formatLeaseDuration(undefined), '--')
  assert.equal(formatLeaseDuration(''), '--')
  assert.equal(formatLeaseDuration('not-a-number'), '--')
  assert.equal(formatLeaseDuration(Infinity), '--')
})
