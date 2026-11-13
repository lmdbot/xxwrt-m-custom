#!/usr/bin/env python3
"""Patch known compiled uni-app app-service.js (XX-WRT M v1.0.6).
This is a surgical patch of the executable compiled JS, not the original Vue source.
Stops truncating Internet Detector entries to three and renders a readable full list.
"""
from pathlib import Path
import sys

OLD_DATA = 'temperature:"--",internetDetector:"检测中",ponMode:'
NEW_DATA = 'temperature:"--",internetDetector:"检测中",internetDetectorSummary:"",internetDetectorItems:[],ponMode:'

OLD_PARSE = '''var l=e[19],u=l&&l.result&&l.result[1],c=u&&u.instances;if(Array.isArray(c)&&c.length){this.systemStatus.internetDetector=c.slice(0,3).map(function(t){var e=t.instance||"探测";return e+": "+(0==t.inet?"已连接":-1==t.inet?"检测中":"已断开")}).join(" · ")+(c.length>3?" · +"+(c.length-3):"")}else this.systemStatus.internetDetector=u?"暂无监测实例":"状态不可用"}catch(h){this.systemStatus.internetDetector="获取失败"}'''
NEW_PARSE = '''var l=e[19],u=l&&l.result&&l.result[1],c=u&&u.instances;if(Array.isArray(c)&&c.length){var total=c.length,ok=0;this.systemStatus.internetDetectorItems=c.map(function(x,idx){var code=Number(x.inet),label=0===code?"已连接":-1===code?"检测中":"已断开";if(0===code)ok++;return {instance:String(x.instance||"监测 "+(idx+1)),status:label,inet:code}});this.systemStatus.internetDetectorSummary=ok+" / "+total+" 正常";this.systemStatus.internetDetector=ok+" / "+total+" 正常"}else{this.systemStatus.internetDetectorItems=[];this.systemStatus.internetDetectorSummary="";this.systemStatus.internetDetector=u?"暂无监测实例":"状态不可用"}}catch(h){this.systemStatus.internetDetectorItems=[];this.systemStatus.internetDetectorSummary="";this.systemStatus.internetDetector="获取失败"}'''

OLD_VIEW = '''n("view",{staticClass:t._$s(119,"sc","detail-row"),attrs:{_i:119}},[n("text",{staticClass:t._$s(120,"sc","detail-label"),attrs:{_i:120}},[t._v(t._$s(120,"t0-0","联网监测"))]),n("text",{staticClass:t._$s(121,"sc","detail-value"),attrs:{_i:121}},[t._v(t._$s(121,"t0-0",t._s(t.systemStatus.internetDetector||"状态不可用")))])])'''
NEW_VIEW = '''n("view",{staticClass:t._$s(119,"sc","detail-row"),attrs:{_i:119},style:{display:"block",height:"auto",minHeight:"0",padding:"14px 0",boxSizing:"border-box"}},[n("view",{style:{display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"space-between",width:"100%",marginBottom:"10px"}},[n("text",{style:{fontSize:"15px",fontWeight:"600",color:t.isDark?"#e5e7eb":"#374151",whiteSpace:"nowrap"}},[t._v("联网监测")]),n("text",{style:{fontSize:"12px",color:t.isDark?"#9ca3af":"#6b7280",marginLeft:"8px",flexShrink:0}},[t._v(t._s(t.systemStatus.internetDetectorSummary||""))])]),n("view",{style:{display:"flex",flexDirection:"column",gap:"7px",width:"100%"}},[(t.systemStatus.internetDetectorItems||[]).length?(t.systemStatus.internetDetectorItems||[]).map(function(e,i){return n("view",{key:"inet-"+i,style:{display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"space-between",width:"100%",minWidth:"0",padding:"8px 10px",boxSizing:"border-box",borderRadius:"8px",backgroundColor:t.isDark?"#292c33":"#f5f7fa"}},[n("text",{style:{fontSize:"13px",lineHeight:"20px",color:t.isDark?"#e5e7eb":"#333a45",flex:"1",minWidth:"0",marginRight:"12px",wordBreak:"break-all",whiteSpace:"normal"}},[t._v(t._s(e.instance))]),n("text",{style:{fontSize:"12px",lineHeight:"20px",fontWeight:"600",color:0===e.inet?(t.isDark?"#4ade80":"#16803b"):-1===e.inet?(t.isDark?"#facc15":"#ac7415"):(t.isDark?"#f87171":"#c63535"),flexShrink:0,whiteSpace:"nowrap"}},[t._v(t._s(e.status))])])}):n("text",{style:{fontSize:"13px",color:t.isDark?"#a1a1aa":"#6b7280",lineHeight:"20px"}},[t._v(t._s(t.systemStatus.internetDetector||"状态不可用"))])])])'''


def patch(src: str)->str:
    for title,old,new in [("data",OLD_DATA,NEW_DATA),("parse",OLD_PARSE,NEW_PARSE),("view",OLD_VIEW,NEW_VIEW)]:
        n=src.count(old)
        if n!=1: raise RuntimeError(f"Anchor {title} count {n}, expected exactly one; refusing unsafe patch")
        src=src.replace(old,new,1)
    return src

if __name__=='__main__':
    if len(sys.argv)!=3:
        raise SystemExit('Usage: patch_monitor_ui.py <input app-service.js> <output app-service.js>')
    orig=Path(sys.argv[1]).read_text('utf-8')
    fixed=patch(orig)
    Path(sys.argv[2]).write_text(fixed,'utf-8')
    print('OK: all Internet Detector instances shown as separate rows')
