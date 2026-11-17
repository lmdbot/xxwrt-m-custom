package __PACKAGE__;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android only: preinstalled launcher aliases, and user-approved pinned custom shortcuts.
 * Uploaded images cannot replace the installed package's launcher icon at runtime.
 */
@CapacitorPlugin(name = "LauncherIcon")
public class LauncherIconPlugin extends Plugin {
    private static final String[] IDS = {"anime", "classic", "openwrt"};
    private static final String[] ALIASES = {"LauncherAnime", "LauncherClassic", "LauncherOpenWrt"};
    private static final int MAX_IMAGE_BYTES = 1024 * 1024;

    private ComponentName aliasAt(int index) {
        return new ComponentName(getContext(), getContext().getPackageName() + "." + ALIASES[index]);
    }
    private int currentIndex() {
        PackageManager pm = getContext().getPackageManager();
        for (int i = 0; i < IDS.length; i++) {
            int state = pm.getComponentEnabledSetting(aliasAt(i));
            if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
                (i == 0 && state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT)) return i;
        }
        return 0;
    }
    @PluginMethod
    public void getPreset(PluginCall call) {
        JSObject result = new JSObject();
        result.put("id", IDS[currentIndex()]);
        call.resolve(result);
    }
    @PluginMethod
    public void setPreset(PluginCall call) {
        String selected = call.getString("id", "");
        int index = -1;
        for (int i = 0; i < IDS.length; i++) if (IDS[i].equals(selected)) index = i;
        if (index < 0) { call.reject("未知的预置图标"); return; }
        final int target = index;
        getActivity().runOnUiThread(() -> {
            try {
                PackageManager pm = getContext().getPackageManager();
                // Enabling the replacement before disabling old aliases ensures
                // there is always at least one launchable icon, even on OEM launchers.
                pm.setComponentEnabledSetting(aliasAt(target),
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP);
                for (int i = 0; i < IDS.length; i++) {
                    if (i == target) continue;
                    pm.setComponentEnabledSetting(aliasAt(i),
                        PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                        PackageManager.DONT_KILL_APP);
                }
                JSObject result = new JSObject();
                result.put("id", IDS[target]);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Android 桌面图标切换失败：" + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void pinCustomShortcut(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.reject("Android 8.0 以下不支持固定自定义快捷方式");
            return;
        }
        ShortcutManager manager = getContext().getSystemService(ShortcutManager.class);
        if (manager == null || !manager.isRequestPinShortcutSupported()) {
            call.reject("当前桌面启动器不支持固定自定义快捷方式");
            return;
        }
        String encoded = call.getString("pngBase64", "");
        if (encoded.isEmpty() || encoded.length() > MAX_IMAGE_BYTES * 4 / 3 + 8) {
            call.reject("自定义图标无效或超过大小限制");
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(encoded, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("自定义图标不是有效的 PNG");
            return;
        }
        if (bytes.length < 8 || bytes.length > MAX_IMAGE_BYTES ||
            bytes[0] != (byte)137 || bytes[1] != 80 || bytes[2] != 78 || bytes[3] != 71) {
            call.reject("仅支持小于 1MB 的 PNG 图标");
            return;
        }
        Bitmap decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (decoded == null) { call.reject("无法解码自定义 PNG 图标"); return; }
        Bitmap bitmap = Bitmap.createScaledBitmap(decoded, 192, 192, true);
        Intent launch = new Intent(Intent.ACTION_MAIN);
        launch.setClass(getContext(), MainActivity.class);
        launch.addCategory(Intent.CATEGORY_LAUNCHER);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        ShortcutInfo shortcut = new ShortcutInfo.Builder(getContext(), "xxwrt_custom_icon")
            .setShortLabel("XX-WRT管理器")
            .setLongLabel("XX-WRT管理器 · 自定义图标")
            .setIcon(Icon.createWithBitmap(bitmap))
            .setIntent(launch)
            .build();
        try {
            boolean accepted = manager.requestPinShortcut(shortcut, null);
            if (!accepted) { call.reject("桌面未接受添加快捷方式请求"); return; }
            JSObject response = new JSObject();
            response.put("requested", true);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("添加自定义桌面快捷方式失败：" + error.getMessage());
        }
    }
}
