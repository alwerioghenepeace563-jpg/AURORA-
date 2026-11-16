package com.aurora.assistant;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
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
        persistAssistantLaunch(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        persistAssistantLaunch(intent);
    }

    private void persistAssistantLaunch(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_ASSIST.equals(action) || ACTION_OPEN_PULSE.equals(action)) {
            SharedPreferences preferences = getSharedPreferences("aurora_assistant", MODE_PRIVATE);
            // Commit before the WebView resumes so its Pulse-open poll cannot miss the request.
            preferences.edit().putBoolean("pulse_open_requested", true).commit();
        }
    }
}
