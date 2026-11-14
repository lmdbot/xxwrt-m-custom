#!/usr/bin/env python3
"""One native inset owner + theme-aware system-bar protection for Android 15/16.

Capacitor's SystemBars backgroundColor is unavailable on Android 15+.
We preserve the successful native WindowInsets layout and add a tiny native
Capacitor bridge that updates the decor/content background and icon contrast
whenever the Vue light/dark preference changes. No hardcoded status bar height.
"""
from pathlib import Path

android = Path(__file__).resolve().parents[1] / "android"
matches = list(android.glob("app/src/main/java/**/MainActivity.java"))
if len(matches) != 1:
    raise SystemExit(f"Expected exactly one generated MainActivity.java, got {len(matches)}")
main = matches[0]
source = main.read_text(encoding="utf-8")
if "extends BridgeActivity" not in source:
    raise SystemExit("Unexpected Capacitor activity class")
if "setOnApplyWindowInsetsListener" in source:
    raise SystemExit("Generated native activity was already patched")

start = source.find("package ")
end = source.find(";", start)
if start < 0 or end < 0:
    raise SystemExit("Cannot determine app Java package")
package = source[start:end+1]

main.write_text(
    package + """

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UiChromePlugin.class);
        registerPlugin(ApkDownloaderPlugin.class);
        super.onCreate(savedInstanceState);
        // Lock the app UI to the device's normal 1x density. Preserve scroll,
        // touch controls, and accessibility text-size settings.
        if (getBridge() != null && getBridge().getWebView() != null) {
            final android.webkit.WebSettings webSettings =
                getBridge().getWebView().getSettings();
            webSettings.setSupportZoom(false);
            webSettings.setBuiltInZoomControls(false);
            webSettings.setDisplayZoomControls(false);
        }
        // Insets are applied exactly once at the native content root.
        final View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            final Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
    }
}
""",
    encoding="utf-8"
)

plugin = main.with_name("UiChromePlugin.java")
plugin.write_text(
    package + """

import android.graphics.Color;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "UiChrome")
public class UiChromePlugin extends Plugin {
    @PluginMethod
    public void setTheme(PluginCall call) {
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            // The inset area belongs to Android, not the WebView's CSS.
            // Paint the root/decor behind the transparent system status bar.
            final int color = Color.parseColor(dark ? "#11141B" : "#F5F6FB");
            final Window window = getActivity().getWindow();
            window.getDecorView().setBackgroundColor(color);
            final View content = getActivity().findViewById(android.R.id.content);
            if (content != null) content.setBackgroundColor(color);

            final WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
            // In Android terminology appearanceLightStatusBars(true) means
            // DARK icons for a LIGHT background; the inverse for dark mode.
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }
}
""",
    encoding="utf-8"
)

print("Patched native insets and created", plugin)


# Send APK downloads to Android's system DownloadManager, not to JavaScript memory.
download_plugin = main.with_name("ApkDownloaderPlugin.java")
download_plugin.write_text(
    package + """
import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ApkDownloader")
public class ApkDownloaderPlugin extends Plugin {
    @PluginMethod
    public void download(PluginCall call) {
        final String rawUrl = call.getString("url");
        final String filename = call.getString("filename");
        if (rawUrl == null || filename == null) {
            call.reject("Missing APK download URL or filename");
            return;
        }
        final Uri uri = Uri.parse(rawUrl);
        final boolean officialSource = "https".equalsIgnoreCase(uri.getScheme())
            && "github.com".equalsIgnoreCase(uri.getHost())
            && uri.getPort() == -1
            && uri.getPath() != null
            && uri.getPath().startsWith("/lmdbot/xxwrt-m-custom/releases/download/");
        final boolean officialApk = filename.startsWith("XX-WRT-M-Material-QWRT-v")
            && filename.matches("[A-Za-z0-9._-]+[.]apk")
            && uri.getLastPathSegment() != null
            && filename.equals(uri.getLastPathSegment());
        if (!officialSource || !officialApk) {
            call.reject("Untrusted APK download destination");
            return;
        }
        try {
            final DownloadManager manager = (DownloadManager)
                getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                call.reject("Android DownloadManager is unavailable");
                return;
            }
            final DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setTitle(filename);
            request.setDescription("XX-WRT Material GitHub Release");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            final long id = manager.enqueue(request);
            final JSObject result = new JSObject();
            result.put("downloadId", String.valueOf(id));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to schedule APK download", error);
        }
    }
}
""",
    encoding="utf-8"
)
print("Created", download_plugin)
