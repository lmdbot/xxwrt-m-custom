package __PACKAGE__;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/** Save snapshots via Android's system document picker, no storage permission. */
@CapacitorPlugin(name = "ConfigFileExport")
public class ConfigFileExportPlugin extends Plugin {
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final Pattern SAFE_NAME = Pattern.compile(
        "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\\.json$");

    @PluginMethod
    public void save(PluginCall call) {
        final String filename = call.getString("filename", "");
        final String content = call.getString("content", "");
        if (!SAFE_NAME.matcher(filename).matches()) {
            call.reject("JSON 文件名不合法");
            return;
        }
        if (content.isEmpty() || content.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            call.reject("配置快照为空或超过 2MB");
            return;
        }

        final Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        getActivity().runOnUiThread(() -> startActivityForResult(call, intent, "finishSave"));
    }

    @ActivityCallback
    private void finishSave(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null || result.getData().getData() == null) {
            JSObject outcome = new JSObject();
            outcome.put("saved", false);
            outcome.put("cancelled", true);
            call.resolve(outcome);
            return;
        }
        final Uri uri = result.getData().getData();
        final byte[] bytes = call.getString("content", "").getBytes(StandardCharsets.UTF_8);
        // The content provider might be remote or not writable. Resolve only
        // after closing the stream, so the UI never announces a false success.
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (stream == null) throw new IOException("所选文档位置不可写");
            stream.write(bytes);
            stream.flush();
        } catch (Exception failure) {
            // Never log the JSON; it can include PPPoE and Wi-Fi credentials.
            call.reject("无法写入所选位置，请重新选择保存位置", failure);
            return;
        }
        // File descriptor is now closed successfully. Only now confirm save.
        JSObject outcome = new JSObject();
        outcome.put("saved", true);
        outcome.put("cancelled", false);
        call.resolve(outcome);
    }
}
