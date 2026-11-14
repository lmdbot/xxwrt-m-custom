#!/usr/bin/env python3
"""Display Internet Detector instances as responsive status capsules.

Run after fix_internet_detector_binding.py. UniApp compiled render IDs on the
service side must exactly match those on the native app-view side.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / 'src' / 'www'
SERVICE = ROOT / 'app-service.js'
VIEW = ROOT / 'app-view.js'

SERVICE_MARKUP = (
    'n("view",{staticClass:t._$s(119,"sc","detail-row internet-detector-row"),style:t._$s(119,"s",{display:"flex",flexDirection:"column",alignItems:"stretch",width:"100%",minWidth:"0",padding:"14px 0",boxSizing:"border-box"}),attrs:{_i:119}},['
    'n("view",{staticClass:t._$s(120,"sc","internet-detector-heading"),style:t._$s(120,"s",{display:"flex",flexDirection:"row",justifyContent:"space-between",alignItems:"center",width:"100%",flexWrap:"wrap",gap:"8px",marginBottom:"12px"}),attrs:{_i:120}},['
    'n("text",{staticClass:t._$s(121,"sc","internet-detector-title"),style:t._$s(121,"s",{fontSize:"26rpx",fontWeight:"400",color:t.isDark?"#e5e7eb":"#475569"}),attrs:{_i:121}},'
    '[t._v(t._$s(121,"t0-0","联网监测"))]),'
    'n("text",{staticClass:t._$s(122,"sc","internet-detector-total"),style:t._$s(122,"s",{fontSize:"26rpx",fontWeight:"700",color:(t.systemStatus.internetDetectorItems||[]).some(function(x){return 0!==x.inet})?(t.isDark?"#fecaca":"#b91c1c"):(t.isDark?"#bbf7d0":"#15803d"),backgroundColor:(t.systemStatus.internetDetectorItems||[]).some(function(x){return 0!==x.inet})?(t.isDark?"#45232a":"#fff1f2"):(t.isDark?"#17372a":"#e9f8ee"),borderRadius:"999px",padding:"5px 10px",whiteSpace:"nowrap"}),attrs:{_i:122}},'
    '[t._v(t._$s(122,"t0-0",t._s(t.systemStatus.internetDetector||"检测中")))])]),'
    'n("view",{staticClass:t._$s(123,"sc","internet-detector-capsules"),style:t._$s(123,"s",{display:"flex",flexDirection:"row",flexWrap:"wrap",alignItems:"flex-start",width:"100%",minWidth:"0",gap:"8px"}),attrs:{_i:123}},'
    't._l(t._$s(126,"f",{forItems:t.systemStatus.internetDetectorItems||[]}),(function(e,i,r,a){'
    'return n("view",{key:t._$s(126,"f",{forIndex:r,key:e.instance}),'
    'staticClass:t._$s("126-"+a,"sc","detector-pill "+(0===e.inet?"pill-up":-1===e.inet?"pill-pending":"pill-down")),'
    'style:t._$s("126-"+a,"s",{display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"flex-start",width:"calc(50% - 4px)",minWidth:"0",boxSizing:"border-box",padding:"5px 8px",borderRadius:"999px",borderWidth:"1px",borderStyle:"solid",marginBottom:"2px",backgroundColor:0===e.inet?(t.isDark?"#19372a":"#eefaf2"):-1===e.inet?(t.isDark?"#40351e":"#fff8e8"):(t.isDark?"#43272b":"#fff1f2"),borderColor:0===e.inet?(t.isDark?"#2f6846":"#c6e9d1"):-1===e.inet?(t.isDark?"#796134":"#f5dfa3"):(t.isDark?"#805059":"#fecdd3")}),attrs:{_i:"126-"+a}},['
    'n("text",{staticClass:t._$s("127-"+a,"sc","detector-pill-dot"),style:t._$s("127-"+a,"s",{fontSize:"12px",lineHeight:"17px",flexShrink:0,marginRight:"5px",color:0===e.inet?(t.isDark?"#86efac":"#16a34a"):-1===e.inet?(t.isDark?"#fcd34d":"#d97706"):(t.isDark?"#fca5a5":"#dc2626")}),attrs:{_i:"127-"+a}},'
    '[t._v(t._$s("127-"+a,"t0-0","●"))]),'
    'n("text",{staticClass:t._$s("128-"+a,"sc","detector-pill-name"),style:t._$s("128-"+a,"s",{fontSize:"26rpx",lineHeight:"17px",fontWeight:"600",flex:"1",minWidth:"0",whiteSpace:"normal",wordBreak:"break-word",color:t.isDark?"#f3f4f6":"#334155"}),attrs:{_i:"128-"+a}},'
    '[t._v(t._$s("128-"+a,"t0-0",t._s(({"netease_music":"网易云","telegram":"Telegram","baidu":"Baidu","chatgpt":"ChatGPT","google":"Google","github":"GitHub","youtube":"YouTube","internet":"Internet"})[String(e.instance||"").toLowerCase()]||e.instance)))]),'
    'n("text",{staticClass:t._$s("129-"+a,"sc","detector-pill-status"),style:t._$s("129-"+a,"s",{fontSize:"26rpx",lineHeight:"17px",fontWeight:"500",flexShrink:0,marginLeft:"5px",whiteSpace:"nowrap",color:0===e.inet?(t.isDark?"#86efac":"#15803d"):-1===e.inet?(t.isDark?"#fcd34d":"#a16207"):(t.isDark?"#fca5a5":"#b91c1c")}),attrs:{_i:"129-"+a}},'
    '[t._v(t._$s("129-"+a,"t0-0",t._s(e.status)))])])})),0)])'
)

VIEW_MARKUP = (
    'r("uni-view",{staticClass:t._$g(119,"sc"),style:t._$g(119,"s"),attrs:{_i:119}},['
    'r("uni-view",{staticClass:t._$g(120,"sc"),style:t._$g(120,"s"),attrs:{_i:120}},['
    'r("v-uni-text",{staticClass:t._$g(121,"sc"),style:t._$g(121,"s"),attrs:{_i:121}},'
    '[t._v(t._$g(121,"t0-0"))]),'
    'r("v-uni-text",{staticClass:t._$g(122,"sc"),style:t._$g(122,"s"),attrs:{_i:122}},'
    '[t._v(t._$g(122,"t0-0"))])],1),'
    'r("uni-view",{staticClass:t._$g(123,"sc"),style:t._$g(123,"s"),attrs:{_i:123}},'
    't._l(t._$g(126,"f"),(function(e,i,n,a){'
    'return r("uni-view",{key:e,staticClass:t._$g("126-"+a,"sc"),style:t._$g("126-"+a,"s"),attrs:{_i:"126-"+a}},['
    'r("v-uni-text",{staticClass:t._$g("127-"+a,"sc"),style:t._$g("127-"+a,"s"),attrs:{_i:"127-"+a}},'
    '[t._v(t._$g("127-"+a,"t0-0"))]),'
    'r("v-uni-text",{staticClass:t._$g("128-"+a,"sc"),style:t._$g("128-"+a,"s"),attrs:{_i:"128-"+a}},'
    '[t._v(t._$g("128-"+a,"t0-0"))]),'
    'r("v-uni-text",{staticClass:t._$g("129-"+a,"sc"),style:t._$g("129-"+a,"s"),attrs:{_i:"129-"+a}},'
    '[t._v(t._$g("129-"+a,"t0-0"))])],1)})),1)],1)'
)

CSS = (
    '.internet-detector-row[data-v-acec85de]{display:flex;flex-direction:column;align-items:stretch;min-width:0;padding:22rpx 0;gap:20rpx}'
    '.internet-detector-heading[data-v-acec85de]{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12rpx}'
    '.internet-detector-title[data-v-acec85de]{font-size:26rpx;font-weight:400;color:var(--text-sub)}'
    '.internet-detector-total[data-v-acec85de]{display:inline-flex;align-items:center;border-radius:9999rpx;padding:7rpx 18rpx;font-size:26rpx;font-weight:700;color:#27945b;background:rgba(52,199,89,.12)}'
    '.internet-detector-capsules[data-v-acec85de]{display:flex;flex-wrap:wrap;align-items:flex-start;gap:13rpx;min-width:0;width:100%;box-sizing:border-box}'
    '.detector-pill[data-v-acec85de]{display:inline-flex;flex:0 1 auto;align-items:center;justify-content:flex-start;min-width:0;max-width:100%;padding:9rpx 16rpx;border-radius:9999rpx;border:1px solid;gap:9rpx;box-sizing:border-box;line-height:1.35;white-space:nowrap;box-shadow:0 2rpx 7rpx rgba(0,0,0,.035)}'
    '.detector-pill-name[data-v-acec85de]{min-width:0;font-size:26rpx;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    '.detector-pill-status[data-v-acec85de]{font-size:26rpx;font-weight:500;white-space:nowrap;opacity:.87}'
    '.detector-pill-dot[data-v-acec85de]{font-size:21rpx;line-height:1;flex:none}'
    '.pill-up[data-v-acec85de]{color:#22874b;background:rgba(44,183,97,.095);border-color:rgba(44,183,97,.23)}'
    '.pill-down[data-v-acec85de]{color:#c33e48;background:rgba(239,68,68,.095);border-color:rgba(239,68,68,.24)}'
    '.pill-pending[data-v-acec85de]{color:#a46d17;background:rgba(236,162,39,.11);border-color:rgba(236,162,39,.25)}'
)

def between(source, a, b, replacement):
    start = source.find(a)
    if start < 0 or source.count(a) != 1:
        raise RuntimeError(f'missing/ambiguous start anchor: {a}')
    end = source.find(b, start)
    if end <= start:
        raise RuntimeError(f'missing end anchor: {b}')
    return source[:start] + replacement + source[end:]

def main():
    service = SERVICE.read_text(encoding='utf-8')
    view = VIEW.read_text(encoding='utf-8')
    if 'internetDetectorItems' not in service or 'internetDetectorDisplay' not in service:
        raise RuntimeError('Run fix_internet_detector_binding.py first')
    service = between(service,
        'n("view",{staticClass:t._$s(119,"sc"',
        ',t._$s(37,"i"', SERVICE_MARKUP)
    view = between(view,
        'r("uni-view",{staticClass:t._$g(119,"sc"',
        ',t._$g(37,"i")?', VIEW_MARKUP)
    pattern = re.compile(r'(?:\.internet-detector-[a-z-]+\[data-v-acec85de\]\{[^}]*\})+')
    match = pattern.search(view)
    if not match:
        raise RuntimeError('Missing original scoped detector CSS')
    view = view[:match.start()] + CSS + view[match.end():]
    for idx in [119,120,121,122,123,126]:
        if f'_$s({idx},' not in service or f'_$g({idx},' not in view:
            raise RuntimeError(f'service/view bind mismatch at ID {idx}')
    for idx in [127,128,129]:
        if f'_$s("{idx}-"+a,' not in service or f'_$g("{idx}-"+a,' not in view:
            raise RuntimeError(f'loop bind mismatch at ID {idx}')
    SERVICE.write_text(service, encoding='utf-8')
    VIEW.write_text(view, encoding='utf-8')
    print('OK: responsive Internet Detector status capsules synced on service/view')

if __name__ == '__main__':
    main()
