import test from 'node:test'
import assert from 'node:assert/strict'
import { xiaomiRequestFromQwrt } from '../src/services/xiaomiQwrtTransport.js'

function stubRpc(output = { code: 0, stdout: '{"code":0,"list":[]}' }) {
  const calls = []
  return {
    client: {
      session: 'authenticated-ubus-session',
      async call(object, method, payload) {
        calls.push({ object, method, payload })
        return output
      }
    },
    calls
  }
}

test('GET originates from QWRT file.exec using a fixed curl binary, never from Android', async () => {
  const rpc = stubRpc()
  const data = await xiaomiRequestFromQwrt(rpc.client, '192.168.100.2',
    '/cgi-bin/luci/api/xqsystem/init_info')
  assert.deepEqual(data, { code: 0, list: [] })
  assert.equal(rpc.calls.length, 1)
  const { object, method, payload } = rpc.calls[0]
  assert.equal(object, 'file')
  assert.equal(method, 'exec')
  assert.equal(payload.command, '/usr/bin/curl')
  assert.deepEqual(payload.params.slice(0, 2), ['-q', '--silent'])
  assert.ok(payload.params.includes('--noproxy'))
  assert.ok(payload.params.includes('--max-time'))
  assert.ok(payload.params.includes('--max-filesize'))
  assert.equal(payload.params.at(-2), '--')
  assert.equal(payload.params.at(-1), 'http://192.168.100.2/cgi-bin/luci/api/xqsystem/init_info')
  assert.ok(!payload.params.includes('--location'))
  assert.equal(payload.env, null)
})

test('POST forwards only form digest, not a Xiaomi password', async () => {
  const rpc = stubRpc({ code: 0, stdout: '{"code":0,"token":"abc"}' })
  const body = { username: 'admin', password: 'a'.repeat(64), logtype: '2', nonce: 'safe_1' }
  const response = await xiaomiRequestFromQwrt(rpc.client, '10.0.0.2',
    '/cgi-bin/luci/api/xqsystem/login', body)
  assert.equal(response.token, 'abc')
  const args = rpc.calls[0].payload.params
  assert.ok(args.includes('POST'))
  const encoded = args[args.indexOf('--data-raw') + 1]
  assert.equal(encoded, new URLSearchParams(body).toString())
  assert.ok(!encoded.includes('plainRouterPassword'))
})

test('never proxy an arbitrary URL, shell command, or public IP', async () => {
  const rpc = stubRpc()
  await assert.rejects(() => xiaomiRequestFromQwrt(rpc.client, '8.8.8.8',
    '/cgi-bin/luci/api/xqsystem/init_info'), /仅允许/)
  await assert.rejects(() => xiaomiRequestFromQwrt(rpc.client, '192.168.100.2',
    '/cgi-bin/luci/admin'), /不允许/)
  await assert.rejects(() => xiaomiRequestFromQwrt(rpc.client, '192.168.100.2',
    '/cgi-bin/luci/;stok=123/api/misystem/devicelist/../../etc/passwd'), /不允许/)
  assert.equal(rpc.calls.length, 0)
})

test('router RPC errors remain errors rather than cached terminal data', async () => {
  const denied = stubRpc(null)
  await assert.rejects(() => xiaomiRequestFromQwrt(denied.client, '192.168.100.2',
    '/cgi-bin/luci/api/xqsystem/init_info'), /RPC 权限/)
  const timeout = stubRpc({ code: 28, stdout: '', stderr: 'timed out' })
  await assert.rejects(() => xiaomiRequestFromQwrt(timeout.client, '192.168.100.2',
    '/cgi-bin/luci/api/xqsystem/init_info'), /超时/)
  const missing = stubRpc({ code: 127, stdout: '', stderr: 'not found' })
  await assert.rejects(() => xiaomiRequestFromQwrt(missing.client, '192.168.100.2',
    '/cgi-bin/luci/api/xqsystem/init_info'), /安装 curl/)
  const malformed = stubRpc({ code: 0, stdout: '<html>login</html>', stderr: '' })
  await assert.rejects(() => xiaomiRequestFromQwrt(malformed.client, '192.168.100.2',
    '/cgi-bin/luci/api/xqsystem/init_info'), /JSON/)
})

test('stok path remains constrained to two read-only inventory endpoints', async () => {
  const rpc = stubRpc()
  const inventory = ['/cgi-bin/luci/;stok=abc123/api/misystem/devicelist',
    '/cgi-bin/luci/;stok=abc123/api/xqsystem/device_list?all=1']
  for (const path of inventory)
    await xiaomiRequestFromQwrt(rpc.client, '192.168.100.2', path)
  assert.equal(rpc.calls.length, 2)
})
