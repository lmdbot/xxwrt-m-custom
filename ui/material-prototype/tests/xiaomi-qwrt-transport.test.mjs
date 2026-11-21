import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { xiaomiRequestFromQwrt } from '../src/services/xiaomiQwrtTransport.js'

const backend = fileURLToPath(new URL('../../../router/luci.xxwrt-xiaomi', import.meta.url))
const installer = fileURLToPath(new URL('../../../router/XX-WRT-QWRT-xiaomi-install.sh', import.meta.url))

function stubRpc(output = { code: 0, body: '{"code":0,"list":[]}' }) {
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

test('Xiaomi requests use a dedicated scoped ubus plugin; not the denied file.exec', async () => {
  const rpc = stubRpc()
  const result = await xiaomiRequestFromQwrt(rpc.client, '192.168.100.139',
    '/cgi-bin/luci/api/xqsystem/init_info')
  assert.deepEqual(result, { code: 0, list: [] })
  assert.deepEqual(rpc.calls, [{
    object: 'luci.xxwrt-xiaomi', method: 'Fetch',
    payload: { address: 'http://192.168.100.139', path: '/cgi-bin/luci/api/xqsystem/init_info', form: '' }
  }])
})

test('BE5000 login HTML is fetched from QWRT without executing its markup', async () => {
  const page = '<html><script>var deviceId = "ac:12:34:56:78:90"; var Encrypt = { key: "publicKey123" };</script></html>'
  const rpc = stubRpc({ code: 0, body: page })
  const result = await xiaomiRequestFromQwrt(rpc.client, '192.168.100.139',
    '/cgi-bin/luci/web')
  assert.equal(result, page)
  assert.deepEqual(rpc.calls[0].payload, {
    address: 'http://192.168.100.139', path: '/cgi-bin/luci/web', form: ''
  })
  await assert.rejects(
    () => xiaomiRequestFromQwrt(rpc.client, '192.168.100.139',
      '/cgi-bin/luci/web', { password: 'unsafe' }), /方法不合法/
  )
})

test('POST sends only the challenge response, not plaintext Xiaomi password', async () => {
  const rpc = stubRpc({ code: 0, body: '{"code":0,"token":"abc"}' })
  const credentials = { username: 'admin', password: 'a'.repeat(64), logtype: '2', nonce: 'safe_1' }
  const data = await xiaomiRequestFromQwrt(rpc.client, '10.0.0.2',
    '/cgi-bin/luci/api/xqsystem/login', credentials)
  assert.equal(data.token, 'abc')
  assert.equal(rpc.calls[0].payload.form, new URLSearchParams(credentials).toString())
  assert.equal(rpc.calls[0].payload.form.includes('plainRouterPassword'), false)
})

test('unapproved destinations and methods never hit QWRT', async () => {
  const rpc = stubRpc()
  for (const [addr, path, form] of [
    ['8.8.8.8', '/cgi-bin/luci/api/xqsystem/init_info', null],
    ['192.168.100.2', '/cgi-bin/luci/admin', null],
    ['192.168.100.2', '/cgi-bin/luci/;stok=abc/api/misystem/devicelist/../../etc/passwd', null],
    ['192.168.100.2', '/cgi-bin/luci/api/xqsystem/login', null],
    ['192.168.100.2', '/cgi-bin/luci/api/xqsystem/init_info', { bogus: 1 }]
  ]) await assert.rejects(() => xiaomiRequestFromQwrt(rpc.client, addr, path, form))
  assert.equal(rpc.calls.length, 0)
})

test('RPC access code 6 explains the required QWRT helper instead of blaming Xiaomi password', async () => {
  const denied = stubRpc()
  denied.client.call = async () => { throw new Error('RPC 没有权限或登录已失效（代码 6）') }
  await assert.rejects(
    () => xiaomiRequestFromQwrt(denied.client, '192.168.100.139',
      '/cgi-bin/luci/api/xqsystem/init_info'),
    /尚未安装或授权小米查询扩展/
  )
})

test('OpenWrt -32000 identifies a missing ubus object, not Xiaomi authentication', async () => {
  const rpc = stubRpc()
  rpc.client.call = async () => { throw new Error('RPC 调用失败（代码 -32000）') }
  await assert.rejects(() => xiaomiRequestFromQwrt(rpc.client, '192.168.100.139',
    '/cgi-bin/luci/api/xqsystem/init_info'), /没有注册小米查询 RPC 对象/)
})

test('curl and relay failures preserve an actionable error', async () => {
  const responses = [
    [{ code: 28, body: '' }, /超时/],
    [{ code: 127, body: '' }, /缺少 curl/],
    [{ code: 7, body: '' }, /无法连接/],
    [{ code: 400, body: '' }, /参数被安全校验拒绝/],
    [{ code: 0, body: '<html>bad</html>' }, /JSON/]
  ]
  for (const [payload, pattern] of responses)
    await assert.rejects(
      () => xiaomiRequestFromQwrt(stubRpc(payload).client, '192.168.100.2',
        '/cgi-bin/luci/api/xqsystem/init_info'),
      pattern
    )
})

test('authenticated MiWiFi inventory has only two allowed read endpoints', async () => {
  const rpc = stubRpc()
  for (const path of ['/cgi-bin/luci/;stok=abcd1234/api/misystem/devicelist',
    '/cgi-bin/luci/;stok=abcd1234/api/xqsystem/device_list?all=1'])
    await xiaomiRequestFromQwrt(rpc.client, '192.168.100.139', path)
  assert.equal(rpc.calls.length, 2)
})

test('router helper shell scripts parse and installer ACL cannot grant generic file.exec', () => {
  execFileSync('sh', ['-n', backend])
  execFileSync('sh', ['-n', installer])
  const helper = readFileSync(backend, 'utf8')
  const setup = readFileSync(installer, 'utf8')
  assert.match(helper, /--noproxy/)
  assert.match(helper, /--max-filesize/)
  assert.match(helper, /--max-time/)
  assert.match(helper, /--proto/)
  assert.match(helper, /\/cgi-bin\/luci\/web/)
  assert.match(setup, /luci\.xxwrt-xiaomi/)
  assert.doesNotMatch(setup, /"file"\s*:\s*\[/)
  const list = execFileSync('sh', [backend, 'list'], { encoding: 'utf8' }).trim()
  assert.deepEqual(JSON.parse(list), { Fetch: { address: 'str', path: 'str', form: 'str' } })
  assert.match(setup, /ubus -v list/)
  assert.match(setup, /ubus call 'luci\.xxwrt-xiaomi' Fetch/)
  assert.match(setup, /FAIL|fail 'The Xiaomi ubus object is missing/)
  assert.match(setup, /SUCCESS: QWRT has registered/)
})

// OpenWrt's jshn.sh reads optional JSON_PREFIX / JSON_CUR without defining
// them first. nounset in the rpcd backend makes these library calls fatal.
test('QWRT rpcd worker handles jshn optional globals without nounset', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xxwrt-xiaomi-rpcd-'))
  const helper = join(dir, 'luci.xxwrt-xiaomi')
  const jshn = join(dir, 'jshn.sh')
  try {
    writeFileSync(jshn, [
      'json_load() { JSON_CUR=J_V; }',
      // Deliberately reference an unset variable, as OpenWrt jshn does.
      'json_get_var() { local __prefix="${JSON_PREFIX}"; case "$2" in address) eval "$1=http://127.0.0.1";; path) eval "$1=/cgi-bin/luci/api/xqsystem/init_info";; form) eval "$1=";; esac; }',
      'json_init() { :; }',
      'json_add_int() { code=$2; }',
      'json_add_string() { body=$2; }',
      'json_dump() { printf \'{"code":%s,"body":"%s"}\\n\' "$code" "$body"; }'
    ].join('\n') + '\n')
    const source = readFileSync(backend, 'utf8')
      .replaceAll('/usr/share/libubox/jshn.sh', jshn)
    writeFileSync(helper, source)
    const response = execFileSync('sh', [helper, 'call', 'Fetch'], {
      encoding: 'utf8', timeout: 3000,
      input: '{"address":"http://127.0.0.1","path":"/cgi-bin/luci/api/xqsystem/init_info","form":""}'
    })
    assert.deepEqual(JSON.parse(response), { code: 400, body: '' })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
