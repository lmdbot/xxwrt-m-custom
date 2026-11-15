"""Build-time tests of the generated Android APK updater plumbing."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("patch_android_updater", HERE / "patch_android_updater.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NativeUpdaterPatchTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.android = Path(self.temporary.name) / "android"
        self.java = self.android / "app/src/main/java/com/lmdbot/xxwrt/materialpreview"
        self.java.mkdir(parents=True)
        self.activity = self.java / "MainActivity.java"
        self.activity.write_text(
            "package com.lmdbot.xxwrt.materialpreview;\n"
            "public class MainActivity extends BridgeActivity {\n"
            "  void init(){ registerPlugin(ApkDownloaderPlugin.class); }\n"
            "}\n", encoding="utf-8")
        self.manifest = self.android / "app/src/main/AndroidManifest.xml"
        self.manifest.parent.mkdir(parents=True, exist_ok=True)
        self.manifest.write_text(
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
            '<uses-permission android:name="android.permission.INTERNET" />'
            '<application android:label="XX-WRT管理器"></application></manifest>',
            encoding="utf-8"
        )

    def test_installs_native_plugin_and_packageinstaller_session_callback(self):
        main, manifest, receiver = MODULE.patch(self.android)
        self.assertEqual(main, self.activity)
        java = main.with_name("ApkDownloaderPlugin.java").read_text(encoding="utf-8")
        receiver_java = receiver.read_text(encoding="utf-8")
        self.assertIn("package com.lmdbot.xxwrt.materialpreview;", java)
        self.assertIn("package com.lmdbot.xxwrt.materialpreview;", receiver_java)
        self.assertNotIn("__PACKAGE__", java + receiver_java)
        self.assertIn('notifyListeners("downloadProgress", event)', java)
        self.assertIn('verifyPackage(target, validVersion(filename))', java)
        self.assertIn("PackageInstaller.Session", java)
        self.assertIn('session.openWrite("base.apk"', java)
        self.assertIn("session.fsync(output)", java)
        self.assertIn("session.commit(pending.getIntentSender())", java)
        self.assertIn("PendingIntent.FLAG_MUTABLE", java)
        self.assertIn("PackageInstaller.STATUS_PENDING_USER_ACTION", receiver_java)
        self.assertIn("PackageInstaller.EXTRA_STATUS_MESSAGE", receiver_java)
        self.assertNotIn("FileProvider", java + receiver_java)
        self.assertNotIn("DownloadManager", java)
        xml = manifest.read_text(encoding="utf-8")
        self.assertIn("android.permission.REQUEST_INSTALL_PACKAGES", xml)
        self.assertIn('android:name=".ApkInstallStatusReceiver"', xml)
        self.assertIn('android:exported="false"', xml)
        self.assertNotIn('android:grantUriPermissions="true"', xml)
        self.assertNotIn("fileprovider", xml)
        self.assertIn("android.permission.INTERNET", xml)
        root = ET.fromstring(xml)
        receivers = root.findall(".//receiver")
        self.assertEqual(len(receivers), 1)
        self.assertEqual(receivers[0].attrib[
            "{http://schemas.android.com/apk/res/android}name"
        ], ".ApkInstallStatusReceiver")

    def test_refuses_duplicate_patch(self):
        MODULE.patch(self.android)
        with self.assertRaisesRegex(RuntimeError, "already exists"):
            MODULE.patch(self.android)

    def test_requires_plugin_registration(self):
        self.activity.write_text(
            "package com.lmdbot.xxwrt.materialpreview;\npublic class MainActivity {}\n",
            encoding="utf-8"
        )
        with self.assertRaisesRegex(RuntimeError, "was not registered"):
            MODULE.patch(self.android)

    def test_rejects_wrong_package_template(self):
        missing = Path(self.temporary.name) / "native"
        missing.mkdir()
        (missing / "ApkDownloaderPlugin.java").write_text("package com.example.bad;", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "placeholder"):
            MODULE.patch(self.android, missing)


if __name__ == "__main__":
    unittest.main()
