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
 * Android's speech provider is used in short sessions with bounded retries.
 * The persistent notification exposes microphone state and a Stop action.
 * A wake phrase opens Pulse when AURORA is foregrounded; otherwise the user
 * taps the resulting notification to open the app (Android may block background launches).
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
    private boolean restartPending = false;
    private int retryDelayMs = 1500;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "AURORA Assistant", NotificationManager.IMPORTANCE_LOW);
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
            stopSelf(); return START_NOT_STICKY;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            stopSelf(); return START_NOT_STICKY;
        }

        Notification notification = buildNotification("Starting microphone · say Hey AURORA · tap Stop to end");
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        else startForeground(NOTIFICATION_ID, notification);
        stopping = false;
        wakeDetected = false;
        retryDelayMs = 1500;
        getSharedPreferences("aurora_assistant", MODE_PRIVATE).edit()
            .putBoolean("wake_word_listening", false).putBoolean("wake_detected", false).apply();
        handler.removeCallbacksAndMessages(null);
        handler.post(this::listen);
        return START_NOT_STICKY;
    }

    private Notification buildNotification(String text) {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent openIntent = launch == null ? null : PendingIntent.getActivity(this, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Intent stop = new Intent(this, AuroraAssistantService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopIntent = PendingIntent.getService(this, 1, stop,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        boolean wakeNotice = text.startsWith("Wake phrase heard");
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        builder.setContentTitle("AURORA · Hey AURORA").setContentText(text)
            .setSmallIcon(getApplicationInfo().icon).setOngoing(!wakeNotice);
        if (openIntent != null) builder.setContentIntent(openIntent);
        if (!wakeNotice) builder.addAction(android.R.drawable.ic_media_pause, "Stop listening", stopIntent);
        return builder.build();
    }

    private void listen() {
        restartPending = false;
        if (stopping || wakeDetected) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            setListeningState(false);
            updateNotification("Speech recognition unavailable · check Android speech services");
            scheduleListen(5000); return;
        }
        releaseRecognizer(true);
        try {
            if (Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(this))
                recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
            else recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            final SpeechRecognizer active = recognizer;
            active.setRecognitionListener(new RecognitionListener() {
                private boolean isCurrent() { return recognizer == active && !stopping && !wakeDetected; }
                @Override public void onReadyForSpeech(Bundle params) {
                    if (!isCurrent()) return;
                    retryDelayMs = 1500;
                    setListeningState(true);
                    updateNotification("Listening for Hey AURORA · tap Stop to end");
                }
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() { if (isCurrent()) setListeningState(false); }
                @Override public void onError(int error) {
                    if (!isCurrent()) return;
                    setListeningState(false);
                    releaseRecognizer(false);
                    updateNotification("Speech service reconnecting · tap Stop to end");
                    scheduleListen(Math.min(retryDelayMs, 8000));
                    retryDelayMs = Math.min(retryDelayMs * 2, 8000);
                }
                @Override public void onResults(Bundle results) { if (isCurrent()) checkForWakePhrase(results, true); }
                @Override public void onPartialResults(Bundle partialResults) { if (isCurrent()) checkForWakePhrase(partialResults, false); }
                @Override public void onEvent(int eventType, Bundle params) {}
            });
            Intent request = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            request.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            request.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.UK.toLanguageTag());
            request.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, Locale.UK.toLanguageTag());
            request.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
            request.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            request.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            request.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1400L);
            active.startListening(request);
        } catch (Exception error) {
            setListeningState(false);
            releaseRecognizer(false);
            updateNotification("Speech service unavailable · retrying");
            scheduleListen(Math.min(retryDelayMs, 8000));
            retryDelayMs = Math.min(retryDelayMs * 2, 8000);
        }
    }

    private void checkForWakePhrase(Bundle bundle, boolean finalResult) {
        if (bundle == null || stopping || wakeDetected) return;
        ArrayList<String> alternatives = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (alternatives == null) return;
        for (String candidate : alternatives) {
            String normalized = candidate == null ? "" : candidate.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z ]", " ").replaceAll("\\s+", " ").trim();
            if (normalized.contains("hey aurora") || normalized.contains("hey a urora") || normalized.contains("hey orora")) {
                wakeDetected = true;
                setListeningState(false);
                getSharedPreferences("aurora_assistant", MODE_PRIVATE).edit().putBoolean("wake_detected", true).putBoolean("wake_word_listening", false).apply();
                releaseRecognizer(true);
                updateNotification("Wake phrase heard · opening AURORA Pulse");
                // Release the wake-word microphone before Pulse starts its conversational listener.
                stopForeground(true);
                try {
                    Intent pulse = new Intent(this, AuroraOverlayService.class);
                    pulse.setAction(AuroraOverlayService.ACTION_SHOW);
                    pulse.putExtra(AuroraOverlayService.EXTRA_AUTO_LISTEN, true);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(pulse);
                    else startService(pulse);
                } catch (Exception launchError) {
                    android.util.Log.e("AURORAAssistant", "Could not hand wake phrase to Pulse.", launchError);
                    getSharedPreferences("aurora_assistant", MODE_PRIVATE).edit()
                        .putBoolean("wake_detected", false).putString("wake_handoff_error", launchError.getMessage()).apply();
                }
                stopSelf();
                return;
            }
        }
        if (finalResult && !stopping && !wakeDetected) {
            setListeningState(false);
            releaseRecognizer(false);
            scheduleListen(350);
        }
    }

    private void scheduleListen(long delayMs) {
        if (stopping || wakeDetected || restartPending) return;
        restartPending = true;
        handler.postDelayed(this::listen, delayMs);
    }

    private void setListeningState(boolean listening) {
        getSharedPreferences("aurora_assistant", MODE_PRIVATE).edit().putBoolean("wake_word_listening", listening).apply();
    }

    private void updateNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(text));
    }

    private void releaseRecognizer(boolean cancel) {
        SpeechRecognizer current = recognizer;
        recognizer = null;
        if (current != null) {
            if (cancel) try { current.cancel(); } catch (Exception ignored) {}
            try { current.destroy(); } catch (Exception ignored) {}
        }
    }

    private void stopListeningAndService() {
        stopping = true;
        setListeningState(false);
        handler.removeCallbacksAndMessages(null);
        restartPending = false;
        releaseRecognizer(true);
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopping = true;
        handler.removeCallbacksAndMessages(null);
        setListeningState(false);
        releaseRecognizer(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}