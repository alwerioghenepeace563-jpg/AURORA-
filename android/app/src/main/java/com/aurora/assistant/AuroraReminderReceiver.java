package com.aurora.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class AuroraReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL = "aurora_reminders";
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !"com.aurora.assistant.REMINDER".equals(intent.getAction())) return;
        String title = intent.getStringExtra("title"), message = intent.getStringExtra("message");
        if (title == null || title.trim().isEmpty()) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "AURORA reminders", NotificationManager.IMPORTANCE_DEFAULT));
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent open = launch == null ? null : PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL) : new Notification.Builder(context);
        builder.setSmallIcon(context.getApplicationInfo().icon).setContentTitle(title).setContentText(message == null ? "" : message).setAutoCancel(true);
        if (open != null) builder.setContentIntent(open);
        manager.notify(intent.getStringExtra("id") == null ? (int) System.currentTimeMillis() : intent.getStringExtra("id").hashCode(), builder.build());
    }
}
