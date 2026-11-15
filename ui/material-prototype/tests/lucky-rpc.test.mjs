import assert from 'node:assert/strict'
import test from 'node:test'
import {
  luckyVersionAtLeast, luckyRuleBytes, normalizeLuckyRules, luckyToken,
  parseLuckyReply, luckyCore, luckyStatus, luckyWatchdog,
  luckyService, luckyRulesOpen, luckyRulesSave, luckyArchive, luckyDiagnostics
} from '../src/services/luckyRpc.js'

const ok = value => ({ code: 0, stdout: JSON.stringify({ ok: true, ...value }) })
function router(handlers) {
  const calls = []
  return {
    calls,
    async call(object, method, args, optional) {
      calls.push({ object, method, args, optional })
      if (object === 'file' && method === 'write') return {}
      return handlers[args.command + ' ' + (args.params || []).join(' ')] ?? null
    }
  }
}

test('Lucky allowlist requires a stable 3.1.0+ version', () => {
  assert.equal(luckyVersionAtLeast('3.1.0', 3, 1), true)
  assert.equal(luckyVersionAtLeast('v3.5.1', 3, 1), true)
  assert.equal(luckyVersionAtLeast('3.0.99', 3, 1), false)
  assert.equal(luckyVersionAtLeast('3.1.0-rc1', 3, 1), false)
  assert.equal(luckyVersionAtLeast('--', 3, 1), false)
})
test('Lucky rules allow valid UTF-8 and reject oversized/control data', () => {
  assert.equal(normalizeLuckyRules('127.0.0.1\r\n::1\n'), '127.0.0.1\n::1\n')
  assert.equal(luckyRuleBytes('测试'), 6)
  assert.throws(() => normalizeLuckyRules('字'.repeat(22000)), /64 KiB/)
  assert.throws(() => normalizeLuckyRules('1.2.3.4\x00'), /控制字符/)
})
test('Lucky tokens only permit existing private 32-digit hex workspaces', () => {
  assert.equal(luckyToken('a'.repeat(32)), 'a'.repeat(32))
  for (const bad of ['../etc/passwd', 'A'.repeat(32), 'f'.repeat(31), 'f'.repeat(32) + '/../../']) {
    assert.throws(() => luckyToken(bad), /临时会话无效/)
  }
})
test('Lucky backup responses must include ok=true', () => {
  assert.deepEqual(parseLuckyReply('{"ok":true,"status":"ready"}'), { ok: true, status: 'ready' })
  assert.throws(() => parseLuckyReply('{"ok":false,"error":"failure"}'), /failure/)
  assert.throws(() => parseLuckyReply('not-json'), /JSON/)
})
test('Lucky core, running, and watchdog use the official scoped helpers', async () => {
  const client = router({
    '/usr/libexec/lucky-backup core-status': ok({ status: 'ready' }),
    '/usr/libexec/lucky-call status': { code: 0, stdout: 'true\n' },
    '/usr/libexec/lucky-watchdog status': {
      code: 0, stdout: '{"enabled":false,"scheduled":false,"paused":false,"cron_running":true}\n'
    },
    '/usr/libexec/lucky-call service restart': { code: 0, stdout: '' },
    '/usr/libexec/lucky-diagnostics read': { code: 0, stdout: '{"sources":[{"name":"logread","status":"ok"}],"events":[]}' }
  })
  assert.equal((await luckyCore(client)).status, 'ready')
  assert.equal(await luckyStatus(client), true)
  assert.equal((await luckyWatchdog(client)).enabled, false)
  await luckyService(client, 'restart')
  assert.equal((await luckyDiagnostics(client)).sources[0].name, 'logread')
  assert.deepEqual(client.calls.map(x => x.args.command), [
    '/usr/libexec/lucky-backup',
    '/usr/libexec/lucky-call',
    '/usr/libexec/lucky-watchdog',
    '/usr/libexec/lucky-call',
    '/usr/libexec/lucky-diagnostics'
  ])
  await assert.rejects(() => luckyService(client, 'rm -rf /'), /不支持/)
})
test('Lucky rules use server-generated temporary path and write before saving', async () => {
  const token = 'b'.repeat(32)
  const client = router({
    '/usr/libexec/lucky-backup rules-localips': ok({
      token, content: '192.168.0.0/16\n', directory: '/etc/lucky', name: 'localips'
    }),
    ['/usr/libexec/lucky-backup rules-save ' + token]: ok({}),
    ['/usr/libexec/lucky-backup cleanup ' + token]: ok({})
  })
  const item = await luckyRulesOpen(client, 'localips')
  assert.equal(item.token, token)
  await luckyRulesSave(client, item.token, '10.0.0.0/8\n')
  assert.equal(client.calls[1].args.path, '/tmp/lucky-luci-backup/' + token + '/rules.json')
  assert.equal(JSON.parse(client.calls[1].args.data).content, '10.0.0.0/8\n')
  assert.equal(client.calls[2].args.params[0], 'rules-save')
  await luckyArchive(client, 'cleanup', token)
  await assert.rejects(() => luckyRulesSave(client, '../x', 'x'), /临时会话无效/)
})
