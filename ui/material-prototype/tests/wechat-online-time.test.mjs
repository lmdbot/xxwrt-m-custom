import test from 'node:test'
import assert from 'node:assert/strict'
import { formatWechatOnlineTime } from '../src/services/wechatOnlineTime.js'
const now = 1763200000

test('WechatPush Unix timestamp means online since, not duration', () => {
  for (const [raw, expected] of [
    [now - 45, '45秒'],
    [String(now - 125), '2分钟5秒'],
    [now - 3661, '1小时1分钟'],
    [now - 90000, '1天1小时'],
    [(now - 3661) * 1000, '1小时1分钟'],
    [now, '不足1秒'],
    [now + 100, '刚刚上线']
  ]) assert.equal(formatWechatOnlineTime(raw, now), expected, String(raw))
})

test('handles legacy elapsed seconds and already human-readable text', () => {
  assert.equal(formatWechatOnlineTime(45, now), '45秒')
  assert.equal(formatWechatOnlineTime('125', now), '2分钟5秒')
  assert.equal(formatWechatOnlineTime('3661', now), '1小时1分钟')
  assert.equal(formatWechatOnlineTime('2小时', now), '2小时')
  assert.equal(formatWechatOnlineTime('1天3小时', now), '1天3小时')
})

test('invalid or absent uptimes remain unknown rather than producing giant durations', () => {
  for (const raw of [null, undefined, '', 'null', '--', 'NaN', '-1', 'bad', Infinity]) {
    assert.equal(formatWechatOnlineTime(raw, now), '--', String(raw))
  }
})
