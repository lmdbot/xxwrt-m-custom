"""Tests for safe retention of published Aliyun update APKs."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("prune_mirror_apks.py")
SPEC = importlib.util.spec_from_file_location("prune_mirror_apks", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PruneMirrorApksTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def add(self, version):
        name = f"XX-WRT-Material-v{version}.apk"
        (self.root / name).write_bytes(b"demo apk")
        return name

    def manifest(self, version):
        name = f"XX-WRT-Material-v{version}.apk"
        (self.root / "version.json").write_text(
            json.dumps({"version": version, "apkName": name}), encoding="utf-8"
        )

    def test_keep_latest_five_by_numeric_version(self):
        for version in ["2.0.1", "2.0.2", "2.0.3", "2.0.4", "2.0.5", "2.0.9", "2.0.10"]:
            self.add(version)
        self.manifest("2.0.10")
        (self.root / "README.txt").write_text("do not delete")
        (self.root / "other.apk").write_bytes(b"keep")
        (self.root / "XX-WRT-Material-v2.0.001.apk").write_bytes(b"keep")
        removed = MODULE.prune_apks(self.root, 5)
        self.assertEqual(set(removed), {
            "XX-WRT-Material-v2.0.1.apk", "XX-WRT-Material-v2.0.2.apk"
        })
        self.assertEqual(len(list(self.root.glob("XX-WRT-Material-v2.0.*.apk"))), 6)
        self.assertTrue((self.root / "README.txt").exists())
        self.assertTrue((self.root / "other.apk").exists())
        self.assertTrue((self.root / "version.json").exists())
        self.assertEqual(MODULE.prune_apks(self.root, 5), [])

    def test_fewer_than_five_never_deleted(self):
        self.add("2.0.19")
        self.add("2.0.20")
        self.manifest("2.0.20")
        self.assertEqual(MODULE.prune_apks(self.root, 5), [])

    def test_never_delete_manifest_current_apk_if_outdated(self):
        for patch in range(1, 8):
            self.add(f"2.0.{patch}")
        self.manifest("2.0.1")
        with self.assertRaisesRegex(ValueError, "older than the newest five"):
            MODULE.prune_apks(self.root, 5)
        self.assertEqual(len(list(self.root.glob("*.apk"))), 7)

    def test_invalid_or_missing_manifest_does_not_delete(self):
        for patch in range(1, 8):
            self.add(f"2.0.{patch}")
        with self.assertRaises(FileNotFoundError):
            MODULE.prune_apks(self.root, 5)
        self.manifest("2.0.8")
        with self.assertRaisesRegex(ValueError, "missing or unsafe"):
            MODULE.prune_apks(self.root, 5)
        self.assertEqual(len(list(self.root.glob("*.apk"))), 7)

    def test_symlink_is_not_followed_or_removed(self):
        self.add("2.0.20")
        self.manifest("2.0.20")
        target = self.root / "other.apk"
        target.write_bytes(b"protected")
        link = self.root / "XX-WRT-Material-v1.0.0.apk"
        link.symlink_to(target)
        self.assertEqual(MODULE.prune_apks(self.root, 5), [])
        self.assertTrue(link.is_symlink())
        self.assertEqual(target.read_bytes(), b"protected")


if __name__ == "__main__":
    unittest.main()
