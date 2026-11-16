#!/usr/bin/env python3
"""Generate a human-reviewed visual comparison of Design A prototype and APP.

The prototype includes sample device names, sample traffic and a simulated
Android status bar. Therefore this report is NOT a pixel-perfect pass/fail gate
unless inputs are replaced by approved, deterministic production golden images.
"""
import argparse
import html
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


def compare(root: Path):
    actual_root = root / "actual"
    reference_root = root / "reference"
    diff_root = root / "diff"
    overlay_root = root / "overlay"
    rows = []
    for actual_path in sorted(actual_root.glob("*/*/*.png")):
        relative = actual_path.relative_to(actual_root)
        reference_path = reference_root / relative
        row = {
            "view": relative.stem,
            "width_dp": relative.parts[0],
            "theme": relative.parts[1],
            "actual": str(actual_path.relative_to(root)),
            "reference": str(reference_path.relative_to(root)),
        }
        if not reference_path.is_file():
            row["status"] = "missing-reference"
            rows.append(row)
            continue
        with Image.open(actual_path) as actual_image, Image.open(reference_path) as ref_image:
            actual = actual_image.convert("RGB")
            reference = ref_image.convert("RGB")
        if actual.size != reference.size:
            row["status"] = "viewport-size-mismatch"
            row["actual_pixels"] = actual.size
            row["reference_pixels"] = reference.size
            rows.append(row)
            continue
        delta = ImageChops.difference(actual, reference)
        r, g, b = delta.split()
        maximum = ImageChops.lighter(ImageChops.lighter(r, g), b)
        pixels_different = maximum.point(lambda value: 255 if value > 24 else 0)
        histogram = pixels_different.histogram()
        count = histogram[255]
        row["status"] = "review-required"
        row["pixels"] = actual.width * actual.height
        row["pixel_difference_ratio"] = round(count / row["pixels"], 5)
        row["mean_channel_difference"] = round(sum(ImageStat.Stat(delta).mean) / 3, 2)
        delta_target = diff_root / relative
        overlay_target = overlay_root / relative
        delta_target.parent.mkdir(parents=True, exist_ok=True)
        overlay_target.parent.mkdir(parents=True, exist_ok=True)
        # Brightness stretch assists review; numerical scores use *raw* delta.
        delta.point(lambda value: min(255, value * 3)).save(delta_target)
        Image.blend(actual, reference, 0.5).save(overlay_target)
        row["diff"] = str(delta_target.relative_to(root))
        row["overlay"] = str(overlay_target.relative_to(root))
        rows.append(row)
    return rows


def write_report(root: Path, rows):
    complete = sum(row["status"] == "review-required" for row in rows)
    unmatched = len(rows) - complete
    result = {
        "reference_source": "doc/prototype.html (sample metrics; NOT approved production golden)",
        "interpretation": (
            "Pixels reflect simulated data, different UI implementations and different "
            "system-bar structures. Mismatch percentage is diagnostic only, not a QA acceptance score."
        ),
        "paired_screens": complete,
        "unmatched_screens": unmatched,
        "screens": rows,
    }
    (root / "report.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    cells = []
    for row in rows:
        escape = lambda value: html.escape(str(value), quote=True)
        thumb = lambda key: (
            f'<a href="{escape(row[key])}"><img loading="lazy" src="{escape(row[key])}" /></a>'
            if key in row else ""
        )
        ratio = (
            f'{row["pixel_difference_ratio"] * 100:.2f}% (仅供参考)'
            if "pixel_difference_ratio" in row else row["status"]
        )
        cells.append(
            "<tr><td>" + escape(row["width_dp"]) + "dp · " + escape(row["theme"]) +
            "<div>" + escape(row["view"]) + "</div><small>" + escape(ratio) +
            "</small></td><td>" + thumb("reference") + "</td><td>" +
            thumb("actual") + "</td><td>" + thumb("overlay") +
            "</td><td>" + thumb("diff") + "</td></tr>"
        )
    page = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<title>XX-WRT Design A 视觉对照报告</title>
<style>
body{font:14px/1.6 system-ui,sans-serif;background:#edf3fc;color:#142641;margin:22px}
h1{font-size:24px}.note{max-width:1060px;background:white;border:1px solid #dce6f4;border-radius:14px;padding:16px}
table{border-collapse:collapse;width:100%;background:#fff}
th,td{padding:10px;border:1px solid #dce6f4;vertical-align:top;text-align:left}
td:first-child{min-width:145px}img{width:100%;min-width:115px;max-width:280px;height:auto}
small{color:#63758e}a{color:#2477ee}
</style></head><body>
<h1>Design A · 逐屏视觉差异审阅</h1>
<div class="note"><strong>非 100% 一致验收凭据。</strong>
参考 HTML 使用虚构指标、独立模拟状态栏与交互示意；正式 APP 使用模拟 RPC/真实组件。
此报告包含可人工审阅的原图、实拍、50% 叠加和增强差异图。
只有在同分辨率、同字号、同数据及经审批的产品 Golden Screenshot 下，像素差异才具有验收意义。</div>
<p>可配对截图：__PAIRS__；缺少对应参考/尺寸不符：__MISSING__。</p>
<table><thead><tr><th>页面 / 差异率</th><th>交互原型</th><th>实际 APP</th><th>50% 叠加</th><th>增强差异</th></tr></thead><tbody>
__ROWS__
</tbody></table></body></html>"""
    page = page.replace("__PAIRS__", str(complete)).replace("__MISSING__", str(unmatched))
    page = page.replace("__ROWS__", "\n".join(cells))
    (root / "report.html").write_text(page, encoding="utf-8")
    print(f"Design A visual report: {complete} pairs, {unmatched} without match")
    print(f"Open {root / 'report.html'} for side-by-side comparison")
    if not rows:
        raise SystemExit("No actual screenshots found; visual capture did not run")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("test-results/design-a"))
    args = parser.parse_args()
    args.root.mkdir(parents=True, exist_ok=True)
    write_report(args.root, compare(args.root))
