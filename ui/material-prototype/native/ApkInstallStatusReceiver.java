package __PACKAGE__;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.util.Log;

/** Receives PackageInstaller's asynchronous result and launches user consent. */
public class ApkInstallStatusReceiver extends BroadcastReceiver {
    static final String ACTION_RESULT = "com.lmdbot.xxwrt.materialpreview.INSTALL_RESULT";
    static final String PREFS = "xxwrt_updater_install";
    static final String LAST_ERROR = "last_install_error";
    private static final String TAG = "XXWRT-ApkInstaller";

    @Override
    public void onReceive(Context context, Intent callback) {
        if (!ACTION_RESULT.equals(callback.getAction())) return;
        final int status = callback.getIntExtra(PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            final Intent confirmation;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                confirmation = callback.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
            } else {
                confirmation = callback.getParcelableExtra(Intent.EXTRA_INTENT);
            }
            if (confirmation == null) {
                recordError(context, "Android 安装器未返回确认界面");
                return;
            }
            try {
                confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(confirmation);
            } catch (Exception failure) {
                recordError(context, "无法打开系统安装确认界面：" + failure.getMessage());
            }
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().remove(LAST_ERROR).apply();
            Log.i(TAG, "App update accepted by Android PackageInstaller");
            return;
        }
        final String detail = callback.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        recordError(context, "Android 安装失败（状态 " + status + "）"
            + (detail == null || detail.isEmpty() ? "" : "：" + detail));
    }

    private static void recordError(Context context, String message) {
        Log.e(TAG, message);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(LAST_ERROR, message).apply();
    }
}
