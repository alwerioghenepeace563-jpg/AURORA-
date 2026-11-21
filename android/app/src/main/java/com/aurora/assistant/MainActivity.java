package com.aurora.assistant;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String ACTION_OPEN_PULSE = "com.aurora.assistant.OPEN_PULSE";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AuroraAssistantPlugin.class);
        registerPlugin(AuroraTranscriptionPlugin.class);
        registerPlugin(AuroraSecureStoragePlugin.class);
        registerPlugin(AuroraReminderPlugin.class);
        registerPlugin(AuroraPredictivePlugin.class);
        registerPlugin(AuroraNearbyPlugin.class);
        registerPlugin(AuroraLocationPlugin.class);
        registerPlugin(AuroraScreenCapturePlugin.class);
        registerPlugin(AuroraNfcPlugin.class);
        createAuroraCallNotificationChannel();
        persistAssistantLaunch(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        persistAssistantLaunch(intent);
    }

    private void createAuroraCallNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            "aurora_calls", "AURORA calls", NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Incoming AURORA reminders and internal calls");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    private void persistAssistantLaunch(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_ASSIST.equals(action) || ACTION_OPEN_PULSE.equals(action)) {
            SharedPreferences preferences = getSharedPreferences("aurora_assistant", MODE_PRIVATE);
            preferences.edit().putBoolean("pulse_open_requested", true).commit();
        }
    }
}
