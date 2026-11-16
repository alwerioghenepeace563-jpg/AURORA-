package com.aurora.assistant;

import android.content.Intent;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.view.View;

public class AuroraVoiceInteractionSession extends VoiceInteractionSession {
    private static final String ACTION_OPEN_PULSE = "com.aurora.assistant.OPEN_PULSE";

    public AuroraVoiceInteractionSession(android.content.Context context) {
        super(context);
    }

    @Override
    public View onCreateContentView() {
        return new View(getContext());
    }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);
        getContext().getSharedPreferences("aurora_assistant", android.content.Context.MODE_PRIVATE)
            .edit().putBoolean("pulse_open_requested", true).commit();
        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.setAction(ACTION_OPEN_PULSE);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            startAssistantActivity(intent);
        } finally {
            finish();
        }
    }
}
