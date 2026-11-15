package com.aurora.assistant;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.service.voice.VoiceInteractionSession;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.content.ContextCompat;

/** User-initiated assistant voice capture. Transcript is handed to AURORA for review, not auto-submitted. */
public class AuroraVoiceInteractionSession extends VoiceInteractionSession {
    private SpeechRecognizer recognizer;
    private TextView status;
    private Button voiceButton;

    public AuroraVoiceInteractionSession(Context context) { super(context); }

    @Override public View onCreateContentView() {
        Context context = getContext();
        LinearLayout panel = new LinearLayout(context);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(22);
        panel.setPadding(pad, pad, pad, pad);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.rgb(19, 20, 32));
        bg.setCornerRadius(dp(24));
        panel.setBackground(bg);

        TextView title = new TextView(context);
        title.setText("AURORA");
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        panel.addView(title, new LinearLayout.LayoutParams(-1, -2));

        status = new TextView(context);
        status.setText("Your Android assistant is ready.");
        status.setTextColor(Color.rgb(220, 222, 235));
        status.setTextSize(14);
        status.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-1, -2);
        statusParams.topMargin = dp(10);
        panel.addView(status, statusParams);

        voiceButton = new Button(context);
        voiceButton.setText("Start voice input");
        LinearLayout.LayoutParams voiceParams = new LinearLayout.LayoutParams(-1, -2);
        voiceParams.topMargin = dp(16);
        panel.addView(voiceButton, voiceParams);
        voiceButton.setOnClickListener(v -> startVoiceInput());

        Button open = new Button(context);
        open.setText("Open AURORA");
        LinearLayout.LayoutParams openParams = new LinearLayout.LayoutParams(-1, -2);
        openParams.topMargin = dp(8);
        panel.addView(open, openParams);
        open.setOnClickListener(v -> openAurora(null));
        return panel;
    }

    private void startVoiceInput() {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            if (status != null) status.setText("Enable microphone permission in AURORA first, then try voice input again.");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            if (status != null) status.setText("Android speech recognition is unavailable on this device.");
            return;
        }
        stopRecognizer();
        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { updateStatus("Listening…"); }
                @Override public void onBeginningOfSpeech() { updateStatus("Listening…"); }
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() { updateStatus("Processing speech…"); }
                @Override public void onError(int error) { updateStatus("Voice input stopped. You can try again."); stopRecognizer(); }
                @Override public void onResults(Bundle results) {
                    java.util.ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String transcript = matches == null || matches.isEmpty() ? "" : matches.get(0).trim();
                    stopRecognizer();
                    if (transcript.isEmpty()) { updateStatus("No words were recognized. Try again."); return; }
                    getContext().getSharedPreferences("aurora_assistant", Context.MODE_PRIVATE)
                        .edit().putString("assistant_session_query", transcript).apply();
                    updateStatus("Transcript ready. Opening AURORA for your review.");
                    openAurora(transcript);
                }
                @Override public void onPartialResults(Bundle partialResults) {}
                @Override public void onEvent(int eventType, Bundle params) {}
            });
            Intent request = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            request.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            request.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-GB");
            request.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(request);
        } catch (Exception error) {
            stopRecognizer();
            updateStatus("Could not start Android voice input.");
        }
    }

    private void openAurora(String transcript) {
        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.setAction("com.aurora.assistant.OPEN_PULSE");
        if (transcript != null && !transcript.trim().isEmpty()) intent.putExtra("aurora_assistant_query", transcript);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        getContext().startActivity(intent);
        finish();
    }

    private void updateStatus(String text) {
        if (status != null) status.post(() -> status.setText(text));
    }

    private void stopRecognizer() {
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    @Override public void onHide() { stopRecognizer(); super.onHide(); }
    @Override public void onDestroy() { stopRecognizer(); super.onDestroy(); }
    private int dp(int value) { return (int) (value * getContext().getResources().getDisplayMetrics().density + 0.5f); }
}
