import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const rootLicense = readFileSync(new URL('../../../LICENSE', import.meta.url), 'utf8')
const appLicense = readFileSync(new URL('../src/data/LICENSE-MIT.txt', import.meta.url), 'utf8')
const thirdParty = readFileSync(new URL('../../../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8')
const packageInfo = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('in-app MIT license exactly matches repository license', () => {
  assert.equal(appLicense, rootLicense)
  assert.match(rootLicense, /Copyright \(c\) 2026 lmdbot/)
  assert.match(rootLicense, /THE SOFTWARE IS PROVIDED "AS IS"/)
})

test('third-party notice covers declared direct dependencies', () => {
  for (const pkg of [...Object.keys(packageInfo.dependencies), ...Object.keys(packageInfo.devDependencies)]) {
    assert.ok(thirdParty.includes('`' + pkg + '`'), 'Missing notice for ' + pkg)
  }
  assert.match(thirdParty, /vendor\/base\.apk/)
  assert.match(thirdParty, /carbon-brands\.js|Carbon 品牌识别数据/)
})
