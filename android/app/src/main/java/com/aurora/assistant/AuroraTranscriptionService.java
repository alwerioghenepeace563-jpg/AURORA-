package com.aurora.assistant;

import android.app.*;
import android.content.*;
import android.os.Build;

public class AuroraTranscriptionService extends Service {
    public static final String ACTION_START = "com.aurora.assistant.TRANSCRIPTION_START";
    public static final String ACTION_UPDATE = "com.aurora.assistant.TRANSCRIPTION_UPDATE";
    public static final String ACTION_STOP = "com.aurora.assistant.TRANSCRIPTION_STOP";
    private static final String CHANNEL = "aurora_transcription";
    private static final int NOTIFICATION_ID = 2407;

    @Override public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "AURORA transcription", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Progress for audio transcription running in the background");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopForeground(true); stopSelf(); return START_NOT_STICKY;
        }
        String title = intent.getStringExtra("title");
        String message = intent.getStringExtra("message");
        int percent = intent.getIntExtra("percent", 0);
        Notification notification = buildNotification(title, message, percent);
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(NOTIFICATION_ID, notification);
        return START_NOT_STICKY;
    }

    private Notification buildNotification(String title, String message, int percent) {
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("AURORA · Transcribing")
            .setContentText((title == null ? "Audio recording" : title) + " — " + (message == null ? "Working…" : message))
            .setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_PROGRESS);
        if (percent > 0) builder.setProgress(100, percent, false);
        else builder.setProgress(0, 0, true);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            PendingIntent pending = PendingIntent.getActivity(this, 2407, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
            builder.setContentIntent(pending);
        }
        return builder.build();
    }

    @Override public android.os.IBinder onBind(Intent intent) { return null; }
}
