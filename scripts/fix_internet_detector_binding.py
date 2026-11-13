#!/usr/bin/env python3
"""Repair Internet Detector home-screen rendering in compiled UniApp bundles.

UniApp's app-service.js and app-view.js share compiled node IDs. The older
patch created new service-side nodes but did not create corresponding view-side
nodes, so the mobile UI rendered 'undefined'. Preserve node IDs 119/120/121,
show all instances through a multiline text binding, and apply scoped CSS.
This script is intentionally deterministic and fails if the known bundle differs.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1] / "src" / "www"
SERVICE = ROOT / "app-service.js"
VIEW = ROOT / "app-view.js"


def one(src, old, new, label):
    count = src.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, found {count}")
    return src.replace(old, new, 1)


def patch():
    service = SERVICE.read_text(encoding="utf-8")
    view = VIEW.read_text(encoding="utf-8")

    if 'internetDetectorDisplay:"检测中"' in service:
        if "internet-detector-row" not in service or "internet-detector-value" not in view:
            raise RuntimeError("Partially patched bundle; refusing to continue")
        print("Internet Detector binding fix already present")
        return

    service = one(
        service,
        'temperature:"--",internetDetector:"检测中",internetDetectorSummary:"",internetDetectorItems:[],ponMode:',
        'temperature:"--",internetDetector:"检测中",internetDetectorSummary:"",internetDetectorItems:[],internetDetectorDisplay:"检测中",ponMode:',
        "declare reactive display state",
    )
    service = one(
        service,
        'this.systemStatus.internetDetector=ok+" / "+total+" 正常"',
        'this.systemStatus.internetDetector=ok+" / "+total+" 正常";this.systemStatus.internetDetectorDisplay=this.systemStatus.internetDetector+"\\n"+this.systemStatus.internetDetectorItems.map(function(item){return (0===item.inet?"🟢 ":-1===item.inet?"🟡 ":"🔴 ")+item.instance+"："+item.status}).join("\\n")',
        "format all detector instances",
    )
    service = one(
        service,
        'this.systemStatus.internetDetector=u?"暂无监测实例":"状态不可用"',
        'this.systemStatus.internetDetector=u?"暂无监测实例":"状态不可用";this.systemStatus.internetDetectorDisplay=this.systemStatus.internetDetector',
        "empty-state fallback",
    )
    service = one(
        service,
        'this.systemStatus.internetDetector="获取失败"',
        'this.systemStatus.internetDetector="获取失败";this.systemStatus.internetDetectorDisplay=this.systemStatus.internetDetector',
        "error-state fallback",
    )

    start_anchor = 'n("view",{staticClass:t._$s(119,"sc","detail-row")'
    start = service.find(start_anchor)
    if start < 0 or service.count(start_anchor) != 1:
        raise RuntimeError("Expected original service renderer node 119 not found")
    end = service.find(',t._$s(37,"i"', start)
    if end < 0:
        raise RuntimeError("Cannot determine renderer section boundary")
    previous = service[start:end]
    if 'internetDetectorItems||[]' not in previous or 't._v("联网监测")' not in previous:
        raise RuntimeError("Unexpected original Internet Detector renderer")

    # View-side bundle already has _i:119, _i:120 and _i:121. Use exactly
    # those existing IDs and the t0-0 text bindings expected by app-view.js.
    replacement = (
        'n("view",{staticClass:t._$s(119,"sc","detail-row internet-detector-row"),attrs:{_i:119}},['
        'n("text",{staticClass:t._$s(120,"sc","detail-label internet-detector-title"),attrs:{_i:120}},'
        '[t._v(t._$s(120,"t0-0","联网监测"))]),'
        'n("text",{staticClass:t._$s(121,"sc","detail-value internet-detector-value"),attrs:{_i:121}},'
        '[t._v(t._$s(121,"t0-0",t._s(t.systemStatus.internetDetectorDisplay||t.systemStatus.internetDetector||"状态不可用")))])])'
    )
    service = service[:start] + replacement + service[end:]

    # The native UniApp view renderer uses CSS embedded in app-view.js.
    anchor = '.detail-value[data-v-acec85de]{font-size:26rpx;color:var(--text-main);font-weight:500;text-align:right}'
    css = (
        '.internet-detector-row[data-v-acec85de]{display:flex;flex-direction:column;align-items:stretch;min-width:0;padding:18rpx 0;gap:12rpx}'
        '.internet-detector-title[data-v-acec85de]{display:block;width:100%;font-size:26rpx;font-weight:700;text-align:left}'
        '.internet-detector-value[data-v-acec85de]{display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;'
        'text-align:left!important;white-space:pre-wrap!important;overflow-wrap:anywhere;word-break:break-word;'
        'line-height:1.9;font-size:25rpx;font-weight:500}'
    )
    view = one(view, anchor, anchor + css, "view stylesheet")

    view_template = (
        'r("uni-view",{staticClass:t._$g(119,"sc"),attrs:{_i:119}},'
        '[r("v-uni-text",{staticClass:t._$g(120,"sc"),attrs:{_i:120}},'
        '[t._v(t._$g(120,"t0-0"))]),'
        'r("v-uni-text",{staticClass:t._$g(121,"sc"),attrs:{_i:121}},'
        '[t._v(t._$g(121,"t0-0"))])],1)'
    )
    if view.count(view_template) != 1:
        raise RuntimeError("Existing native view template IDs 119/120/121 do not match")
    if service.count('t._$s(120,"t0-0","联网监测")') != 1:
        raise RuntimeError("Title text binding was not created correctly")
    if service.count('t._$s(121,"t0-0",t._s(t.systemStatus.internetDetectorDisplay') != 1:
        raise RuntimeError("Status text binding was not created correctly")

    SERVICE.write_text(service, encoding="utf-8")
    VIEW.write_text(view, encoding="utf-8")
    print("OK: fixed UniApp service/view binding; all detector instances shown")


if __name__ == "__main__":
    try:
        patch()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
