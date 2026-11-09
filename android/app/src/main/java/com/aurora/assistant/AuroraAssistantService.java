package com.aurora.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;
import java.util.Locale;

/**
 * Explicitly enabled, user-visible wake-phrase listener.
 * This uses Android's configured speech-recognition provider; it is not a
 * low-power DSP hotword engine. The user can stop it from the persistent
 * notification or from AURORA's controls. It never auto-restarts after process death.
 */
public class AuroraAssistantService extends Service {
    public static final String ACTION_START = "com.aurora.assistant.START";
    public static final String ACTION_STOP = "com.aurora.assistant.STOP";
    private static final String CHANNEL_ID = "aurora_assistant_status";
    private static final int NOTIFICATION_ID = 7401;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private boolean stopping = false;
    private boolean wakeDetected = false;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "AURORA Assistant", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Visible microphone status for the user-enabled Hey AURORA listener.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopListeningAndService();
            return START_NOT_STICKY;
        }
        if (!ACTION_START.equals(action)) return START_NOT_STICKY;
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            stopSelf();
            return START_NOT_STICKY;
        }

        Notification notification = buildNotification("Microphone active · Android speech recognition · tap Stop to end");
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        stopping = false;
        wakeDetected = false;
        getSharedPreferences("aurora_assistant", MODE_PRIVATE)
            .edit().putBoolean("wake_word_listening", true).apply();
        handler.removeCallbacksAndMessages(null);
        handler.post(this::listen);
        return START_NOT_STICKY;
    }

    private Notification buildNotification(String text) {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent openIntent = launch == null ? null : PendingIntent.getActivity(
            this, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)
        );
        Intent stop = new Intent(this, AuroraAssistantService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopIntent = PendingIntent.getService(
            this, 1, stop,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        builder.setContentTitle("AURORA · Hey AURORA")
            .setContentText(text)
            .setSmallIcon(getApplicationInfo().icon)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Stop listening", stopIntent);
        if (openIntent != null) builder.setContentIntent(openIntent);
        return builder.build();
    }

    private void listen() {
        if (stopping || wakeDetected) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            updateNotification("Speech recognition unavailable · tap Stop to end");
            handler.postDelayed(this::listen, 5000);
            return;
        }
        try {
            if (recognizer != null) {
                recognizer.destroy();
                recognizer = null;
            }
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(new RecognitionListener() {
                public void onReadyForSpeech(Bundle bundle) {}
                public void onBeginningOfSpeech() {}
                public void onRmsChanged(float rms) {}
                public void onBufferReceived(byte[] buffer) {}
                public void onEndOfSpeech() {}
                public void onError(int error) {
                    if (!stopping && !wakeDetected) handler.postDelayed(AuroraAssistantService.this::listen, 1500);
                }
                public void onResults(Bundle bundle) { checkForWakePhrase(bundle, true); }
                public void onPartialResults(Bundle bundle) { checkForWakePhrase(bundle, false); }
                public void onEvent(int eventType, Bundle params) {}
            });
            Intent request = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            request.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            request.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.UK.toLanguageTag());
            request.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            request.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            recognizer.startListening(request);
        } catch (Exception error) {
            handler.postDelayed(this::listen, 2500);
        }
    }

    private void checkForWakePhrase(Bundle bundle, boolean finalResult) {
        if (bundle == null || stopping || wakeDetected) return;
        ArrayList<String> alternatives = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (alternatives == null) return;
        for (String candidate : alternatives) {
            String normalized = candidate == null ? "" : candidate.toLowerCase(Locale.UK)
                .replaceAll("[^a-z ]", " ").replaceAll("\\s+", " ").trim();
            if (normalized.contains("hey aurora") || normalized.contains("hey a urora") || normalized.contains("hey orora")) {
                wakeDetected = true;
                stopRecognition();
                getSharedPreferences("aurora_assistant", MODE_PRIVATE)
                    .edit().putBoolean("wake_detected", true).putBoolean("wake_word_listening", false).apply();
                updateNotification("Wake phrase heard · opening AURORA");
                Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
                if (launch != null) {
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    startActivity(launch);
                }
                stopForeground(true);
                stopSelf();
                return;
            }
        }
        if (finalResult && !stopping && !wakeDetected) handler.postDelayed(this::listen, 350);
    }

    private void updateNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(text));
    }

    private void stopRecognition() {
        handler.removeCallbacksAndMessages(null);
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    private void stopListeningAndService() {
        stopping = true;
        getSharedPreferences("aurora_assistant", MODE_PRIVATE)
            .edit().putBoolean("wake_word_listening", false).apply();
        stopRecognition();
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopping = true;
        getSharedPreferences("aurora_assistant", MODE_PRIVATE)
            .edit().putBoolean("wake_word_listening", false).apply();
        stopRecognition();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}