import test from 'node:test'
import assert from 'node:assert/strict'
import { TAB_ORDER, MOTION_DURATIONS, MOTION_EASING,
  describeNavigationMotion, keyframesForMotion, playInterfaceMotion
} from '../src/services/motionEngine.js'

const route = (tab='home', tool='', mode='detail', settings=false, category='display', device='router-1') =>
  [tab,tool,mode,settings,category,device]

test('five root tabs animate in destination direction; no motion for same route',()=>{
  assert.deepEqual(TAB_ORDER,['home','statistics','clients','network','apps'])
  assert.deepEqual(describeNavigationMotion(route('home'),route('network')),
    {kind:'navigation',direction:1})
  assert.deepEqual(describeNavigationMotion(route('apps'),route('statistics')),
    {kind:'navigation',direction:-1})
  assert.equal(describeNavigationMotion(route('apps'),route('apps')),null)
})
test('settings, device list/detail and app drill-down give directional feedback',()=>{
  assert.equal(describeNavigationMotion(route('home'),route('home','','detail',true)).direction,1)
  assert.equal(describeNavigationMotion(route('home','','detail',true),route('home')).direction,-1)
  assert.equal(describeNavigationMotion(route('home','','list'),route('home')).direction,1)
  assert.equal(describeNavigationMotion(route('home'),route('home','','', 'display','router-2')).direction,1)
  assert.equal(describeNavigationMotion(route('apps'),route('apps','logs')).direction,1)
  assert.equal(describeNavigationMotion(route('apps','logs'),route('apps')).direction,-1)
  assert.equal(describeNavigationMotion(null,route('home')),null)
})
test('animations are brief, interruptible and fully disabled by preference',()=>{
  assert.ok(MOTION_DURATIONS.navigation >= MOTION_DURATIONS.section)
  assert.ok(MOTION_DURATIONS.navigation <= 300)
  assert.ok(MOTION_EASING.startsWith('cubic-bezier'))
  assert.ok(keyframesForMotion('navigation',-1)[0].transform.includes('-17px'))
  assert.ok(keyframesForMotion('section')[0].transform.includes('10px'))
  let calls=0,options=null,frames=null
  const fake={animate:(key,opts)=>{calls++;frames=key;options=opts;return {cancel:()=>{}}}}
  assert.equal(playInterfaceMotion(fake,{kind:'navigation',direction:1},false),null)
  assert.equal(calls,0)
  assert.ok(playInterfaceMotion(fake,{kind:'navigation',direction:1},true))
  assert.equal(calls,1)
  assert.equal(frames.at(-1).opacity,1)
  assert.equal(options.duration,MOTION_DURATIONS.navigation)
  assert.equal(options.fill,'none')
  assert.equal(playInterfaceMotion(null,{kind:'navigation',direction:1},true),null)
  assert.equal(playInterfaceMotion(fake,null,true),null)
})
