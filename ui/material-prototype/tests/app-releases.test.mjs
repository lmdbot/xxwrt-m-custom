import test from 'node:test'
import assert from 'node:assert/strict'
import { compareAppVersions as cmp, parseAppVersion, selectLatestStableRelease } from '../src/services/appReleases.js'
test('numeric segments, including 3 versus 21, do not use string sorting', () => {
  for (const [a,b,want] of [
    ['2.21.0','2.3.99',1],['21.0.0','3.99.99',1],['3.0.0','21.0.0',-1],
    ['1.2.10','1.2.3',1],['1.10.0','1.9.99',1],['v2.0.0','2.0',0],
    ['2.0.1','2.0.1',0],['2.0.0','2.0.1',-1],
    ['9007199254740993.0.0','9007199254740992.9.9',1]
  ]) assert.equal(cmp(a,b),want)
})
test('invalid and prerelease tags are not numeric stable versions', () => {
  for (const s of ['material-wrt-v2.0.1','v2.0.1-rc.1','2.0.0-beta','latest','2.a.1',''])
    assert.equal(parseAppVersion(s),null)
  assert.throws(()=>cmp('bad','2.0.0'),TypeError)
})
function release(tag, flags={}) {
  const name=(flags.legacy?'XX-WRT-M-custom-':flags.oldMaterial?'XX-WRT-M-Material-QWRT-':'XX-WRT-Material-')+tag+'.apk'
  return {tag_name:tag,draft:!!flags.draft,prerelease:!!flags.prerelease,
    assets:flags.empty?[]:[{name,state:'uploaded',size:123,
      browser_download_url:'https://github.com/lmdbot/xxwrt-m-custom/releases/download/'+tag+'/'+name}]}
}
test('highest numeric official release is chosen irrespective of GitHub chronology', () => {
  const r=selectLatestStableRelease([
    release('v3.0.0',{prerelease:true}), release('material-wrt-v99.0.0'),
    release('v2.3.0'),release('v2.21.0'),release('v21.0.0',{draft:true}),release('v2.9.0')
  ])
  assert.equal(r.version,'2.21.0')
  assert.equal(r.apkName,'XX-WRT-Material-v2.21.0.apk')
})
test('newer release without a Material APK is reported without substituting an older APK', () => {
  const r=selectLatestStableRelease([release('v3.0.0',{legacy:true}),release('v2.9.0')])
  assert.equal(r.version,'3.0.0'); assert.equal(r.apkUrl,'')
})
test('unsafe download URL is rejected', () => {
  const r=release('v99.0.0');r.assets[0].browser_download_url='https://example.com/bad.apk'
  assert.equal(selectLatestStableRelease([r]).apkUrl,'')
  assert.equal(selectLatestStableRelease([]),null)
})

test('new APK name wins over old migration alias, while both are valid', () => {
  const current = release('v2.0.2')
  const former = release('v2.0.2', { oldMaterial: true })
  current.assets.unshift(former.assets[0])
  const selected = selectLatestStableRelease([current])
  assert.equal(selected.apkName, 'XX-WRT-Material-v2.0.2.apk')
  assert.equal(
    selectLatestStableRelease([release('v2.0.1', {oldMaterial: true})]).apkName,
    'XX-WRT-M-Material-QWRT-v2.0.1.apk'
  )
})
