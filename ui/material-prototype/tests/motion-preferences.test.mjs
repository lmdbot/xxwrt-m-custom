import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTION_PREFERENCE_KEY,readMotionPreference,motionAllowed,
  motionScrollBehavior,isCurrentTabRoot
} from '../src/services/motionPreferences.js'

test('motion defaults enabled and persists the explicit off switch',()=>{
  const values=new Map()
  const storage={
    getItem:key=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,value)
  }
  assert.equal(readMotionPreference(storage),true)
  storage.setItem(MOTION_PREFERENCE_KEY,'false')
  assert.equal(readMotionPreference(storage),false)
  storage.setItem(MOTION_PREFERENCE_KEY,'true')
  assert.equal(readMotionPreference(storage),true)
  assert.equal(readMotionPreference({getItem:()=>{throw new Error('blocked')}}),true)
})
test('OS reduced-motion always overrides user setting',()=>{
  assert.equal(motionAllowed(true,false),true)
  assert.equal(motionAllowed(false,false),false)
  assert.equal(motionAllowed(true,true),false)
  assert.equal(motionAllowed(false,true),false)
  assert.equal(motionScrollBehavior(true),'smooth')
  assert.equal(motionScrollBehavior(false),'auto')
})
test('all five active root tabs allow scroll-to-top; subpages first return to hub',()=>{
  for(const tab of ['home','statistics','clients','network','apps']){
    assert.equal(isCurrentTabRoot(tab,tab,'',true,false),true)
    assert.equal(isCurrentTabRoot(tab,'another','',true,false),false)
    assert.equal(isCurrentTabRoot(tab,tab,'',false,false),false)
    assert.equal(isCurrentTabRoot(tab,tab,'',true,true),false)
  }
  assert.equal(isCurrentTabRoot('apps','apps','logs',true,false),false)
  assert.equal(isCurrentTabRoot('apps','apps','',true,false),true)
})
