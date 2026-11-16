import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseOpkgList, parseOpkgStatus, parseUpgradable, parsePackageInfo, filterPackageList, validatePackageName,
  validateOpkgUrl, validateConfigPath, validateFeedConfig,
  runPackageAction, readPackageList
} from '../src/services/packageManager.js'

test('parse package descriptions containing delimiters', () => {
  assert.deepEqual(parseOpkgList('luci-app-test - 1.2 - a - b\nopkg - 2.0\n'), [
    { name: 'luci-app-test', version: '1.2', description: 'a - b' },
    { name: 'opkg', version: '2.0', description: '' }
  ])
})
test('parse installed package status', () => {
  const data = 'Package: luci\nVersion: 1.0\nStatus: install user installed\nDescription: Web UI\n more info\n\nPackage: unused\nVersion: 1\nStatus: deinstall user config-files\n'
  assert.deepEqual(parseOpkgStatus(data), [
    { name: 'luci', version: '1.0', description: 'Web UI more info', status: 'install user installed', size: 0, architecture: '' }
  ])
})
test('filter and paginate safely', () => {
  const rows = Array.from({ length: 105 }, (_, i) => ({ name: 'pkg' + i, version: '1' }))
  assert.equal(filterPackageList(rows, 'pkg', 2).items.length, 5)
  assert.equal(filterPackageList(rows, 'pkg1', 1).total, 16)
  assert.equal(filterPackageList(rows, '', 999).page, 2)
})
test('reject command injection in package names', () => {
  for (const value of ['bad;rm -rf /', 'a b', '--force', '', 'a\n']) {
    assert.throws(() => validatePackageName(value))
  }
  assert.equal(validatePackageName('luci-i18n-base-zh-cn'), 'luci-i18n-base-zh-cn')
})
test('only accept HTTPS .ipk URLs', () => {
  assert.equal(validateOpkgUrl('https://example.com/p.ipk'), 'https://example.com/p.ipk')
  for (const url of ['http://example.com/p.ipk', 'https://example.com/x.zip', 'file:///tmp/a.ipk', 'https://user:pw@example.com/a.ipk'])
    assert.throws(() => validateOpkgUrl(url))
})
test('restrict config writes and directives', () => {
  assert.equal(validateConfigPath('/etc/opkg.conf'), '/etc/opkg.conf')
  assert.throws(() => validateConfigPath('/etc/passwd'))
  assert.equal(validateFeedConfig('src/gz core https://example.com/feed\noption check_signature 1\n'), 'src/gz core https://example.com/feed\noption check_signature 1\n')
  assert.throws(() => validateFeedConfig('$(rm -rf /)'))
})
test('opkg actions pass an argv array, never a shell command', async () => {
  const calls = []
  const client = { callLong: async (obj, method, args) => {
    calls.push([obj, method, args]); return { code: 0, stdout: 'ok' }
  }}
  assert.equal(await runPackageAction(client, 'install', 'luci-app-test'), 'ok')
  assert.deepEqual(calls[0], ['file', 'exec', { command: '/bin/opkg', params: ['install', 'luci-app-test'], env: null }])
  await assert.rejects(runPackageAction(client, 'remove', 'x;reboot'))
  assert.equal(await runPackageAction(client, 'update'), 'ok')
  assert.deepEqual(calls[1][2].params, ['update'])
})
test('available list parses opkg output', async () => {
  const client = { callLong: async () => ({ code: 0, stdout: 'a - 1 - test' }) }
  assert.equal((await readPackageList(client, 'available'))[0].name, 'a')
})

test('upgradable packages show old and new version', () => {
  assert.deepEqual(parseUpgradable('luci - 1.0 - 1.1\n'), [
    { name: 'luci', installedVersion: '1.0', version: '1.1', description: '' }
  ])
})
test('opkg info extracts download size and dependencies', () => {
  assert.deepEqual(parsePackageInfo('Package: luci\nVersion: 1.2\nSize: 1234\nDepends: libc\n'), {
    Package: 'luci', Version: '1.2', Size: '1234', Depends: 'libc'
  })
})
