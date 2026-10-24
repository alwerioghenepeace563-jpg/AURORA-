package com.aurora.assistant;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.service.voice.VoiceInteractionSession;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

public class AuroraVoiceInteractionSession extends VoiceInteractionSession {
    public AuroraVoiceInteractionSession(android.content.Context context) {
        super(context);
    }

    @Override
    public View onCreateContentView() {
        android.content.Context context = getContext();

        context.getSharedPreferences("aurora_assistant", android.content.Context.MODE_PRIVATE)
            .edit()
            .putBoolean("pulse_open_requested", true)
            .apply();

        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("com.aurora.assistant.OPEN_PULSE");
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );

        context.startActivity(intent);
        finish();
        return new View(context);
    }
}
