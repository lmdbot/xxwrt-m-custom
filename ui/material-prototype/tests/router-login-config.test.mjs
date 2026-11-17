import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRouterAlternates, newDevice, saveDevices, loadDevices } from '../src/services/devices.js'
import {
  LAB_ROUTES_KEY, loadPairedRoutes, savePairedRoutes, loadPairedRoute,
  resetAllLabPreferences
} from '../src/services/labFeatures.js'

test('router IP/domain input is normalized, deduplicated and bounded',()=>{
  assert.deepEqual(normalizeRouterAlternates('http://192.168.100.1',[
    '192.168.100.2', 'https://router.example.com','router.example.com','http://192.168.100.1'
  ]),['http://192.168.100.2','https://router.example.com'])
  assert.throws(()=>normalizeRouterAlternates('http://192.168.100.1',
    ['http://example.com']),/HTTPS/)
  assert.throws(()=>normalizeRouterAlternates('http://192.168.100.1',
    ['http://8.8.8.8']),/HTTPS/)
  assert.throws(()=>normalizeRouterAlternates('http://192.168.100.1',
    ['https://root:secret@example.com']),/账号密码/)
  assert.throws(()=>normalizeRouterAlternates('http://192.168.100.1',
    Array.from({length:6},(_,i)=>'192.168.100.'+(i+2))),/最多/)
  assert.throws(()=>normalizeRouterAlternates('http://192.168.100.1',
    ['https://router.example.com/ubus']),/路径/)
})

test('router profile persists routes and switch preference but never plaintext password',()=>{
  const local = globalThis.localStorage
  const data = new Map()
  globalThis.localStorage = {
    getItem:key=>data.get(key)||null,
    setItem:(key,value)=>data.set(key,String(value)),
    removeItem:key=>data.delete(key)
  }
  try {
    const device=newDevice({
      name:'主路由',address:'https://router.example.com',
      username:'root',password:'must-not-be-serialized',
      ignoreTlsErrors:true,alternateAddresses:['192.168.100.1'],
      autoSwitch:true
    })
    const saved=saveDevices([device])
    assert.equal(saved[0].ignoreTlsErrors,true)
    assert.equal(saved[0].autoSwitch,true)
    assert.deepEqual(saved[0].alternateAddresses,['http://192.168.100.1'])
    assert.equal(JSON.stringify(data.get('xxwrt_material_saved_devices_v1')).includes('must-not-be-serialized'),false)
    assert.equal(loadDevices()[0].autoSwitch,true)
    assert.deepEqual(loadDevices()[0].alternateAddresses,saved[0].alternateAddresses)
  } finally {globalThis.localStorage=local}
})

test('legacy laboratory single pairing migrates to a verified route list',()=>{
  const map=new Map()
  const memory={
    getItem:key=>map.get(key)||null,
    setItem:(key,v)=>map.set(key,String(v)),
    removeItem:key=>map.delete(key)
  }
  const identity={marker:'mac:aa:bb:cc:dd:ee:ff',model:'x86',target:'x86/64'}
  map.set(LAB_ROUTES_KEY,JSON.stringify({router1:{address:'https://router.example.com',identity}}))
  assert.equal(loadPairedRoutes(memory,'router1').length,1)
  assert.equal(loadPairedRoute(memory,'router1').address,'https://router.example.com')
  assert.equal(savePairedRoutes(memory,'router1',[
    {address:'http://192.168.100.1',identity},
    {address:'https://router.example.com',identity}
  ]),true)
  assert.equal(loadPairedRoutes(memory,'router1').length,2)
  assert.equal(resetAllLabPreferences(memory),true)
  assert.equal(loadPairedRoutes(memory,'router1').length,2)
})
