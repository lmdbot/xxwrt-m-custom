import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PACKAGE_CALL, PACKAGE_PAGE_SIZE, MAX_UPLOAD_BYTES, PACKAGE_CONFIGS,
  parsePackageList, comparePackageVersions, packageCollections,
  visiblePackages, validatePackageTarget, runPackageAction, readPackageListing,
  readPackageConfigs, savePackageConfig, uploadLocalPackage,
  deleteUploadedPackage
} from '../src/services/softwarePackages.js'

const INSTALLED = [
  'Package: busybox', 'Version: 1.35.0-1', 'Status: install ok installed',
  'Description: Essential system tools', 'Installed-Size: 211456', '',
  'Package: luci-app-test', 'Version: 1.2-1',
  'Status: install ok installed', 'Description: Demo',
  ' continued description', ''
].join('\n')
const AVAILABLE = [
  'Package: busybox', 'Version: 1.35.0-2', 'Size: 12345', '',
  'Package: luci-app-test', 'Version: 1.2-1', '',
  'Package: luci-app-demo', 'Version: 2.0-1', 'Size: 10240',
  'Description: Demo package for QWRT', '',
  'Package: luci-i18n-test-ru', 'Version: 1', '',
  'Package: luci-i18n-test-zh-cn', 'Version: 1', ''
].join('\n')

test('opkg control paragraphs include wrapped descriptions, sizes and status', () => {
  const pkgs = parsePackageList(INSTALLED, true)
  assert.equal(pkgs.length, 2)
  assert.equal(pkgs[0].name, 'busybox')
  assert.equal(pkgs[0].size, 211456)
  assert.equal(pkgs[0].installed, true)
  assert.equal(pkgs[1].description, 'Demo\ncontinued description')
})

test('apk JSON package list is recognized and malformed JSON rejected', () => {
  const pkgs = parsePackageList(JSON.stringify([
    { name: 'luci', version: '25.12-r0', size: 765, description: 'LuCI' }
  ]), true)
  assert.equal(pkgs[0].name, 'luci')
  assert.equal(pkgs[0].installed, true)
  assert.equal(pkgs[0].size, 765)
  assert.throws(() => parsePackageList('[bad json'), /不完整/)
})

test('version comparisons sort numeric segments, epoch, revision and pre-release', () => {
  assert.equal(comparePackageVersions('1.10-1', '1.9-99'), 1)
  assert.equal(comparePackageVersions('2:1.0', '1:9.9'), 1)
  assert.equal(comparePackageVersions('1.0~rc1', '1.0'), -1)
  assert.equal(comparePackageVersions('1.0-r2', '1.0-r1'), 1)
  assert.equal(comparePackageVersions('1.0', '1.0'), 0)
})

test('available, installed and upgrade lists do not invent upgrades', () => {
  const collection = packageCollections(parsePackageList(AVAILABLE), parsePackageList(INSTALLED, true))
  assert.deepEqual(collection.installed.map(x => x.name), ['busybox', 'luci-app-test'])
  assert.deepEqual(collection.updates.map(x => x.name), ['busybox'])
  assert.equal(collection.updates[0].currentVersion, '1.35.0-1')
  assert.equal(collection.available.find(x => x.name === 'luci-app-test').installed, true)
})

test('language package filtering follows screenshot modes', () => {
  const items = packageCollections(parsePackageList(AVAILABLE), []).available
  assert.equal(visiblePackages(items, '', 'filtered').some(x => x.name.endsWith('-ru')), false)
  assert.equal(visiblePackages(items, '', 'all').some(x => x.name.endsWith('-ru')), true)
  assert.equal(visiblePackages(items, '', 'none').some(x => x.name.includes('luci-i18n')), false)
  assert.equal(visiblePackages(items, 'demo', 'all').length, 1)
  assert.equal(PACKAGE_PAGE_SIZE, 100)
})

test('package install targets reject commands, shell fragments and insecure URLs', () => {
  assert.equal(validatePackageTarget('luci-app-firewall'), 'luci-app-firewall')
  assert.equal(validatePackageTarget('https://example.com/qwrt.ipk', { allowUrl: true }),
    'https://example.com/qwrt.ipk')
  for (const input of ['-f', 'pkg;reboot', '$(touch /tmp/evil)', 'pkg other', 'http://a/b.ipk',
    'https://user:secret@example.com/b.ipk']) {
    assert.throws(() => validatePackageTarget(input, { allowUrl: true }))
  }
  assert.throws(() => validatePackageTarget('https://example.com/a.apk', { allowUrl: true, manager: 'apk' }))
  assert.equal(validatePackageTarget('/tmp/upload.ipk'), '/tmp/upload.ipk')
})

test('only supported commands reach the fixed package-manager executable', async () => {
  const calls = []
  const client = { callTimed: async (...args) => {
    calls.push(args)
    return { code: 0, stdout: '{"code":0,"stdout":"Installed"}' }
  }}
  const result = await runPackageAction(client, 'install', ['luci-app-xyz'])
  assert.equal(result.stdout, 'Installed')
  assert.equal(calls[0][0], 'file')
  assert.equal(calls[0][2].command, PACKAGE_CALL)
  assert.deepEqual(calls[0][2].params, ['install', 'luci-app-xyz'])
  await assert.rejects(() => runPackageAction(client, 'exec', ['reboot']))
  await assert.rejects(() => runPackageAction(client, 'remove', ['-r']))
  assert.equal(calls.length, 1)
})

test('nonzero package-manager exit codes and malformed results never report success', async () => {
  const client = { callTimed: async () => ({
    code: 0, stdout: '{"code":1,"stderr":"packages not found"}'
  }) }
  await assert.rejects(() => runPackageAction(client, 'install', ['badpkg']), /packages not found/)
  const broken = { callTimed: async () => ({ code: 0, stdout: 'non JSON' }) }
  await assert.rejects(() => runPackageAction(broken, 'update'), /未返回合法执行结果/)
})

test('all changes to repository files are restricted to known configuration paths', async () => {
  const saved = []
  const client = { call: async (_obj, method, values) => {
    if (method === 'read') return { data: 'src/gz openwrt https://example.com/feed\n' }
    if (method === 'list') return { entries: [] }
    saved.push(values)
    return {}
  }}
  const files = await readPackageConfigs(client, 'opkg')
  assert.equal(files.length, 3)
  await savePackageConfig(client, 'opkg', PACKAGE_CONFIGS.opkg[0], 'option check_signature 1')
  assert.equal(saved.length, 1)
  await assert.rejects(() => savePackageConfig(client, 'opkg', '/etc/passwd', 'bad'))
})

test('local IPK is uploaded in base64 RPC chunks with append, and cleaned on error', async () => {
  const records = []
  const bytes = new Uint8Array(110 * 1024).map((_, n) => n % 256)
  const fake = {
    name: 'test.ipk', size: bytes.length,
    slice(from, to) { return new Blob([bytes.slice(from, to)]) }
  }
  const client = { call: async (_obj, method, values) => {
    records.push({ method, ...values })
    return {}
  }}
  const progress = []
  const path = await uploadLocalPackage(client, fake, 'opkg', n => progress.push(n))
  assert.equal(path, '/tmp/upload.ipk')
  assert.equal(progress.at(-1), 100)
  const chunks = records.filter(x => x.method === 'write')
  assert.equal(chunks.length, 2)
  assert.equal(chunks[0].append, false)
  assert.equal(chunks[1].append, true)
  assert.equal(chunks[0].base64, true)
  const reconstructed = Buffer.concat(chunks.map(x => Buffer.from(x.data, 'base64')))
  assert.deepEqual(reconstructed, Buffer.from(bytes))
  await deleteUploadedPackage(client, 'opkg')
  assert.equal(records.at(-1).path, '/tmp/upload.ipk')
  await assert.rejects(() => uploadLocalPackage(client, { name: 'evil.sh', size: 2 }, 'opkg'))
  await assert.rejects(() => uploadLocalPackage(client,
    { name: 'huge.ipk', size: MAX_UPLOAD_BYTES + 1 }, 'opkg'))
})

test('LuCI streaming CGI is preferred for large lists; falls back to ubus on failure', async () => {
  let direct = 0, fallback = 0
  const client = {
    async cgiPackageList() { direct++; return INSTALLED },
    async callTimed() { fallback++; return { code: 0, stdout: INSTALLED } }
  }
  const directResult = await readPackageListing(client, 'list-installed')
  assert.equal(directResult.source, 'cgi-io')
  assert.equal(direct, 1)
  assert.equal(fallback, 0)
  client.cgiPackageList = async () => { throw Error('cgi not available') }
  const fallbackResult = await readPackageListing(client, 'list-installed')
  assert.equal(fallbackResult.source, 'ubus')
  assert.equal(fallback, 1)
  await assert.rejects(() => readPackageListing(client, 'install'))
})

test('apk-tools official file-size property is retained', () => {
  const items = parsePackageList(JSON.stringify([
    { name: 'curl', version: '8.1-r0', 'file-size': 7890, 'installed-size': 15000 }
  ]))
  assert.equal(items[0].size, 7890)
})
