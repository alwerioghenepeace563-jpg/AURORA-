package com.aurora.assistant;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AuroraAssistantPlugin.class);
        registerPlugin(AuroraTranscriptionPlugin.class);
        registerPlugin(AuroraSecureStoragePlugin.class);
        registerPlugin(AuroraReminderPlugin.class);
        registerPlugin(AuroraPredictivePlugin.class);
        registerPlugin(AuroraNearbyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
