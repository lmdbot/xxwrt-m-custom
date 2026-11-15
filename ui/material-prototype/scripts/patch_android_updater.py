#!/usr/bin/env python3
"""Install the native APK streaming/update plugin into generated Capacitor Android.

Capacitor's android/ tree is generated afresh by Actions, so native code is
version-controlled under native/ and injected after npx cap add/sync.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_RE = re.compile(r"^\s*package\s+([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+)\s*;", re.M)
PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES'


def patch(android: Path = ROOT / "android", native: Path = ROOT / "native"):
    main_activities = list((android / "app/src/main/java").glob("**/MainActivity.java"))
    if len(main_activities) != 1:
        raise RuntimeError(f"Expected one MainActivity.java, got {len(main_activities)}")
    main = main_activities[0]
    current = main.read_text(encoding="utf-8")
    package = PACKAGE_RE.search(current)
    if not package:
        raise RuntimeError("Cannot locate generated Android package")
    if "registerPlugin(ApkDownloaderPlugin.class);" not in current:
        raise RuntimeError("Native updater plugin was not registered in MainActivity")
    if main.with_name("ApkDownloaderPlugin.java").exists():
        raise RuntimeError("Native APK updater already exists in generated app")

    source = (native / "ApkDownloaderPlugin.java").read_text(encoding="utf-8")
    if "package __PACKAGE__;" not in source:
        raise RuntimeError("Native updater package placeholder missing")
    main.with_name("ApkDownloaderPlugin.java").write_text(
        source.replace("package __PACKAGE__;", f"package {package.group(1)};"),
        encoding="utf-8"
    )

    manifest = android / "app/src/main/AndroidManifest.xml"
    xml = manifest.read_text(encoding="utf-8")
    if "<application" not in xml or "</application>" not in xml:
        raise RuntimeError("Unexpected generated AndroidManifest.xml")
    if PERMISSION in xml or 'android:authorities="${applicationId}.updates.fileprovider"' in xml:
        raise RuntimeError("Android update installer manifest already patched")
    xml = xml.replace(
        "<application",
        f'<uses-permission android:name="{PERMISSION}" />\n    <application',
        1
    )
    provider = """
        <!-- Private app cache APKs are shared read-only with Android Package Installer. -->
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.updates.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/xxwrt_update_paths" />
        </provider>
"""
    xml = xml.replace("</application>", provider + "    </application>", 1)
    manifest.write_text(xml, encoding="utf-8")

    config = android / "app/src/main/res/xml/xxwrt_update_paths.xml"
    config.parent.mkdir(parents=True, exist_ok=True)
    if config.exists():
        raise RuntimeError("Update FileProvider paths already exist")
    config.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<paths xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <cache-path name="update_apks" path="updates/" />\n'
        '</paths>\n',
        encoding="utf-8"
    )
    return main, manifest, config


if __name__ == "__main__":
    files = patch()
    for file in files:
        print("Patched native updater:", file)
