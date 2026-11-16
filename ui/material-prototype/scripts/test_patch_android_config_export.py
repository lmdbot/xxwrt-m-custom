"""Build-time verification of the Android JSON Save As plugin."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("patch_android_config_export",
    HERE / "patch_android_config_export.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class AndroidSnapshotExportPatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.android = Path(self.tmp.name) / "android"
        self.java = self.android / "app/src/main/java/com/lmdbot/app"
        self.java.mkdir(parents=True)
        self.activity = self.java / "MainActivity.java"
        self.activity.write_text(
            "package com.lmdbot.app;\npublic class MainActivity {\n"
            "  void init() { registerPlugin(ApkDownloaderPlugin.class); }\n}\n",
            encoding="utf-8"
        )

    def test_injects_system_save_as_plugin_without_storage_permission(self):
        main, plugin = MODULE.patch(self.android)
        self.assertEqual(main, self.activity)
        self.assertIn("registerPlugin(ConfigFileExportPlugin.class);", main.read_text())
        code = plugin.read_text()
        self.assertIn("package com.lmdbot.app;", code)
        self.assertIn("Intent.ACTION_CREATE_DOCUMENT", code)
        self.assertIn("Intent.CATEGORY_OPENABLE", code)
        self.assertIn("Intent.EXTRA_TITLE", code)
        self.assertIn('openOutputStream(uri, "wt")', code)
        self.assertIn('@ActivityCallback', code)
        self.assertIn('outcome.put("saved", true)', code)
        self.assertIn('outcome.put("cancelled", true)', code)
        self.assertIn('public void saveSystemBackup(PluginCall call)', code)
        self.assertIn('application/gzip', code)
        self.assertIn('origin.resolve("/cgi-bin/cgi-backup")', code)
        self.assertIn('connection.setInstanceFollowRedirects(false)', code)
        self.assertIn('GZIPInputStream', code)
        self.assertIn('getContext().getCacheDir()', code)
        self.assertIn('MAX_TAR_GZ_BYTES', code)
        self.assertNotIn('--restore-backup', code)
        self.assertNotIn('sysupgrade -r', code)
        self.assertNotIn("WRITE_EXTERNAL_STORAGE", code)
        self.assertNotIn("MANAGE_EXTERNAL_STORAGE", code)
        self.assertNotIn("__PACKAGE__", code)

    def test_rejects_repeat_injection(self):
        MODULE.patch(self.android)
        with self.assertRaisesRegex(RuntimeError, "already installed"):
            MODULE.patch(self.android)

    def test_rejects_unexpected_activity(self):
        self.activity.write_text("package com.lmdbot.app;\nclass MainActivity {}\n")
        with self.assertRaisesRegex(RuntimeError, "registration point"):
            MODULE.patch(self.android)


if __name__ == "__main__":
    unittest.main()
