package com.aurora.assistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AuroraResearchBrowser")
public class AuroraResearchBrowserPlugin extends Plugin {
    public static final String ACTION_PAGE_RESULT = "com.aurora.assistant.RESEARCH_PAGE_RESULT";
    private BroadcastReceiver resultReceiver;

    @Override
    public void load() {
        resultReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (intent == null) return;
                JSObject event = new JSObject();
                event.put("taskId", intent.getStringExtra("taskId"));
                event.put("url", intent.getStringExtra("url"));
                event.put("title", intent.getStringExtra("title"));
                event.put("text", intent.getStringExtra("text"));
                event.put("success", intent.getBooleanExtra("success", false));
                event.put("error", intent.getStringExtra("error"));
                notifyListeners("researchPageExtracted", event);
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_PAGE_RESULT);
        if (Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(resultReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(resultReceiver, filter);
        }
    }

    @PluginMethod
    public void openResearchBrowser(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject("The isolated research browser requires Android 9 or later.");
            return;
        }
        String url = call.getString("url", "");
        if (!isAllowedUrl(url)) {
            call.reject("Only public HTTPS pages can be opened in the isolated AURORA research browser.");
            return;
        }
        Intent intent = new Intent(getContext(), AuroraResearchBrowserActivity.class);
        intent.putExtra("mode", "browse");
        intent.putExtra("url", url);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject result = new JSObject();
        result.put("opened", true);
        result.put("isolated", true);
        call.resolve(result);
    }

    @PluginMethod
    public void extractResearchPage(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject("The isolated research browser requires Android 9 or later.");
            return;
        }
        String url = call.getString("url", "");
        String taskId = call.getString("taskId", "");
        if (!isAllowedUrl(url) || taskId.trim().isEmpty() || taskId.length() > 100) {
            call.reject("A valid public HTTPS URL and task ID are required.");
            return;
        }
        Intent intent = new Intent(getContext(), AuroraResearchBrowserActivity.class);
        intent.putExtra("mode", "extract");
        intent.putExtra("url", url);
        intent.putExtra("taskId", taskId);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject result = new JSObject();
        result.put("started", true);
        result.put("isolated", true);
        call.resolve(result);
    }

    @PluginMethod
    public void clearResearchData(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject("The isolated research browser requires Android 9 or later.");
            return;
        }
        Intent intent = new Intent(getContext(), AuroraResearchBrowserActivity.class);
        intent.putExtra("mode", "clear");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject result = new JSObject();
        result.put("cleared", true);
        result.put("isolated", true);
        call.resolve(result);
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
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (resultReceiver != null) {
            try { getContext().unregisterReceiver(resultReceiver); } catch (Exception ignored) {}
            resultReceiver = null;
        }
        super.handleOnDestroy();
    }
}
