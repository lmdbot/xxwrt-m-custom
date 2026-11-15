import test from 'node:test'
import assert from 'node:assert/strict'
import { extractLuciCookie, describeLuciHttpFailure } from '../src/services/luciHttp.js'

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
