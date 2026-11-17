import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_ICON_CHOICE_KEY, APP_ICON_CUSTOM_KEY, APP_ICON_PRESETS, DEFAULT_APP_ICON,
  loadAppIconChoice, loadCustomAppIcon, saveAppIconChoice, storeCustomAppIcon,
  resetAppIconPreferences, isCustomPng
} from '../src/services/appIconPreferences.js'

function storage() {
  const items=new Map()
  return {
    getItem:key=>items.get(key)??null,
    setItem:(key,val)=>items.set(key,String(val)),
    removeItem:key=>items.delete(key)
  }
}
const smallPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/zd0AAAAASUVORK5CYII='

test('built-in icon choices include the original anime and old archive styles',()=>{
  assert.deepEqual(APP_ICON_PRESETS.map(x=>x.id),['anime','classic','openwrt'])
  assert.equal(DEFAULT_APP_ICON,'anime')
})
test('selection persists, malformed inputs fall back safely',()=>{
  const s=storage()
  assert.equal(loadAppIconChoice(s),'anime')
  assert.equal(saveAppIconChoice(s,'classic'),true)
  assert.equal(loadAppIconChoice(s),'classic')
  assert.equal(saveAppIconChoice(s,'invalid'),false)
  assert.equal(loadAppIconChoice(s),'classic')
})
test('custom PNG icon is validated, persists and can be reset',()=>{
  const s=storage()
  assert.equal(saveAppIconChoice(s,'custom'),false)
  assert.equal(isCustomPng('data:image/svg+xml;base64,AAAA'),false)
  assert.equal(isCustomPng(smallPng),true)
  assert.equal(storeCustomAppIcon(s,smallPng),true)
  assert.equal(saveAppIconChoice(s,'custom'),true)
  assert.equal(loadCustomAppIcon(s),smallPng)
  assert.equal(loadAppIconChoice(s),'custom')
  assert.equal(resetAppIconPreferences(s),true)
  assert.equal(loadAppIconChoice(s),'anime')
  assert.equal(s.getItem(APP_ICON_CHOICE_KEY),null)
  assert.equal(s.getItem(APP_ICON_CUSTOM_KEY),null)
})
test('selection stored without custom artwork is not offered as applied',()=>{
  const s=storage()
  s.setItem(APP_ICON_CHOICE_KEY,'custom')
  assert.equal(loadAppIconChoice(s),'anime')
})
