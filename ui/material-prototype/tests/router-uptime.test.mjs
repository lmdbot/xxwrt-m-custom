import assert from 'node:assert/strict'
import test from 'node:test'
import { formatRouterUptime } from '../src/services/routerUptime.js'
test('home and saved router list uptime are formatted in adaptive Chinese', () => {
  for (const [seconds, expected] of [
    [0, '0秒'], [35, '35秒'], [60, '1分钟'], [126, '2分钟'],
    [3600, '1小时'], [3660, '1小时1分钟'], [86400, '1天'],
    [165600, '1天22小时'], [165660, '1天22小时1分钟'],
    [173100, '2天5分钟'], ['165660', '1天22小时1分钟']
  ]) {
    assert.equal(formatRouterUptime(seconds), expected, String(seconds))
  }
})
test('invalid uptime values are not displayed as fake durations', () => {
  for (const value of [undefined, null, '', -1, 'abc', Infinity]) {
    assert.equal(formatRouterUptime(value), '--')
  }
})
