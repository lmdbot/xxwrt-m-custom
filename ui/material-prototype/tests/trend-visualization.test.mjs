import test from 'node:test'
import assert from 'node:assert/strict'
import {buildTrendChart} from '../src/services/trendVisualization.js'

test('sparse real samples fill the available chart width without fabricating history',()=>{
  const now=1700000000000
  const chart=buildTrendChart([
    {time:now-1800000,value:12},
    {time:now-1200000,value:20},
    {time:now-600000,value:18}
  ],'cpu','h24')
  assert.equal(chart.points.length,3)
  assert.equal(chart.points[0].x,42)
  assert.equal(chart.points.at(-1).x,345)
  assert.equal(chart.minimum,12)
  assert.equal(chart.maximum,20)
  assert.equal(chart.average,50/3)
  assert.equal(chart.paths.length,1)
  assert.equal(chart.areaPaths.length,1)
  assert.equal(chart.firstTime,now-1800000)
  assert.equal(chart.lastTime,now-600000)
})
test('constant 0 percent measurements render in the middle, not at a tiny baseline',()=>{
  const now=1700000000000
  const chart=buildTrendChart([
    {time:now,value:0},{time:now+300000,value:0}
  ],'cpu','h24')
  assert.equal(chart.flat,true)
  assert.equal(chart.minimum,0)
  assert.equal(chart.maximum,0)
  assert.ok(chart.points.every(p=>p.y>70&&p.y<130))
  assert.equal(chart.paths.length,1)
  assert.equal(buildTrendChart([{time:now,value:0}]).points.length,1)
  assert.equal(buildTrendChart([{time:now,value:0}]).points[0].x,(42+345)/2)
})
test('hours without sampling are never joined into a continuous 24 hour curve',()=>{
  const now=1700000000000
  const chart=buildTrendChart([
    {time:now,value:12},{time:now+300000,value:15},
    {time:now+5*3600000,value:17},{time:now+5*3600000+300000,value:21}
  ],'cpu','h24')
  assert.equal(chart.gaps,1)
  assert.equal(chart.paths.length,2)
  assert.equal(chart.points.length,4)
})
test('empty, invalid and out-of-order samples are safe',()=>{
  const empty=buildTrendChart([{time:NaN,value:null}])
  assert.equal(empty.points.length,0)
  const now=1700000000000
  const chart=buildTrendChart([
    {time:now+300000,value:3.4},{time:now,value:2.2}
  ],'load1','h24')
  assert.equal(chart.firstTime,now)
  assert.equal(chart.maximum,3.4)
  assert.equal(chart.average,2.8)
})
