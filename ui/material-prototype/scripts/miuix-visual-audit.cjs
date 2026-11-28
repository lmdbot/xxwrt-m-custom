// Screenshot-only diagnostic, reused by the existing mock RPC smoke test.
const fs = require('node:fs')
const path = require('node:path')
const { devices } = require('@playwright/test')
const ids = 'favorite-editor-open version-details-dialog privacy-dialog selected-client hqos-global-dialog hqos-global-confirm qos-write-confirm device-dialog xiaomi-dialog login-dialog delete-dialog wol-delete-dialog factory-dialog confirm-reboot release-notes-dialog update-dialog cron-editing queued reset-confirmation visible editor-open runtime-target action-dialog output-dialog config-dialog config-save-confirm ssr-component-dialog carbon-upgrade-dialog zt-delete-dialog fw-rule-confirm fw-delete-dialog record-delete service-confirm'.split(' ')
const tools = ['Lucky','Vlmcsd KMS','ShadowSocksR Plus+','微信推送','OpenClash','Internet Detector','Carbon 主题设置','ZeroTier','防火墙','进程','启动项','路由表','网络唤醒','家长控制','软件包','服务管理','系统定时任务','网络诊断','日志中心','安全分析','操作记录','系统能力识别','配置备份恢复','DNS / DHCP','DDNS 管理']
const folder=path.resolve('dist/miuix-audit')
async function captureMiuix(page, handler, openApplication) {
  fs.mkdirSync(folder,{recursive:true})
  const manifest={fixture:'mock RPC',modes:[]}
  for(const mode of ['light','dark']){
    const ctx=await page.context().browser().newContext({...devices['Pixel 7'],baseURL:'http://127.0.0.1:5173',reducedMotion:'reduce',viewport:{width:393,height:852}})
    const p=await ctx.newPage()
    p.setDefaultTimeout(2500)
    const r={mode,screens:[],missed:[],dialogs:[],errors:[]}
    manifest.modes.push(r)
    p.on('pageerror',e=>r.errors.push(e.message))
    await p.route('**/cgi-bin/**',q=>q.fulfill({status:403,body:'Mock-only audit'}))
    await p.route('**/ubus',handler)
    const click=name=>p.getByRole('button',{name,exact:true}).first().click()
    const modal=()=>p.locator('.v-dialog.v-overlay--active').last()
    const snap=async name=>{
      await p.waitForTimeout(150)
      const classes=await p.locator('.v-dialog.v-overlay--active').evaluateAll(els=>els.flatMap(e=>Array.from(e.classList)))
      const found=ids.filter(id=>classes.includes('mx-dialog-'+id))
      r.dialogs=[...new Set([...r.dialogs,...found])]
      const file=mode+'-'+name+'.png'
      await p.screenshot({path:path.join(folder,file),animations:'disabled'})
      r.screens.push({file,dialogs:found,layout:await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,style:document.documentElement.dataset.xxwrtStyle,color:document.documentElement.dataset.xxwrtColor}))})
    }
    const step=async(name,fn)=>{try{await fn();await snap(name)}catch(e){r.missed.push({name,error:String(e.message).split('\n')[0]})}}
    const close=async()=>{
      const d=modal()
      if(!await d.count())return
      for(const name of ['取消','关闭','完成','暂不更新','返回列表','关闭路由器配置','返回终端列表','关闭开源许可证']){
        const b=d.getByRole('button',{name,exact:true}).first()
        if(await b.isVisible()&&await b.isEnabled()){await b.click();return}
      }
      await p.keyboard.press('Escape')
    }
    const dialog=async(name,open)=>{
      await step(name,async()=>{await open();await modal().waitFor({state:'visible'})})
      await close().catch(e=>r.missed.push({name:name+'-close',error:e.message}))
    }
    try{
      await p.goto('/')
      await click('我的')
      await p.locator('.more-page .more-menu-item').filter({hasText:'显示与外观'}).click()
      await click('Miuix')
      await click(mode==='dark'?'深色主题':'浅色主题')
      await p.waitForFunction(m=>document.documentElement.dataset.xxwrtStyle==='miuix'&&document.documentElement.dataset.xxwrtColor===m,mode)
      await snap('settings-display')
      await p.reload()
      await p.waitForFunction(m=>document.documentElement.dataset.xxwrtStyle==='miuix'&&document.documentElement.dataset.xxwrtColor===m,mode)
      await click('概览')
      await snap('router-list-empty')
      await click('添加')
      await snap('router-editor-step1')
      await p.getByRole('textbox',{name:'设备名称'}).fill('QWRT')
      await p.getByRole('textbox',{name:'主地址'}).fill('http://192.168.100.1')
      await click('继续')
      await snap('router-editor-step2')
      await click('保存设备')
      await snap('router-list')
      await dialog('delete-router',()=>click('删除QWRT'))
      await click('进入 QWRT')
      await p.getByRole('textbox',{name:'路由器密码'}).fill('mock-only')
      await snap('login')
      await click('登录并进入')
      await p.locator('.v3-health-card').waitFor({state:'visible',timeout:15000})
      await snap('overview')
      await step('overview-details',()=>click('展开系统与硬件详情'))
      await step('terminals',()=>click('设备'))
      await dialog('terminal-detail',()=>p.locator('.terminal-tile').first().click())
      await step('network',()=>click('网络'))
      await step('tools',()=>click('工具'))
      await dialog('favorites',()=>click('编辑常用应用'))
      for(const [i,name] of tools.entries())await step('tool-'+String(i+1).padStart(2,'0'),()=>openApplication(p,name))
      await dialog('factory',()=>openApplication(p,'恢复出厂'))
      await dialog('reboot',()=>openApplication(p,'重启设备'))
      await step('me',()=>click('我的'))
      await step('about',()=>p.locator('.v3-me-about-entry').click())
      await dialog('version',()=>click('查看应用版本详情'))
      await dialog('privacy',()=>click('查看隐私与免责声明'))
      await dialog('licenses',()=>click('查看开源许可证'))
      await dialog('release-notes',()=>click('版本日志'))
      await click('我的')
      await step('lab',()=>p.locator('.more-page .more-menu-item').filter({hasText:'实验室'}).click())
      await step('lab-reset',async()=>{await p.locator('.lab-reset-bar button').first().click();await modal().waitFor({state:'visible'})})
    }catch(e){r.missed.push({name:'fatal',error:String(e.message).split('\n')[0]})}
    finally{
      r.unseenDialogs=ids.filter(id=>!r.dialogs.includes(id))
      await ctx.close()
      fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2))
    }
  }
  console.log('Miuix visual audit:',JSON.stringify(manifest))
}
module.exports={captureMiuix}
