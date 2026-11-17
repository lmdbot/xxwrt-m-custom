"""Regression checks for Android launcher aliases and archived icon assets."""
from pathlib import Path
import base64
import hashlib
import tempfile
import unittest
import xml.etree.ElementTree as ET

from patch_android_launcher_icons import patch, A

ROOT = Path(__file__).resolve().parents[1]
DIGESTS = {
    "xxwrtm-classic": "85c3d8e8e88fd787cae5d841fac54ae2e94d9a5ab00acac84ee1d13e6d4fc743",
    "openwrt-brand": "d68692131e9935d8e68e96d2b83cdad24cdc99fc18cee20ae149b1993ec4c840",
}


class LauncherIconPatcherTest(unittest.TestCase):
    def test_archived_presets_have_exact_expected_binary_hashes(self):
        for name, sha in DIGESTS.items():
            with self.subTest(name=name):
                source = ROOT / "assets/icons" / (name + ".png.b64")
                raw = base64.b64decode(source.read_text().strip(), validate=True)
                self.assertTrue(raw.startswith(bytes([137,80,78,71,13,10,26,10])))
                self.assertEqual(hashlib.sha256(raw).hexdigest(), sha)

    def test_launcher_aliases_replace_only_default_main_launcher(self):
        with tempfile.TemporaryDirectory() as tmp:
            native = Path(tmp) / "android"
            src = native / "app/src/main"
            main = src / "java/com/lmdbot/xxwrt/materialpreview/MainActivity.java"
            main.parent.mkdir(parents=True)
            main.write_text(
                "package com.lmdbot.xxwrt.materialpreview;\n"
                "public class MainActivity { void onCreate() { "
                "registerPlugin(ConfigFileExportPlugin.class); } }",
                encoding="utf-8"
            )
            manifest = src / "AndroidManifest.xml"
            manifest.write_text(
                '<?xml version="1.0" encoding="utf-8"?>\n'
                '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
                '<application><activity android:name=".MainActivity" android:exported="true">'
                '<intent-filter><action android:name="android.intent.action.MAIN"/>'
                '<category android:name="android.intent.category.LAUNCHER"/></intent-filter>'
                '<intent-filter><action android:name="some.other.ACTION"/></intent-filter>'
                '</activity></application></manifest>',
                encoding="utf-8"
            )
            paths = patch(native, ROOT / "native")
            self.assertEqual(len(paths), 3)
            self.assertIn("registerPlugin(LauncherIconPlugin.class);", main.read_text())
            self.assertIn("@CapacitorPlugin(name = \"LauncherIcon\")",
                          main.with_name("LauncherIconPlugin.java").read_text())
            tree = ET.parse(manifest)
            application = tree.getroot().find("application")
            aliases = application.findall("activity-alias")
            self.assertEqual(len(aliases), 3)
            self.assertEqual([a.get(A("name")) for a in aliases],
                             [".LauncherAnime", ".LauncherClassic", ".LauncherOpenWrt"])
            self.assertEqual([a.get(A("enabled")) for a in aliases], ["true","false","false"])
            self.assertEqual([a.get(A("icon")) for a in aliases],
                             ["@mipmap/ic_launcher","@mipmap/ic_launcher_classic","@mipmap/ic_launcher_openwrt"])
            self.assertEqual(application.find("activity").findall("intent-filter")[0]
                             .find("action").get(A("name")), "some.other.ACTION")
            for alias in aliases:
                launch = alias.find("intent-filter")
                self.assertEqual(launch.find("action").get(A("name")), "android.intent.action.MAIN")
                self.assertEqual(launch.find("category").get(A("name")), "android.intent.category.LAUNCHER")
            with self.assertRaises(RuntimeError):
                patch(native, ROOT / "native")


if __name__ == "__main__":
    unittest.main()
