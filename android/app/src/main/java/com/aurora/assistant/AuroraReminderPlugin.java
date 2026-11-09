package com.aurora.assistant;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONObject;
import org.json.JSONArray;
import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;

@CapacitorPlugin(name = "AuroraReminder", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class AuroraReminderPlugin extends Plugin {
    private int requestCode(String id) { return id.hashCode() & 0x7fffffff; }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("granted", true)); return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED;
        if (granted) call.resolve(new JSObject().put("granted", true));
        else call.reject("Notification permission was not granted. You can still use AURORA without reminders.");
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        String id = call.getString("id"), title = call.getString("title"), message = call.getString("message");
        Long at = call.getLong("at");
        if (id == null || id.trim().isEmpty() || id.length() > 80 || title == null || title.trim().isEmpty() || title.length() > 120 || at == null || at <= System.currentTimeMillis() + 5000L || at > System.currentTimeMillis() + 31536000000L) {
            call.reject("Provide an ID, title and a reminder time between 5 seconds and 365 days from now."); return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Allow AURORA notifications in Android settings before scheduling reminders."); return;
        }
        try {
            Intent intent = new Intent(getContext(), AuroraReminderReceiver.class);
            intent.setAction("com.aurora.assistant.REMINDER");
            intent.putExtra("id", id); intent.putExtra("title", title.trim());
            intent.putExtra("message", message == null ? "" : message.trim().substring(0, Math.min(500, message.trim().length())));
            PendingIntent pending = PendingIntent.getBroadcast(getContext(), requestCode(id), intent, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
            AlarmManager alarms = (AlarmManager) getContext().getSystemService(android.content.Context.ALARM_SERVICE);
            if (alarms == null) throw new IllegalStateException("Android alarm service is unavailable.");
            if (Build.VERSION.SDK_INT >= 23) alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
            else alarms.set(AlarmManager.RTC_WAKEUP, at, pending);
            JSONObject saved = new JSONObject();
            saved.put("id", id); saved.put("title", title.trim());
            saved.put("message", message == null ? "" : message.trim().substring(0, Math.min(500, message.trim().length())));
            saved.put("at", at);
            getContext().getSharedPreferences("aurora_reminders", 0).edit().putString(id, saved.toString()).apply();
            JSObject result = new JSObject(); result.put("scheduled", true); result.put("id", id); result.put("at", at); result.put("exact", false);
            call.resolve(result);
        } catch (Exception error) { call.reject("Android could not schedule this reminder.", error); }
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSONArray items = new JSONArray();
        java.util.Map<String, ?> entries = getContext().getSharedPreferences("aurora_reminders", 0).getAll();
        for (java.util.Map.Entry<String, ?> entry : entries.entrySet()) {
            if (!(entry.getValue() instanceof String)) continue;
            try {
                JSONObject saved = new JSONObject((String) entry.getValue());
                JSObject item = new JSObject();
                item.put("id", saved.optString("id", entry.getKey()));
                item.put("title", saved.optString("title", "AURORA reminder"));
                item.put("message", saved.optString("message", ""));
                item.put("at", saved.optLong("at", 0L));
                items.put(item);
            } catch (Exception ignored) {}
        }
        call.resolve(new JSObject().put("items", items));
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.trim().isEmpty() || id.length() > 80) { call.reject("A valid reminder ID is required."); return; }
        Intent intent = new Intent(getContext(), AuroraReminderReceiver.class);
        intent.setAction("com.aurora.assistant.REMINDER");
        PendingIntent pending = PendingIntent.getBroadcast(getContext(), requestCode(id), intent, PendingIntent.FLAG_NO_CREATE | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        boolean cancelled = pending == null;
        if (pending != null) {
            AlarmManager alarms = (AlarmManager) getContext().getSystemService(android.content.Context.ALARM_SERVICE);
            if (alarms != null) alarms.cancel(pending);
            pending.cancel(); cancelled = true;
        }
        getContext().getSharedPreferences("aurora_reminders", 0).edit().remove(id).apply();
        call.resolve(new JSObject().put("cancelled", cancelled));
    }
}
