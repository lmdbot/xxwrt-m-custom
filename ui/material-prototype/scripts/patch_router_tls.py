#!/usr/bin/env python3
"""Inject a per-request Android HTTPS transport for explicitly trusted routers.

This is only called by RouterClient when the user opted into ignoring an HTTPS
router's certificate errors. Normal CapacitorHttp requests keep standard TLS
validation. No Android/global X509 trust manager is modified.
"""
from pathlib import Path

android = Path(__file__).resolve().parents[1] / "android"
matches = list(android.glob("app/src/main/java/**/MainActivity.java"))
if len(matches) != 1:
    raise SystemExit("Expected exactly one MainActivity")
main = matches[0]
src = main.read_text(encoding="utf-8")
if "registerPlugin(UiChromePlugin.class);" not in src:
    raise SystemExit("Run patch_android_insets.py first")
if "registerPlugin(RouterTlsHttpPlugin.class);" in src:
    raise SystemExit("RouterTlsHttp already registered")
main.write_text(src.replace(
    "registerPlugin(ApkDownloaderPlugin.class);",
    "registerPlugin(ApkDownloaderPlugin.class);\n"
    "        registerPlugin(RouterTlsHttpPlugin.class);",
    1
), encoding="utf-8")

package = src.split(";", 1)[0] + ";"
java = main.with_name("RouterTlsHttpPlugin.java")
java.write_text(package + r"""

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.List;
import java.util.Map;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/** Restricted HTTPS transport: no redirects; only /ubus and LuCI endpoints. */
@CapacitorPlugin(name = "RouterTlsHttp")
public class RouterTlsHttpPlugin extends Plugin {
    private static final int MAX_BYTES = 2 * 1024 * 1024;

    private static final X509TrustManager TRUST_FOR_SELECTED_ROUTER = new X509TrustManager() {
        @Override public void checkClientTrusted(X509Certificate[] chain, String authType) {}
        @Override public void checkServerTrusted(X509Certificate[] chain, String authType) {}
        @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
    };

    @PluginMethod
    public void request(PluginCall call) {
        final String rawUrl = call.getString("url", "");
        final String method = call.getString("method", "");
        final URI parsed;
        try {
            parsed = new URI(rawUrl);
            String path = parsed.getPath();
            boolean allowedPath = "/ubus".equals(path)
                || "/cgi-bin/luci/admin".equals(path)
                || (path != null && path.matches("/cgi-bin/luci/admin/services/shadowsocksr/[a-z_]+"));
            if (!"https".equalsIgnoreCase(parsed.getScheme()) || parsed.getHost() == null
                    || parsed.getRawUserInfo() != null || parsed.getRawFragment() != null
                    || !allowedPath || !("GET".equals(method) || "POST".equals(method))) {
                call.reject("TLS exception is allowed only for a selected router HTTPS RPC endpoint");
                return;
            }
        } catch (Exception e) {
            call.reject("Invalid router HTTPS URL", e);
            return;
        }
        new Thread(() -> {
            HttpsURLConnection connection = null;
            try {
                SSLContext context = SSLContext.getInstance("TLS");
                context.init(null, new TrustManager[] { TRUST_FOR_SELECTED_ROUTER }, new SecureRandom());
                connection = (HttpsURLConnection) new URL(rawUrl).openConnection();
                // Overrides are set on this single request/connection only.
                connection.setSSLSocketFactory(context.getSocketFactory());
                connection.setHostnameVerifier((host, session) -> true);
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(Math.min(30000, Math.max(1000, call.getInt("connectTimeout", 8000))));
                connection.setReadTimeout(Math.min(120000, Math.max(1000, call.getInt("readTimeout", 12000))));
                connection.setRequestMethod(method);
                JSObject headers = call.getObject("headers");
                if (headers != null) {
                    for (String key : new String[] { "Content-Type", "Accept", "Cookie" }) {
                        String value = headers.optString(key, "");
                        if (!value.isEmpty()) connection.setRequestProperty(key, value);
                    }
                }
                if ("POST".equals(method)) {
                    Object body = call.getData().opt("data");
                    byte[] bytes = (body == null || JSONObject.NULL.equals(body) ? "" : body.toString())
                        .getBytes(StandardCharsets.UTF_8);
                    if (bytes.length > MAX_BYTES) {
                        call.reject("Router request body too large");
                        return;
                    }
                    connection.setDoOutput(true);
                    try (OutputStream output = connection.getOutputStream()) {
                        output.write(bytes);
                    }
                }
                int status = connection.getResponseCode();
                InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                ByteArrayOutputStream data = new ByteArrayOutputStream();
                if (input != null) {
                    try (InputStream in = input) {
                        byte[] buffer = new byte[8192];
                        int n;
                        while ((n = in.read(buffer)) != -1) {
                            if (data.size() + n > MAX_BYTES) throw new IllegalStateException("Router response too large");
                            data.write(buffer, 0, n);
                        }
                    }
                }
                JSObject response = new JSObject();
                response.put("status", status);
                response.put("data", new String(data.toByteArray(), StandardCharsets.UTF_8));
                JSObject responseHeaders = new JSObject();
                for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                    if (entry.getKey() != null && entry.getValue() != null) {
                        responseHeaders.put(entry.getKey(), String.join(
                            "Set-Cookie".equalsIgnoreCase(entry.getKey()) ? "; " : ", ", entry.getValue()));
                    }
                }
                response.put("headers", responseHeaders);
                call.resolve(response);
            } catch (Exception error) {
                call.reject("Router HTTPS request failed: " + error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "router-tls-http").start();
    }
}
""", encoding="utf-8")
print("Injected per-router TLS exception bridge:", java)
