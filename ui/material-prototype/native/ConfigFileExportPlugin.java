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

    private static final long MAX_TAR_GZ_BYTES = 64L * 1024L * 1024L;
    private static final long MAX_EXPANDED_BYTES = 256L * 1024L * 1024L;
    private static final Pattern SYSTEM_BACKUP_NAME = Pattern.compile(
        "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\\.tar\\.gz$");
    private static final Pattern RPC_SESSION = Pattern.compile("^[0-9a-fA-F]{32}$");

    private static java.net.URI validatedOrigin(String rawOrigin) throws IOException {
        try {
            java.net.URI origin = new java.net.URI(rawOrigin);
            String scheme = origin.getScheme();
            String path = origin.getRawPath();
            if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                    || origin.getHost() == null || origin.getRawUserInfo() != null
                    || origin.getRawQuery() != null || origin.getRawFragment() != null
                    || (path != null && !path.isEmpty() && !"/".equals(path)))
                throw new IOException("路由器地址不合法");
            return origin;
        } catch (java.net.URISyntaxException | IllegalArgumentException error) {
            throw new IOException("路由器地址不合法");
        }
    }

    /** The standard LuCI form POSTs sessionid to cgi-backup; no shell commands. */
    @PluginMethod
    public void saveSystemBackup(PluginCall call) {
        String filename = call.getString("filename", "");
        String session = call.getString("session", "");
        String origin = call.getString("origin", "");
        if (!SYSTEM_BACKUP_NAME.matcher(filename).matches()
                || !RPC_SESSION.matcher(session).matches()) {
            call.reject("系统备份文件名或登录会话无效");
            return;
        }
        try { validatedOrigin(origin); }
        catch (IOException error) { call.reject(error.getMessage()); return; }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/gzip");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        getActivity().runOnUiThread(() -> startActivityForResult(call, intent, "finishSystemBackup"));
    }

    @ActivityCallback
    private void finishSystemBackup(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null || result.getData().getData() == null) {
            JSObject outcome = new JSObject();
            outcome.put("saved", false);
            outcome.put("cancelled", true);
            call.resolve(outcome);
            return;
        }
        final Uri target = result.getData().getData();
        new Thread(() -> {
            java.io.File privateTemp = null;
            try {
                privateTemp = java.io.File.createTempFile("xxwrt_backup_", ".tar.gz",
                    getContext().getCacheDir());
                long bytes = downloadLuCiSystemBackup(
                    call.getString("origin", ""), call.getString("session", ""),
                    Boolean.TRUE.equals(call.getBoolean("ignoreTlsErrors", false)), privateTemp);
                verifyGzipArchive(privateTemp);
                try (java.io.InputStream source = new java.io.FileInputStream(privateTemp);
                     OutputStream destination = getContext().getContentResolver().openOutputStream(target, "wt")) {
                    if (destination == null) throw new IOException("所选保存位置不支持写入");
                    byte[] buffer = new byte[16384];
                    int length;
                    while ((length = source.read(buffer)) != -1)
                        destination.write(buffer, 0, length);
                    destination.flush();
                }
                JSObject outcome = new JSObject();
                outcome.put("saved", true);
                outcome.put("cancelled", false);
                outcome.put("bytes", bytes);
                call.resolve(outcome);
            } catch (Exception error) {
                // The system picker may have created an empty/incomplete file.
                try {
                    android.provider.DocumentsContract.deleteDocument(
                        getContext().getContentResolver(), target);
                } catch (Exception ignored) {
                    // Some document providers do not support deletion.
                }
                String message = error instanceof IOException && error.getMessage() != null
                    ? error.getMessage() : "系统备份生成或保存失败，请检查连接和路由器权限";
                // Do not log the archive or the session credential.
                call.reject(message);
            } finally {
                if (privateTemp != null && privateTemp.exists()) privateTemp.delete();
            }
        }, "xxwrt-native-config-backup").start();
    }

    private long downloadLuCiSystemBackup(String rawOrigin, String session,
            boolean allowSelfSignedForSelectedRouter, java.io.File output) throws IOException {
        java.net.URI origin = validatedOrigin(rawOrigin);
        if (allowSelfSignedForSelectedRouter && !"https".equalsIgnoreCase(origin.getScheme()))
            throw new IOException("只允许 HTTPS 路由器启用证书例外");
        java.net.HttpURLConnection connection = null;
        try {
            java.net.URL endpoint = origin.resolve("/cgi-bin/cgi-backup").toURL();
            connection = (java.net.HttpURLConnection) endpoint.openConnection();
            // The certificate exception is scoped to this single HTTPS connection.
            if (allowSelfSignedForSelectedRouter) {
                if (!(connection instanceof javax.net.ssl.HttpsURLConnection))
                    throw new IOException("证书例外仅限 HTTPS 路由器");
                javax.net.ssl.X509TrustManager chosenRouterTrust =
                    new javax.net.ssl.X509TrustManager() {
                        public void checkClientTrusted(java.security.cert.X509Certificate[] chain,
                                String authType) {}
                        public void checkServerTrusted(java.security.cert.X509Certificate[] chain,
                                String authType) {}
                        public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                            return new java.security.cert.X509Certificate[0];
                        }
                    };
                try {
                    javax.net.ssl.SSLContext ssl = javax.net.ssl.SSLContext.getInstance("TLS");
                    ssl.init(null, new javax.net.ssl.TrustManager[]{chosenRouterTrust},
                        new java.security.SecureRandom());
                    javax.net.ssl.HttpsURLConnection secure =
                        (javax.net.ssl.HttpsURLConnection) connection;
                    secure.setSSLSocketFactory(ssl.getSocketFactory());
                    secure.setHostnameVerifier((host, handshake) ->
                        host.equalsIgnoreCase(origin.getHost()));
                } catch (java.security.GeneralSecurityException error) {
                    throw new IOException("无法初始化所选路由器的 TLS 连接");
                }
            }
            connection.setInstanceFollowRedirects(false); // Never leak RPC session to redirects.
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(180000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Accept", "application/gzip, application/octet-stream, */*");
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            connection.setRequestProperty("Accept-Encoding", "identity");
            byte[] request = ("sessionid=" + session).getBytes(StandardCharsets.US_ASCII);
            connection.setFixedLengthStreamingMode(request.length);
            try (OutputStream body = connection.getOutputStream()) {
                body.write(request);
            }
            int status = connection.getResponseCode();
            if (status == 401 || status == 403)
                throw new IOException("路由器拒绝系统备份：登录会话失效或缺少 cgi-backup 权限");
            if (status == 404)
                throw new IOException("路由器没有提供 cgi-backup 接口，请检查 LuCI 或反向代理");
            if (status != 200)
                throw new IOException("路由器系统备份接口返回 HTTP " + status);
            long total = 0;
            try (java.io.InputStream input = new java.io.BufferedInputStream(connection.getInputStream());
                 OutputStream privateOutput = new java.io.FileOutputStream(output)) {
                byte[] chunk = new byte[16384];
                int count;
                while ((count = input.read(chunk)) != -1) {
                    total += count;
                    if (total > MAX_TAR_GZ_BYTES)
                        throw new IOException("系统备份超过 64MB 上限，已中止导出");
                    privateOutput.write(chunk, 0, count);
                }
            }
            if (total < 100)
                throw new IOException("路由器返回的备份文件为空或不完整");
            return total;
        } catch (javax.net.ssl.SSLHandshakeException error) {
            throw new IOException("路由器 HTTPS 证书校验失败，请检查证书设置");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** Read through the gzip footer to validate CRC and catch truncated transfer. */
    private void verifyGzipArchive(java.io.File file) throws IOException {
        try (java.io.InputStream check = new java.io.FileInputStream(file)) {
            if (check.read() != 0x1f || check.read() != 0x8b || check.read() != 0x08)
                throw new IOException("返回内容不是 tar.gz（可能是登录错误页面）");
        }
        long inflated = 0;
        byte[] chunk = new byte[16384];
        try (java.util.zip.GZIPInputStream gzip = new java.util.zip.GZIPInputStream(
                new java.io.BufferedInputStream(new java.io.FileInputStream(file)))) {
            int count;
            while ((count = gzip.read(chunk)) != -1) {
                inflated += count;
                if (inflated > MAX_EXPANDED_BYTES)
                    throw new IOException("解压数据超过 256MB 安全上限");
            }
        } catch (java.util.zip.ZipException error) {
            throw new IOException("gzip 完整性校验失败，拒绝保存损坏的备份");
        }
        if (inflated < 512)
            throw new IOException("返回内容不符合 tar 归档的最小长度");
    }
}
