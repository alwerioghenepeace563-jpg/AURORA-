package com.aurora.assistant;

import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class AuroraOverlayService extends Service {
    public static final String ACTION_SHOW = "com.aurora.assistant.OVERLAY_SHOW";
    public static final String ACTION_HIDE = "com.aurora.assistant.OVERLAY_HIDE";

    private WindowManager windowManager;
    private WebView orbView;
    private WebView panelView;
    private boolean attached = false;
    private boolean panelAttached = false;

    private int dp(float value) { return (int)(value * getResources().getDisplayMetrics().density + 0.5f); }
    private int overlayType() { return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE; }
    private WebView createOverlayWebView(String assetName) throws Exception {
        WebView view = new WebView(this);
        view.setBackgroundColor(Color.TRANSPARENT);
        view.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        view.setVerticalScrollBarEnabled(false);
        view.setHorizontalScrollBarEnabled(false);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        view.addJavascriptInterface(new OverlayBridge(), "AuroraOverlay");
        String html;
        try (InputStream input = getAssets().open(assetName); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            html = output.toString(StandardCharsets.UTF_8.name());
        }
        view.loadDataWithBaseURL("https://aurora-ten-gold.vercel.app/", html, "text/html", "UTF-8", null);
        return view;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_SHOW : intent.getAction();
        if (ACTION_HIDE.equals(action)) {
            removeOverlay();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!Settings.canDrawOverlays(this)) {
            android.util.Log.w("AURORAOverlay", "Cannot display overlay: draw-over-other-apps permission is missing.");
            reportOverlayStatus(false, "Allow AURORA to display over other apps, then try again.");
            stopSelf();
            return START_NOT_STICKY;
        }
        showOverlay();
        return START_NOT_STICKY;
    }

    private void reportOverlayStatus(boolean shown, String note) {
        Intent status = new Intent("com.aurora.assistant.OVERLAY_STATUS");
        status.setPackage(getPackageName());
        status.putExtra("shown", shown);
        status.putExtra("note", note);
        sendBroadcast(status);
    }

    private void showOverlay() {
        if (attached) { reportOverlayStatus(true, "AURORA Pulse is already running."); return; }
        try {
            windowManager = (WindowManager)getSystemService(WINDOW_SERVICE);
            orbView = createOverlayWebView("aurora_pulse_orb.html");
            panelView = createOverlayWebView("aurora_pulse_panel.html");
            WindowManager.LayoutParams orb = new WindowManager.LayoutParams(dp(76), dp(76), overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT);
            orb.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            orb.y = dp(8);
            orb.setTitle("AURORA Pulse Dynamic Island orb");
            windowManager.addView(orbView, orb);
            WindowManager.LayoutParams panel = new WindowManager.LayoutParams(dp(340), dp(300), overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT);
            panel.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
            panel.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
            panel.y = dp(20);
            panel.setTitle("AURORA Pulse glass chat and tools");
            windowManager.addView(panelView, panel);
            panelView.setVisibility(View.GONE);
            panelAttached = true;
            attached = true;
            reportOverlayStatus(true, "AURORA Pulse orb attached; glass chat and tools open on demand.");
        } catch (Exception error) {
            android.util.Log.e("AURORAOverlay", "Failed to display AURORA Pulse.", error);
            reportOverlayStatus(false, "Android could not display AURORA Pulse: " + (error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage()));
            removeOverlay(); stopSelf();
        }
    }

    private void removeOverlay() {
        if (windowManager != null) {
            if (panelView != null && panelAttached) { try { windowManager.removeView(panelView); } catch (Exception ignored) {} }
            if (orbView != null && attached) { try { windowManager.removeView(orbView); } catch (Exception ignored) {} }
        }
        attached = false; panelAttached = false;
        if (panelView != null) { try { panelView.destroy(); } catch (Exception ignored) {} panelView = null; }
        if (orbView != null) { try { orbView.destroy(); } catch (Exception ignored) {} orbView = null; }
    }

    public class OverlayBridge {
        @JavascriptInterface public void showPanel() { new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> { if (panelView != null) panelView.setVisibility(View.VISIBLE); }); }
        @JavascriptInterface public void hidePanel() { new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> { if (panelView != null) panelView.setVisibility(View.GONE); }); }
        @JavascriptInterface
        public void dismiss() {
            new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                removeOverlay();
                stopSelf();
            });
        }

        @JavascriptInterface
        public String getInstalledApps() {
            JSONArray apps = new JSONArray();
            try {
                PackageManager pm = getPackageManager();
                Intent query = new Intent(Intent.ACTION_MAIN);
                query.addCategory(Intent.CATEGORY_LAUNCHER);
                List<ResolveInfo> resolved = pm.queryIntentActivities(query, 0);
                Map<String, String> unique = new LinkedHashMap<>();

                for (ResolveInfo info : resolved) {
                    if (info.activityInfo == null) continue;
                    String pkg = info.activityInfo.packageName;
                    String name = String.valueOf(info.loadLabel(pm));
                    if (pkg != null && !pkg.trim().isEmpty() &&
                        name != null && !name.trim().isEmpty()) {
                        unique.put(pkg, name);
                    }
                }

                for (Map.Entry<String, String> entry : unique.entrySet()) {
                    JSONObject app = new JSONObject();
                    app.put("name", entry.getValue());
                    app.put("packageName", entry.getKey());
                    apps.put(app);
                }
            } catch (Exception error) {
                android.util.Log.e("AURORAOverlay", "Could not list launchable apps.", error);
            }
            return apps.toString();
        }

        @JavascriptInterface
        public String openApp(String packageName) {
            String requested = packageName == null ? "" : packageName.trim();
            if (requested.isEmpty()) {
                return result(false, "Please specify an installed app.", "");
            }

            try {
                PackageManager pm = getPackageManager();
                Intent launch = pm.getLaunchIntentForPackage(requested);
                if (launch == null) {
                    return result(false, "That app is not available to launch.", "");
                }

                String appName = String.valueOf(
                    pm.getApplicationLabel(pm.getApplicationInfo(requested, 0))
                );
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launch);
                return result(true, "Opening " + appName + ".", appName);
            } catch (Exception error) {
                android.util.Log.e("AURORAOverlay", "Could not open requested app.", error);
                return result(false, "Android could not open that app.", "");
            }
        }

        @JavascriptInterface
        public String searchContacts(String query) {
            JSONArray contacts = new JSONArray();

            if (android.os.Build.VERSION.SDK_INT >= 23 &&
                checkSelfPermission(android.Manifest.permission.READ_CONTACTS)
                    != PackageManager.PERMISSION_GRANTED) {
                return "{\"ok\":false,\"message\":\"Contacts permission is needed. Open AURORA and grant Contacts permission first.\",\"contacts\":[]}";
            }

            if (query == null || query.trim().isEmpty()) {
                return "{\"ok\":false,\"message\":\"Enter a contact name.\",\"contacts\":[]}";
            }

            try (android.database.Cursor cursor = getContentResolver().query(
                android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[] {
                    android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER
                },
                android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?",
                new String[] { "%" + query.trim() + "%" },
                android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            )) {
                if (cursor != null) {
                    int nameCol = cursor.getColumnIndex(
                        android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                    int numberCol = cursor.getColumnIndex(
                        android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER);

                    while (cursor.moveToNext() && contacts.length() < 10) {
                        String name = nameCol >= 0 ? cursor.getString(nameCol) : "";
                        String number = numberCol >= 0 ? cursor.getString(numberCol) : "";

                        if (number == null || number.trim().isEmpty()) continue;

                        JSONObject item = new JSONObject();
                        item.put("name", name == null ? "" : name);
                        item.put("number", number.trim());
                        contacts.put(item);
                    }
                }

                JSONObject response = new JSONObject();
                response.put("ok", true);
                response.put("contacts", contacts);
                return response.toString();
            } catch (Exception error) {
                android.util.Log.e("AURORAOverlay", "Contact search failed.", error);
                return "{\"ok\":false,\"message\":\"Contact search failed.\",\"contacts\":[]}";
            }
        }

        @JavascriptInterface
        public String openDialer(String number) {
            if (number == null || !number.matches("[+0-9() .-]+")
                    || !number.matches(".*[0-9].*")) {
                return result(false, "A valid phone number is required.", "");
            }

            try {
                Intent dial = new Intent(
                    Intent.ACTION_DIAL,
                    android.net.Uri.fromParts("tel", number, null)
                );
                dial.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(dial);
                return result(true, "Phone dialler opened. Confirm the call on your phone.", "");
            } catch (Exception error) {
                android.util.Log.e("AURORAOverlay", "Could not open phone dialler.", error);
                return result(false, "Could not open the phone dialler.", "");
            }
        }
        private String result(boolean opened, String message, String appName) {
            try {
                JSONObject data = new JSONObject();
                data.put("opened", opened);
                data.put("message", message);
                data.put("appName", appName);
                return data.toString();
            } catch (Exception ignored) {
                return "{\"opened\":false,\"message\":\"Native app action failed.\"}";
            }
        }
    }

    @Override
    public void onDestroy() {
        removeOverlay();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
