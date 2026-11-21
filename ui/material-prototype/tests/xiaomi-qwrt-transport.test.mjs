import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  xiaomiRequestFromQwrt, XIAOMI_BRIDGE_OBJECT, XIAOMI_BRIDGE_METHOD,
  XIAOMI_INSTALL_COMMAND
} from '../src/services/xiaomiQwrtTransport.js'

function stubRpc(output = { code: 0, list: [] }) {
  const calls = []
  return {
    client: {
      session: 'logged-in-qwrt-ubus-session',
      async call(object, method, payload) {
        calls.push({ object, method, payload })
        if (output instanceof Error) throw output
        return output
      }
    },
    calls
  }
}

test('all Xiaomi HTTP requests originate in a dedicated QWRT RPC object', async () => {
  const rpc = stubRpc()
  const result = await xiaomiRequestFromQwrt(rpc.client, '192.168.100.139',
    '/cgi-bin/luci/api/xqsystem/init_info')
  assert.deepEqual(result, { code: 0, list: [] })
  assert.equal(rpc.calls.length, 1)
  const { object, method, payload } = rpc.calls[0]
  assert.equal(object, XIAOMI_BRIDGE_OBJECT)
  assert.equal(object, 'luci.xxwrt-xiaomi')
  assert.equal(method, XIAOMI_BRIDGE_METHOD)
  assert.deepEqual(payload, {
    address: 'http://192.168.100.139',
    path: '/cgi-bin/luci/api/xqsystem/init_info',
    form: ''
  })
  assert.equal(payload.command, undefined)
})

test('login forwards only URL-encoded hash/nonce, not admin plaintext', async () => {
  const rpc = stubRpc({ code: 0, token: 'abcdef' })
  const body = { username: 'admin', password: 'a'.repeat(64), logtype: '2',
    nonce: '0_00:00:00:00:00:00_100_999' }
  const response = await xiaomiRequestFromQwrt(rpc.client, '10.0.0.2',
    '/cgi-bin/luci/api/xqsystem/login', body)
  assert.equal(response.token, 'abcdef')
  assert.equal(rpc.calls[0].payload.form, new URLSearchParams(body).toString())
  assert.ok(!rpc.calls[0].payload.form.includes('secretAdminPassword'))
})

test('only allow MiWiFi login and inventory endpoints and private IP', async () => {
  const rpc = stubRpc()
  await assert.rejects(() => xiaomiRequestFromQwrt(rpc.client, '8.8.8.8',
    '/cgi-bin/luci/api/xqsystem/init_info'), /仅允许/)
  await assert.rejects(() => xiaomiRequestFromQwrt(rpc.client, '192.168.100.139',
    '/cgi-bin/luci/admin'), /不允许/)
  await assert.rejects(() => xiaomiRequestFromQwrt(rpc.client, '192.168.100.139',
    '/cgi-bin/luci/;stok=1/api/misystem/devicelist/../admin'), /不允许/)
  for (const path of ['/cgi-bin/luci/;stok=abc123/api/misystem/devicelist',
    '/cgi-bin/luci/;stok=abc123/api/xqsystem/device_list?all=1'])
    await xiaomiRequestFromQwrt(rpc.client, '192.168.100.139', path)
  assert.equal(rpc.calls.length, 2)
})

test('permission code 6 explains safe one-time QWRT plugin installation', async () => {
  const rpc = stubRpc(new Error('RPC 没有权限或登录已失效（代码 6）'))
  await assert.rejects(() => xiaomiRequestFromQwrt(rpc.client, '192.168.100.139',
    '/cgi-bin/luci/api/xqsystem/init_info'), /安装专用组件.*错误码 6/)
  assert.ok(XIAOMI_INSTALL_COMMAND.includes('XX-WRT-QWRT-xiaomi-install.sh'))
})

test('explicit bridge failures are user-visible and cannot reuse past terminal data', async () => {
  for (const [response, message] of [
    [{ xxwrtXiaomiError: 'curl', code: 7 }, /无法连接/],
    [{ xxwrtXiaomiError: 'curl', code: 28 }, /超时/],
    [{ xxwrtXiaomiError: 'curl', code: 22 }, /HTTP/],
    [{ xxwrtXiaomiError: 'invalid_json', code: 0 }, /JSON/],
    [{ xxwrtXiaomiError: 'bad_address', code: 0 }, /私有 IPv4/]
  ]) {
    const rpc = stubRpc(response)
    await assert.rejects(() => xiaomiRequestFromQwrt(rpc.client, '192.168.100.139',
      '/cgi-bin/luci/api/xqsystem/init_info'), message)
  }
})

test('router backend and installer are POSIX shell; only expose a narrow custom RPC', () => {
  const helper = new URL('../../../router/luci.xxwrt-xiaomi', import.meta.url)
  const installer = new URL('../../../router/XX-WRT-QWRT-xiaomi-install.sh', import.meta.url)
  execFileSync('sh', ['-n', helper.pathname])
  execFileSync('sh', ['-n', installer.pathname])
  const backend = readFileSync(helper, 'utf8')
  const setup = readFileSync(installer, 'utf8')
  assert.match(backend, /call:Request/)
  assert.match(backend, /bad_path/)
  assert.match(backend, /bad_address/)
  assert.match(backend, /--noproxy/)
  assert.match(backend, /--max-time/)
  assert.match(setup, /luci\.xxwrt-xiaomi/)
  assert.match(setup, /"read"/)
  assert.doesNotMatch(setup, /"file"\s*:\s*\{/)
  assert.doesNotMatch(setup, /"file"\s*:\s*\[\s*"exec"/)
  assert.ok(!backend.includes('eval '))
})
