package com.aurora.assistant;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayInputStream;

public class AuroraResearchBrowserActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private String mode = "browse";
    private String taskId = "";
    private String requestedUrl = "";
    private boolean resultSent = false;
    private final Runnable timeout = () -> finishExtraction(false, "", "", "The research page timed out.");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            super.onCreate(savedInstanceState);
            mode = getIntent() == null ? "extract" : getIntent().getStringExtra("mode");
            taskId = getIntent() == null ? "" : getIntent().getStringExtra("taskId");
            requestedUrl = getIntent() == null ? "" : getIntent().getStringExtra("url");
            finishExtraction(false, requestedUrl, "", "Isolated research browsing requires Android 9 or later.");
            return;
        }
        WebView.setDataDirectorySuffix("aurora_research");
        super.onCreate(savedInstanceState);
        mode = getIntent() == null ? "browse" : getIntent().getStringExtra("mode");
        if (mode == null) mode = "browse";
        requestedUrl = getIntent() == null ? "" : getIntent().getStringExtra("url");
        taskId = getIntent() == null ? "" : getIntent().getStringExtra("taskId");
        if ("clear".equals(mode)) {
            clearIsolatedData();
            return;
        }
        if (!isAllowedUrl(requestedUrl)) {
            finishExtraction(false, requestedUrl, "", "Only public HTTPS pages are allowed.");
            finish();
            return;
        }
        if ("extract".equals(mode)) {
            getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            WindowManager.LayoutParams params = getWindow().getAttributes();
            params.alpha = 0.01f;
            getWindow().setAttributes(params);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
        }
        buildBrowser();
        if ("extract".equals(mode)) handler.postDelayed(timeout, 18000L);
        webView.loadUrl(requestedUrl);
    }

    private void buildBrowser() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.BLACK);
        if (!"extract".equals(mode)) {
            LinearLayout bar = new LinearLayout(this);
            bar.setGravity(Gravity.CENTER_VERTICAL);
            bar.setPadding(16, 12, 12, 12);
            bar.setBackgroundColor(Color.rgb(12, 18, 34));
            TextView title = new TextView(this);
            title.setText("AURORA RESEARCH");
            title.setTextColor(Color.WHITE);
            title.setTextSize(13);
            title.setLetterSpacing(0.12f);
            bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
            Button close = new Button(this);
            close.setText("Close");
            close.setOnClickListener(view -> finish());
            bar.addView(close, new LinearLayout.LayoutParams(-2, -2));
            root.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        }
        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSaveFormData(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(false);
        cookies.setAcceptThirdPartyCookies(webView, false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isAllowedUrl(request.getUrl().toString());
            }
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String resourceUrl = request == null ? "" : request.getUrl().toString();
                String host = request == null ? null : request.getUrl().getHost();
                if (!isAllowedUrl(resourceUrl) || !isPublicHost(host)) {
                    return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                }
                return super.shouldInterceptRequest(view, request);
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                if ("extract".equals(mode)) extractPage();
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if ("extract".equals(mode) && request.isForMainFrame()) {
                    finishExtraction(false, requestedUrl, "", "The research page could not be loaded.");
                }
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    private void extractPage() {
        if (resultSent || webView == null) return;
        String script = "JSON.stringify({title:document.title||'',url:location.href||'',text:(document.body&&document.body.innerText||'').slice(0,12000)})";
        webView.evaluateJavascript(script, value -> {
            try {
                Object decoded = new JSONTokener(value == null ? "null" : value).nextValue();
                JSONObject data = decoded instanceof String ? new JSONObject((String) decoded) : (JSONObject) decoded;
                finishExtraction(true, data.optString("url", requestedUrl), data.optString("title", ""), data.optString("text", ""));
            } catch (Exception error) {
                finishExtraction(false, requestedUrl, "", "The research page could not be extracted.");
            }
        });
    }

    private void finishExtraction(boolean success, String url, String title, String text) {
        if (resultSent) return;
        resultSent = true;
        handler.removeCallbacks(timeout);
        android.content.Intent result = new android.content.Intent(AuroraResearchBrowserPlugin.ACTION_PAGE_RESULT);
        result.setPackage(getPackageName());
        result.putExtra("taskId", taskId);
        result.putExtra("url", url);
        result.putExtra("title", title);
        result.putExtra("text", text);
        result.putExtra("success", success);
        if (!success) result.putExtra("error", text);
        sendBroadcast(result);
        finish();
    }

    private void clearIsolatedData() {
        CookieManager cookies = CookieManager.getInstance();
        cookies.removeAllCookies(ignored -> {
            WebStorage.getInstance().deleteAllData();
            if (webView != null) {
                webView.clearCache(true);
                webView.clearHistory();
                webView.clearFormData();
                webView.clearSslPreferences();
                webView.destroy();
                webView = null;
            }
            finish();
        });
        handler.postDelayed(this::finish, 2500L);
    }


    private boolean isPublicHost(String host) {
        if (host == null || host.trim().isEmpty()) return false;
        try {
            java.net.InetAddress[] addresses = java.net.InetAddress.getAllByName(host);
            if (addresses == null || addresses.length == 0) return false;
            for (java.net.InetAddress address : addresses) {
                if (address.isAnyLocalAddress() || address.isLoopbackAddress() ||
                    address.isLinkLocalAddress() || address.isSiteLocalAddress() ||
                    address.isMulticastAddress()) return false;
            }
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isAllowedUrl(String value) {
        try {
            Uri uri = Uri.parse(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null) return false;
            String host = uri.getHost();
            if (host == null) return false;
            host = host.toLowerCase(java.util.Locale.ROOT);
            if (host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".local")) return false;
            if (host.equals("::1") || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false;
            if (host.matches("127\\..*") || host.matches("10\\..*") || host.matches("192\\.168\\..*")) return false;
            if (host.matches("172\\.(1[6-9]|2[0-9]|3[0-1])\\..*")) return false;
            return true;
        } catch (Exception ignored) { return false; }
    }

    @Override
    public void onBackPressed() {
        if (!"extract".equals(mode) && webView != null && webView.canGoBack()) webView.goBack();
        else finish();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(timeout);
        if (webView != null) {
            try { webView.stopLoading(); webView.destroy(); } catch (Exception ignored) {}
            webView = null;
        }
        super.onDestroy();
    }
}
