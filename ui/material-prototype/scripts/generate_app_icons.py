#!/usr/bin/env python3
"""Generate Android launcher icons from the selected blue OpenWrt chibi mascot.

The selected original art combines the Q-version anime mascot, Wi-Fi symbol,
OpenWrt router, antennas, and status LEDs. Run after "npx cap add android":
Capacitor recreates the native Android tree on every CI build.
"""
from pathlib import Path
import hashlib
import base64
from io import BytesIO
from collections import deque
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "qwrt-chibi-openwrt-router.webp"
SOURCE_SHA256 = "a324b0e6285c31bfdc74b789712548f1c29e0b2617b52bc6e1a14f102e9165f1"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
ADAPTIVE_SIZES = {name: round(size * 108 / 48) for name, size in SIZES.items()}
# The 108dp adaptive icon is clipped by Android to a central 66dp safe zone.
# Foreground illustration must be smaller than that safe zone to retain margins.
# Legacy icons are displayed without the adaptive foreground crop.
# The selected artwork already contains the finished blue rounded-square icon.
# Enlarge the legacy bitmap (used by Settings/App info) while retaining a small
# transparent margin. For adaptive icons the OS clips a 108dp canvas to a
# roughly 72dp viewport; the 72% foreground fills that area without leaving
# a dark transparent halo, while the character and mini router stay central.
LEGACY_ART_SCALE = 0.94
ADAPTIVE_ART_SCALE = 0.66
ADAPTIVE_BACKGROUND = "#338AEB"
SOURCE_TRIM_RATIO = 0.035


def remove_outer_black(image: Image.Image) -> Image.Image:
    """Make only the image's *connected outer* black matte transparent.

    The connected near-black background and original outer drop shadow are
    removed without deleting the saturated blue body of the icon.
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
        # Allow near-black/neutral shadow, but never erase dark saturated blue.
        if max(r, g, b) >= 72 or (b > r + 18 and b > g + 12):
            continue
        pixels[x, y] = (r, g, b, 0)
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    return image


def write_png(image: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def framed_icon(source: Image.Image, size: int, art_scale: float) -> Image.Image:
    """Fit the selected rounded-square icon within a transparent canvas."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    illustration_size = round(size * art_scale)
    illustration = source.resize((illustration_size, illustration_size), Image.Resampling.LANCZOS)
    margin = (size - illustration_size) // 2
    canvas.alpha_composite(illustration, (margin, margin))
    return canvas


def generate_alternative_icons():
    """Generate built-in preset aliases from source icons extracted from XX-WRTM.7z."""
    variants = [
        ("classic", "xxwrtm-classic", "1876c0783157698b4eeeb0f540196d348e2301897776688d6c61b02cf730e6f9", "#1265cf"),
        ("openwrt", "openwrt-brand", "d68692131e9935d8e68e96d2b83cdad24cdc99fc18cee20ae149b1993ec4c840", "#e6f6ff"),
    ]
    for icon_id, filename, digest, background in variants:
        source_file = ROOT / "assets" / "icons" / (filename + ".png.b64")
        raw = base64.b64decode(source_file.read_text().strip(), validate=True)
        if hashlib.sha256(raw).hexdigest() != digest:
            raise SystemExit(f"Preset launcher asset invalid or changed: {source_file}")
        source = Image.open(BytesIO(raw)).convert("RGBA")
        for density, pixels in SIZES.items():
            icon = Image.new("RGBA", (pixels, pixels), (0, 0, 0, 0))
            if icon_id == "openwrt":
                draw = ImageDraw.Draw(icon)
                draw.rounded_rectangle((0, 0, pixels - 1, pixels - 1),
                    radius=round(pixels * .22), fill=background)
                art = source.resize((round(pixels * .82), round(pixels * .82)), Image.Resampling.LANCZOS)
            else:
                art = source.resize((round(pixels * .94), round(pixels * .94)), Image.Resampling.LANCZOS)
            pad = (pixels - art.width) // 2
            icon.alpha_composite(art, (pad, pad))
            write_png(icon, RES / f"mipmap-{density}" / f"ic_launcher_{icon_id}.png")
        for density, pixels in ADAPTIVE_SIZES.items():
            foreground = framed_icon(source, pixels, .65 if icon_id == "classic" else .53)
            write_png(foreground, RES / f"mipmap-{density}" / f"ic_launcher_{icon_id}_foreground.png")
        xml = f"""<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/qwrt_launcher_{icon_id}_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_{icon_id}_foreground"/>
</adaptive-icon>
"""
        (RES / "mipmap-anydpi-v26" / f"ic_launcher_{icon_id}.xml").write_text(xml, encoding="utf-8")
        (RES / "values" / f"qwrt_launcher_{icon_id}_colors.xml").write_text(
            f'<?xml version="1.0" encoding="utf-8"?>\n'
            f'<resources><color name="qwrt_launcher_{icon_id}_background">{background}</color></resources>\n',
            encoding="utf-8"
        )
        print("Generated alternative launcher icon:", icon_id)


def main():
    if not SOURCE.is_file():
        raise SystemExit(f"Selected launcher artwork missing: {SOURCE}")
    if not RES.is_dir():
        raise SystemExit(f"Android resources not initialized: {RES}")

    actual_sha256 = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if actual_sha256 != SOURCE_SHA256:
        raise SystemExit(f"Selected launcher artwork SHA256 mismatch: {actual_sha256}")

    source = remove_outer_black(Image.open(SOURCE))
    if source.getchannel("A").getbbox() is None:
        raise SystemExit("Selected launcher artwork has no visible pixels")

    # The original WebP includes a dark peripheral shadow. Trim that fringe
    # before enlarging; otherwise it becomes a thick black ring in Settings.
    w, h = source.size
    inset = round(min(w, h) * SOURCE_TRIM_RATIO)
    if w <= 2 * inset or h <= 2 * inset:
        raise SystemExit("Selected launcher artwork is too small")
    source = source.crop((inset, inset, w - inset, h - inset))

    # Soft-clip only the *outer silhouette* of the existing rounded icon.
    # This suppresses residual near-black pixels around the WebP's corners.
    w, h = source.size
    aa = 4
    clip = Image.new("L", (w * aa, h * aa), 0)
    ImageDraw.Draw(clip).rounded_rectangle(
        (0, 0, w * aa - 1, h * aa - 1),
        radius=round(min(w, h) * aa * 0.23),
        fill=255
    )
    clip = clip.resize((w, h), Image.Resampling.LANCZOS)
    source.putalpha(ImageChops.multiply(source.getchannel("A"), clip))
    for density, pixels in SIZES.items():
        target = RES / f"mipmap-{density}"
        icon = framed_icon(source, pixels, LEGACY_ART_SCALE)
        write_png(icon, target / "ic_launcher.png")

        round_icon = icon.copy()
        mask = Image.new("L", (pixels, pixels), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, pixels - 1, pixels - 1), fill=255)
        round_icon.putalpha(ImageChops.multiply(round_icon.getchannel("A"), mask))
        write_png(round_icon, target / "ic_launcher_round.png")

    for density, pixels in ADAPTIVE_SIZES.items():
        # Keep the original graphic large in the Android adaptive mask.
        # Opaque blue background below prevents black margins on dark launchers.
        icon = Image.new("RGBA", (pixels, pixels), (0, 0, 0, 0))
        art_size = round(pixels * ADAPTIVE_ART_SCALE)
        art = source.resize((art_size, art_size), Image.Resampling.LANCZOS)
        origin = (pixels - art_size) // 2
        icon.alpha_composite(art, (origin, origin))
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
        f'<resources><color name="qwrt_launcher_background">{ADAPTIVE_BACKGROUND}</color></resources>\n'
    )
    generate_alternative_icons()
    print("OpenWrt chibi default + extracted XX-WRT M / OpenWrt preset icons")


if __name__ == "__main__":
    main()
