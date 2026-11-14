#!/usr/bin/env python3
"""Generate all Android launcher icon densities from the selected QWRT artwork.

The source is the originally generated blue/indigo router + network shield,
not a screenshot of the ChatGPT interface. Run after "npx cap add android"
because Capacitor recreates android/ from its stock template.
"""
from pathlib import Path
from collections import deque
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "qwrt-material-shield.webp"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
ADAPTIVE_SIZES = {name: round(size * 108 / 48) for name, size in SIZES.items()}
BACKGROUND = "#132C96"


def remove_outer_black(image: Image.Image) -> Image.Image:
    """Make only the image's *connected outer* black matte transparent.

    Interior deep blue in the selected artwork is preserved, unlike a naive
    chroma key that would erase dark areas inside the router illustration.
    """
    image = image.convert("RGBA")
    w, h = image.size
    pixels = image.load()
    border = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)]
    border += [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    visited = set()
    queue = deque(border)
    while queue:
        x, y = queue.popleft()
        if (x, y) in visited or not 0 <= x < w or not 0 <= y < h:
            continue
        visited.add((x, y))
        r, g, b, _ = pixels[x, y]
        if max(r, g, b) >= 28:
            continue
        pixels[x, y] = (r, g, b, 0)
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    return image


def write_png(image: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def main():
    if not SOURCE.is_file():
        raise SystemExit(f"Selected launcher artwork missing: {SOURCE}")
    if not RES.is_dir():
        raise SystemExit(f"Android resources not initialized: {RES}")

    source = remove_outer_black(Image.open(SOURCE))
    for density, pixels in SIZES.items():
        target = RES / f"mipmap-{density}"
        icon = source.resize((pixels, pixels), Image.Resampling.LANCZOS)
        write_png(icon, target / "ic_launcher.png")

        round_icon = icon.copy()
        mask = Image.new("L", (pixels, pixels), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, pixels - 1, pixels - 1), fill=255)
        round_icon.putalpha(ImageChops.multiply(round_icon.getchannel("A"), mask))
        write_png(round_icon, target / "ic_launcher_round.png")

    for density, pixels in ADAPTIVE_SIZES.items():
        icon = source.resize((pixels, pixels), Image.Resampling.LANCZOS)
        write_png(icon, RES / f"mipmap-{density}" / "ic_launcher_foreground.png")

    xml_dir = RES / "mipmap-anydpi-v26"
    xml_dir.mkdir(parents=True, exist_ok=True)
    adaptive_xml = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/qwrt_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"""
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        (xml_dir / name).write_text(adaptive_xml)
    color_dir = RES / "values"
    color_dir.mkdir(parents=True, exist_ok=True)
    (color_dir / "qwrt_launcher_colors.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f'<resources><color name="qwrt_launcher_background">{BACKGROUND}</color></resources>\n'
    )
    print("QWRT shield artwork applied to launcher, round launcher and adaptive launcher resources")


if __name__ == "__main__":
    from PIL import ImageChops
    main()
