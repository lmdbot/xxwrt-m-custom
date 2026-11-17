import test from 'node:test'
import assert from 'node:assert/strict'
import { getDownloadDisplay, formatDownloadMb } from '../src/services/downloadDisplay.js'

test('native download displays actual percent and downloaded/total bytes', () => {
  const result = getDownloadDisplay({
    downloading:true, percent:43, receivedBytes:13*1024*1024,
    totalBytes:30*1024*1024
  })
  assert.deepEqual(result,{
    stage:'downloading', percent:43, sizeText:'13.0 MB / 30.0 MB'
  })
  assert.equal(formatDownloadMb(0),'0 MB')
})
test('unknown total never fabricates percent or total size',()=>{
  const result=getDownloadDisplay({downloading:true,percent:-1,receivedBytes:2*1024*1024,totalBytes:0})
  assert.deepEqual(result,{stage:'downloading',percent:null,sizeText:'已下载 2.0 MB'})
  assert.equal(getDownloadDisplay({downloading:true,percent:-1,totalBytes:0}).sizeText,'正在连接下载源…')
})
test('100 percent while plugin is active means verifying or preparing, not installed',()=>{
  const verifying=getDownloadDisplay({downloading:true,percent:100,receivedBytes:100,totalBytes:100})
  assert.equal(verifying.stage,'preparing')
  assert.equal(getDownloadDisplay({downloading:false,downloadedApkReady:true,percent:100}).stage,'ready')
})
test('cancel, failure and idle state remain distinct',()=>{
  assert.equal(getDownloadDisplay({outcome:'failed'}).stage,'failed')
  assert.equal(getDownloadDisplay({outcome:'cancelled'}).stage,'cancelled')
  assert.equal(getDownloadDisplay({outcome:'idle'}).stage,'idle')
})
test('backend percentages and totals remain bounded',()=>{
  assert.equal(getDownloadDisplay({downloading:true,totalBytes:10,percent:200}).percent,100)
  assert.equal(getDownloadDisplay({downloading:true,totalBytes:10,percent:-1,receivedBytes:5}).percent,50)
  assert.equal(getDownloadDisplay({downloading:true,totalBytes:10,percent:0,receivedBytes:0}).percent,0)
})
