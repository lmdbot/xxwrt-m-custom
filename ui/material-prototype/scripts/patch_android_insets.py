#!/usr/bin/env python3
"""Apply one authoritative Android 15/16 edge-to-edge inset handler.

Capacitor 8 SystemBars with viewport-fit=contain did not reliably avoid the
status-bar overlap on the tested Android 16 device. Disable its automatic
padding in capacitor.config.json and apply systemBars + displayCutout padding
once at the native android.R.id.content root. No hard-coded status bar height.
This patch is intentionally limited to the generated Capacitor Android app.
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
    print("Already patched")
    raise SystemExit(0)

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
        super.onCreate(savedInstanceState);
        // A single native inset owner, never combine with Capacitor CSS/native
        // automatic padding. Keeps app bar, bottom bar and tap targets clear.
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
print("Patched", main)
