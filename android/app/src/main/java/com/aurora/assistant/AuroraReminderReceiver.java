package com.aurora.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.app.AlarmManager;
import android.content.SharedPreferences;
import org.json.JSONObject;
import android.os.Build;

public class AuroraReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL = "aurora_reminders";
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            restorePending(context);
            return;
        }
        if (!"com.aurora.assistant.REMINDER".equals(intent.getAction())) return;
        String reminderId = intent.getStringExtra("id");
        if (reminderId != null) context.getSharedPreferences("aurora_reminders", 0).edit().remove(reminderId).apply();
        String title = intent.getStringExtra("title"), message = intent.getStringExtra("message");
        if (title == null || title.trim().isEmpty()) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "AURORA reminder calls", NotificationManager.IMPORTANCE_HIGH);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 450, 250, 450, 900});
            manager.createNotificationChannel(channel);
        }
        String id = intent.getStringExtra("id");
        int notificationId = id == null ? (int) System.currentTimeMillis() : id.hashCode();
        Intent callScreen = new Intent(context, AuroraReminderCallActivity.class);
        callScreen.putExtra("id", id);
        callScreen.putExtra("title", title);
        callScreen.putExtra("message", message == null ? "" : message);
        callScreen.putExtra("notificationId", notificationId);
        PendingIntent open = PendingIntent.getActivity(context, notificationId, callScreen,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL) : new Notification.Builder(context);
        builder.setSmallIcon(context.getApplicationInfo().icon).setContentTitle("AURORA reminder call")
            .setContentText(title).setSubText(message == null ? "" : message)
            .setCategory(Notification.CATEGORY_ALARM).setPriority(Notification.PRIORITY_HIGH)
            .setVibrate(new long[]{0, 450, 250, 450, 900}).setContentIntent(open).setAutoCancel(true);
        manager.notify(notificationId, builder.build());
    }

    private void restorePending(Context context) {
        SharedPreferences preferences = context.getSharedPreferences("aurora_reminders", 0);
        java.util.Map<String, ?> entries = preferences.getAll();
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        SharedPreferences.Editor cleanup = preferences.edit();
        for (java.util.Map.Entry<String, ?> entry : entries.entrySet()) {
            if (!(entry.getValue() instanceof String)) { cleanup.remove(entry.getKey()); continue; }
            try {
                JSONObject saved = new JSONObject((String) entry.getValue());
                long at = saved.optLong("at", 0L);
                if (at <= System.currentTimeMillis()) { cleanup.remove(entry.getKey()); continue; }
                Intent reminder = new Intent(context, AuroraReminderReceiver.class);
                reminder.setAction("com.aurora.assistant.REMINDER");
                reminder.putExtra("id", saved.optString("id", entry.getKey()));
                reminder.putExtra("title", saved.optString("title", "AURORA reminder"));
                reminder.putExtra("message", saved.optString("message", ""));
                PendingIntent pending = PendingIntent.getBroadcast(context, entry.getKey().hashCode() & 0x7fffffff, reminder,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
                if (Build.VERSION.SDK_INT >= 23) alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
                else alarms.set(AlarmManager.RTC_WAKEUP, at, pending);
            } catch (Exception error) { cleanup.remove(entry.getKey()); }
        }
        cleanup.apply();
    }
}
