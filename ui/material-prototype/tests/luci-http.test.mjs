import test from 'node:test'
import assert from 'node:assert/strict'
import { extractLuciCookie, describeLuciHttpFailure, isSsrUpgradeEndpoint, ssrLuciReadTimeout, SSR_LUCI_UPGRADE_TIMEOUT_MS } from '../src/services/luciHttp.js'

const sid = '0123456789abcdef0123456789abcdef'
test('LuCI cookie from a real login works with both HTTP and HTTPS headers', () => {
  assert.equal(extractLuciCookie({ 'set-cookie': 'sysauth_https=' + sid + '; path=/cgi-bin/luci/; HttpOnly' }), 'sysauth_https=' + sid)
  assert.equal(extractLuciCookie({ 'Set-Cookie': ['other=123; path=/', 'sysauth_http=' + sid + '; path=/cgi-bin/luci/'] }), 'sysauth_http=' + sid)
  assert.equal(extractLuciCookie({ 'Set-Cookie': 'other=1, sysauth_http=' + sid + '; HttpOnly' }), 'sysauth_http=' + sid)
})
test('never forward arbitrary cookies or malformed sessions as LuCI authentication', () => {
  assert.equal(extractLuciCookie({ 'Set-Cookie': 'sessionid=secret; path=/' }), '')
  assert.equal(extractLuciCookie({ 'Set-Cookie': 'sysauth_http=untrusted' }), '')
  assert.equal(extractLuciCookie({ 'Content-Type': 'application/json' }), '')
})
test('distinguish LuCI auth, missing endpoints and server errors', () => {
  const endpoint = '/cgi-bin/luci/admin/services/shadowsocksr/geo_status'
  assert.match(describeLuciHttpFailure(302, endpoint), /重定向/)
  assert.match(describeLuciHttpFailure(403, endpoint), /登录|权限/)
  assert.match(describeLuciHttpFailure(404, endpoint), /geo_status/)
  assert.match(describeLuciHttpFailure(500, endpoint), /内部错误/)
})


test('SSR install has a separate long timeout while queries stay fast', () => {
  const root = '/cgi-bin/luci/admin/services/shadowsocksr/'
  for (const operation of ['geo_upgrade', 'component_upgrade']) {
    assert.equal(isSsrUpgradeEndpoint(root + operation), true)
    assert.equal(ssrLuciReadTimeout(root + operation), 600000)
  }
  for (const operation of ['geo_status', 'component_status', 'geo_local_status', 'ping', 'run']) {
    assert.equal(isSsrUpgradeEndpoint(root + operation), false)
    assert.equal(ssrLuciReadTimeout(root + operation), 20000)
  }
  assert.equal(SSR_LUCI_UPGRADE_TIMEOUT_MS, 10 * 60 * 1000)
})

test('only exact SSR upgrade path may use the long timeout', () => {
  for (const path of [
    '/cgi-bin/luci/admin/services/shadowsocksr/geo_upgrade/extra',
    '/cgi-bin/luci/admin/services/openclash/geo_upgrade',
    '/cgi-bin/luci/admin/services/shadowsocksr/geo_upgrade_bypass'
  ]) assert.equal(isSsrUpgradeEndpoint(path), false)
})
