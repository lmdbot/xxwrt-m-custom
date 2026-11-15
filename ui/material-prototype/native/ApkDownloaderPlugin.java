package __PACKAGE__;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "ApkDownloader")
public class ApkDownloaderPlugin extends Plugin {
    private static final long MAX_APK_SIZE = 256L * 1024L * 1024L;
    private static final Pattern APK_NAME = Pattern.compile(
        "^(XX-WRT-Material|XX-WRT-M-Material-QWRT)-v([0-9]+\\.[0-9]+\\.[0-9]+)\\.apk$");
    private static final Pattern SHA256 = Pattern.compile("^[a-f0-9]{64}$");
    private static final String MIRROR = "https://update.12130812.xyz/";
    private static final String RELEASES =
        "https://github.com/lmdbot/xxwrt-m-custom/releases/download/";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean downloading = new AtomicBoolean(false);
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private volatile HttpURLConnection activeConnection;
    private volatile File completedApk;

    private static String validVersion(String filename) {
        if (filename == null) return null;
        final Matcher matcher = APK_NAME.matcher(filename);
        return matcher.matches() ? matcher.group(2) : null;
    }

    private static boolean trustedDownload(String rawUrl, String filename) {
        final String version = validVersion(filename);
        if (version == null || rawUrl == null) return false;
        if (rawUrl.equals(MIRROR + filename))
            return filename.startsWith("XX-WRT-Material-v");
        return rawUrl.equals(RELEASES + "v" + version + "/" + filename);
    }

    private static boolean trustedRedirect(URL url, boolean fromMirror) {
        if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getPort() != -1
                || !url.getUserInfo().isEmpty()) return false;
        final String host = url.getHost().toLowerCase(Locale.ROOT);
        if (fromMirror) return "update.12130812.xyz".equals(host);
        // GitHub Release assets are served through GitHub's signed CDN URLs.
        return host.equals("github.com")
            || host.equals("release-assets.githubusercontent.com")
            || host.equals("objects.githubusercontent.com");
    }

    private HttpURLConnection openTrustedConnection(String initialUrl, boolean fromMirror)
            throws IOException {
        URL current = new URL(initialUrl);
        for (int redirects = 0; redirects <= 5; redirects++) {
            if (!trustedRedirect(current, fromMirror)) throw new IOException("不可信的 APK 重定向地址");
            if (cancelled.get()) throw new IOException("下载已取消");
            HttpURLConnection conn = (HttpURLConnection) current.openConnection();
            activeConnection = conn;
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(12000);
            conn.setReadTimeout(22000);
            conn.setRequestProperty("Accept-Encoding", "identity");
            conn.setRequestProperty("Accept", "application/octet-stream, application/vnd.android.package-archive, */*");
            final int status = conn.getResponseCode();
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                final String location = conn.getHeaderField("Location");
                if (location == null || redirects == 5) {
                    conn.disconnect();
                    throw new IOException("APK 下载重定向过多");
                }
                final URL next = new URL(current, location);
                conn.disconnect();
                current = next;
                continue;
            }
            if (status != HttpURLConnection.HTTP_OK) {
                conn.disconnect();
                throw new IOException("APK 下载失败，HTTP " + status);
            }
            final long length = conn.getContentLengthLong();
            if (length > MAX_APK_SIZE) {
                conn.disconnect();
                throw new IOException("安装包超过 256 MiB 大小限制");
            }
            return conn;
        }
        throw new IOException("APK 下载重定向异常");
    }

    private void progress(long received, long total) {
        final JSObject event = new JSObject();
        event.put("receivedBytes", received);
        event.put("totalBytes", total);
        event.put("percent", total > 0 ? (int) Math.min(100, received * 100 / total) : -1);
        notifyListeners("downloadProgress", event);
    }

    private static String hex(byte[] bytes) {
        final char[] digits = "0123456789abcdef".toCharArray();
        final char[] result = new char[bytes.length * 2];
        for (int index = 0; index < bytes.length; index++) {
            result[index * 2] = digits[(bytes[index] & 255) >>> 4];
            result[index * 2 + 1] = digits[bytes[index] & 15];
        }
        return new String(result);
    }

    private void verifyPackage(File apk, String expectedVersion) throws IOException {
        final PackageInfo info = getContext().getPackageManager().getPackageArchiveInfo(
            apk.getAbsolutePath(), 0);
        if (info == null || !getContext().getPackageName().equals(info.packageName)
                || !expectedVersion.equals(info.versionName)) {
            throw new IOException("安装包不是当前 APP 的对应版本");
        }
        // Android's package installer independently verifies the existing
        // app's signing certificate before accepting an upgrade.
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String rawUrl = call.getString("url");
        final String filename = call.getString("filename");
        final String checksum = call.getString("sha256");
        final Long sizeValue = call.getLong("apkSize");
        final long expectedSize = sizeValue == null ? 0L : sizeValue;
        if (!trustedDownload(rawUrl, filename)) {
            call.reject("安装包来源或文件名不可信");
            return;
        }
        if (expectedSize <= 0 || expectedSize > MAX_APK_SIZE
                || (checksum != null && !SHA256.matcher(checksum).matches())
                || (rawUrl.startsWith(MIRROR) && checksum == null)) {
            call.reject("更新包大小或 SHA-256 信息无效");
            return;
        }
        if (!downloading.compareAndSet(false, true)) {
            call.reject("已有安装包正在下载");
            return;
        }
        cancelled.set(false);
        completedApk = null;
        worker.execute(() -> {
            File temporary = null;
            try {
                final File directory = new File(getContext().getCacheDir(), "updates");
                if (!directory.isDirectory() && !directory.mkdirs())
                    throw new IOException("无法创建更新缓存目录");
                temporary = new File(directory, filename + ".part");
                if (temporary.exists() && !temporary.delete())
                    throw new IOException("无法清理上次未完成的下载");
                final boolean mirror = rawUrl.startsWith(MIRROR);
                final MessageDigest digest = MessageDigest.getInstance("SHA-256");
                final HttpURLConnection connection = openTrustedConnection(rawUrl, mirror);
                long received = 0;
                long lastEvent = 0;
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(temporary)) {
                    final byte[] buffer = new byte[32768];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (cancelled.get()) throw new IOException("下载已取消");
                        received += count;
                        if (received > MAX_APK_SIZE || received > expectedSize)
                            throw new IOException("安装包大小超过预期");
                        output.write(buffer, 0, count);
                        digest.update(buffer, 0, count);
                        final long now = android.os.SystemClock.elapsedRealtime();
                        if (now - lastEvent >= 200) {
                            progress(received, expectedSize);
                            lastEvent = now;
                        }
                    }
                    output.getFD().sync();
                } finally {
                    connection.disconnect();
                    activeConnection = null;
                }
                if (cancelled.get()) throw new IOException("下载已取消");
                if (received != expectedSize) throw new IOException("安装包大小校验失败");
                if (checksum != null && !checksum.equals(hex(digest.digest())))
                    throw new IOException("安装包 SHA-256 校验失败");
                verifyPackage(temporary, validVersion(filename));
                final File target = new File(directory, filename);
                if (target.exists() && !target.delete()) throw new IOException("无法替换旧版缓存");
                if (!temporary.renameTo(target)) throw new IOException("无法保存已验证安装包");
                temporary = null;
                completedApk = target;
                progress(received, expectedSize);
                downloading.set(false);
                getActivity().runOnUiThread(() -> {
                    try {
                        final JSObject result = new JSObject();
                        result.put("status", openInstaller(target));
                        result.put("filename", filename);
                        call.resolve(result);
                    } catch (Exception e) {
                        call.reject("无法打开 Android 安装界面：" + e.getMessage(), e);
                    }
                });
            } catch (Exception error) {
                if (temporary != null && temporary.exists()) temporary.delete();
                downloading.set(false);
                final String msg = error.getMessage();
                call.reject(msg == null ? "APK 下载失败" : msg, error);
            } finally {
                activeConnection = null;
            }
        });
    }

    private String openInstaller(File apk) throws IOException {
        if (!apk.isFile() || !apk.getParentFile().equals(
                new File(getContext().getCacheDir(), "updates")))
            throw new IOException("已下载的安装包不存在");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            final Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(settings);
            return "permissionRequired";
        }
        final Uri uri = FileProvider.getUriForFile(getContext(),
            getContext().getPackageName() + ".updates.fileprovider", apk);
        final Intent installer = new Intent(Intent.ACTION_VIEW);
        installer.setDataAndType(uri, "application/vnd.android.package-archive");
        installer.setClipData(ClipData.newRawUri("XX-WRT APK", uri));
        installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(installer);
        return "installerOpened";
    }

    @PluginMethod
    public void installDownloaded(PluginCall call) {
        final File apk = completedApk;
        if (downloading.get() || apk == null) {
            call.reject("还没有下载完成的安装包");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                final JSObject result = new JSObject();
                result.put("status", openInstaller(apk));
                call.resolve(result);
            } catch (Exception error) {
                call.reject("无法打开安装界面：" + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled.set(true);
        final HttpURLConnection connection = activeConnection;
        if (connection != null) connection.disconnect();
        final JSObject result = new JSObject();
        result.put("cancelled", true);
        call.resolve(result);
    }
}
