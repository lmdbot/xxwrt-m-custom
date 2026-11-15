#!/usr/bin/env python3
"""Install the OpenWrt chibi launcher icon after Capacitor generates Android.

The image is stored as numbered binary fragments. Its SHA256 is checked prior
to generation, so a corrupted/missing fragment cannot silently ship.
"""
from __future__ import annotations

import hashlib
import io
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIRECTORY = ROOT / 'assets' / 'launcher-chibi'
RESOURCE_DIRECTORY = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
MANIFEST = ROOT / 'android' / 'app' / 'src' / 'main' / 'AndroidManifest.xml'
EXPECTED_SHA256 = 'a324b0e6285c31bfdc74b789712548f1c29e0b2617b52bc6e1a14f102e9165f1'
DENSITIES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}


def source_icon() -> Image.Image:
    parts = [ASSET_DIRECTORY / f'icon.webp.part{number}' for number in range(1, 6)]
    blob = b''.join(part.read_bytes() for part in parts)
    digest = hashlib.sha256(blob).hexdigest()
    if digest != EXPECTED_SHA256:
        raise RuntimeError(f'Launcher art failed SHA256 verification: {digest}')
    with Image.open(io.BytesIO(blob)) as image:
        image.load()
        if image.size != (192, 192):
            raise RuntimeError(f'Unexpected launcher icon dimensions: {image.size}')
        return image.convert('RGBA')


def save_legacy(icon: Image.Image) -> None:
    for density, size in DENSITIES.items():
        folder = RESOURCE_DIRECTORY / f'mipmap-{density}'
        folder.mkdir(parents=True, exist_ok=True)
        base = icon.resize((size, size), Image.Resampling.LANCZOS)
        for filename in ('ic_launcher', 'ic_launcher_round'):
            for duplicate in folder.glob(filename + '.*'):
                duplicate.unlink()
        base.save(folder / 'ic_launcher.png', optimize=True)
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        rounded = base.copy()
        alpha = base.getchannel('A')
        from PIL import ImageChops
        rounded.putalpha(ImageChops.multiply(alpha, mask))
        rounded.save(folder / 'ic_launcher_round.png', optimize=True)


def make_adaptive(icon: Image.Image) -> None:
    folder = RESOURCE_DIRECTORY / 'drawable-nodpi'
    folder.mkdir(parents=True, exist_ok=True)
    canvas = 432
    background = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 255))
    pixels = background.load()
    for y in range(canvas):
        t = y / (canvas - 1)
        for x in range(canvas):
            lateral = x / (canvas - 1)
            pixels[x, y] = (
                round(36 + 10 * t + 10 * lateral),
                round(145 - 29 * t - 5 * lateral),
                round(243 - 11 * t),
                255,
            )
    background.save(folder / 'xxwrt_launcher_background.png', optimize=True)

    foreground = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    artwork_size = 370
    artwork = icon.resize((artwork_size, artwork_size), Image.Resampling.LANCZOS)
    foreground.alpha_composite(artwork, ((canvas - artwork_size) // 2,) * 2)
    foreground.save(folder / 'xxwrt_launcher_foreground.png', optimize=True)

    mono = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(mono)
    white = (255, 255, 255, 255)
    draw.rounded_rectangle((112, 232, 320, 321), radius=30, fill=white)
    draw.line((142, 247, 128, 207), fill=white, width=20)
    draw.line((289, 247, 304, 207), fill=white, width=20)
    for box, width in [((139, 113, 293, 273), 18), ((167, 145, 265, 244), 17)]:
        draw.arc(box, 206, 334, fill=white, width=width)
    draw.ellipse((207, 188, 225, 206), fill=white)
    for x in (250, 273, 296):
        draw.ellipse((x - 6, 286, x + 6, 298), fill=(0, 0, 0, 0))
    mono.save(folder / 'xxwrt_launcher_monochrome.png', optimize=True)

    anydpi = RESOURCE_DIRECTORY / 'mipmap-anydpi-v26'
    anydpi.mkdir(parents=True, exist_ok=True)
    xmlns = 'http://schemas.android.com/apk/res/android'
    ET.register_namespace('android', xmlns)
    for icon_name in ('ic_launcher', 'ic_launcher_round'):
        root = ET.Element('adaptive-icon')
        for tag, image in (
            ('background', '@drawable/xxwrt_launcher_background'),
            ('foreground', '@drawable/xxwrt_launcher_foreground'),
            ('monochrome', '@drawable/xxwrt_launcher_monochrome'),
        ):
            ET.SubElement(root, tag, {f'{{{xmlns}}}drawable': image})
        ET.ElementTree(root).write(anydpi / f'{icon_name}.xml', encoding='utf-8', xml_declaration=True)


def main() -> None:
    if not MANIFEST.exists() or not RESOURCE_DIRECTORY.is_dir():
        raise SystemExit('Android project is missing; run npx cap add android first')
    android_ns = 'http://schemas.android.com/apk/res/android'
    application = ET.parse(MANIFEST).getroot().find('application')
    if application is None or application.get(f'{{{android_ns}}}icon') != '@mipmap/ic_launcher':
        raise SystemExit('Capacitor launcher icon reference changed; check manifest before building')
    icon = source_icon()
    save_legacy(icon)
    make_adaptive(icon)
    print('Installed XX-WRT chibi launcher resources for five densities and adaptive icons')


if __name__ == '__main__':
    main()
