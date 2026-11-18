package com.aurora.assistant;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.os.RemoteException;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Compatibility recognition endpoint required by Android assistant metadata.
 * It delegates to an installed recognizer outside this package, avoiding recursion.
 * Android 12+ uses its platform recognizer path and ignores this metadata target.
 */
public final class AuroraRecognitionService extends RecognitionService {
    private final Map<Callback, SpeechRecognizer> active = new ConcurrentHashMap<>();

    private interface CallbackCall { void run() throws RemoteException; }
    private void notifyCallback(CallbackCall call) {
        try { call.run(); } catch (RemoteException ignored) {}
    }
    private void reportError(Callback callback, int error) {
        notifyCallback(() -> callback.error(error));
    }

    @Override
    protected void onStartListening(Intent recognizerIntent, Callback callback) {
        if (callback == null) return;
        SpeechRecognizer recognizer = createExternalRecognizer();
        if (recognizer == null) {
            reportError(callback, SpeechRecognizer.ERROR_SERVER);
            return;
        }

        SpeechRecognizer previous = active.put(callback, recognizer);
        destroy(previous);
        recognizer.setRecognitionListener(new RecognitionListener() {
            private void finish() { finishRequest(callback); }

            @Override public void onReadyForSpeech(Bundle params) { notifyCallback(() -> callback.readyForSpeech(params)); }
            @Override public void onBeginningOfSpeech() { notifyCallback(callback::beginningOfSpeech); }
            @Override public void onRmsChanged(float rmsdB) { notifyCallback(() -> callback.rmsChanged(rmsdB)); }
            @Override public void onBufferReceived(byte[] buffer) { notifyCallback(() -> callback.bufferReceived(buffer)); }
            @Override public void onEndOfSpeech() { notifyCallback(callback::endOfSpeech); }
            @Override public void onError(int error) {
                reportError(callback, error);
                finish();
            }
            @Override public void onResults(Bundle results) {
                notifyCallback(() -> callback.results(results));
                finish();
            }
            @Override public void onPartialResults(Bundle partialResults) { notifyCallback(() -> callback.partialResults(partialResults)); }
            @Override public void onEvent(int eventType, Bundle params) {}
        });

        try {
            recognizer.startListening(recognizerIntent == null ? new Intent() : new Intent(recognizerIntent));
        } catch (RuntimeException error) {
            finishRequest(callback);
            reportError(callback, SpeechRecognizer.ERROR_CLIENT);
        }
    }

    @Override
    protected void onStopListening(Callback callback) {
        SpeechRecognizer recognizer = active.get(callback);
        if (recognizer == null) {
            reportError(callback, SpeechRecognizer.ERROR_CLIENT);
            return;
        }
        try {
            recognizer.stopListening();
        } catch (RuntimeException error) {
            finishRequest(callback);
            reportError(callback, SpeechRecognizer.ERROR_CLIENT);
        }
    }

    @Override
    protected void onCancel(Callback callback) {
        finishRequest(callback);
    }

    private SpeechRecognizer createExternalRecognizer() {
        ComponentName preferred = null;
        String configured = Settings.Secure.getString(
            getContentResolver(), Settings.Secure.VOICE_RECOGNITION_SERVICE);
        if (configured != null) preferred = ComponentName.unflattenFromString(configured);

        Intent query = new Intent(RecognitionService.SERVICE_INTERFACE);
        List<ResolveInfo> services = getPackageManager().queryIntentServices(query, PackageManager.MATCH_ALL);
        if (services == null || services.isEmpty()) return null;

        ComponentName selected = null;
        for (ResolveInfo info : services) {
            if (info.serviceInfo == null || getPackageName().equals(info.serviceInfo.packageName)) continue;
            ComponentName candidate = new ComponentName(info.serviceInfo.packageName, info.serviceInfo.name);
            if (preferred != null && preferred.equals(candidate)) {
                selected = candidate;
                break;
            }
            if (selected == null) selected = candidate;
        }
        if (selected == null) return null;
        try {
            return SpeechRecognizer.createSpeechRecognizer(this, selected);
        } catch (RuntimeException error) {
            return null;
        }
    }

    private void finishRequest(Callback callback) {
        destroy(active.remove(callback));
    }

    private void destroy(SpeechRecognizer recognizer) {
        if (recognizer == null) return;
        try { recognizer.cancel(); } catch (RuntimeException ignored) {}
        try { recognizer.destroy(); } catch (RuntimeException ignored) {}
    }

    @Override
    public void onDestroy() {
        for (SpeechRecognizer recognizer : active.values()) destroy(recognizer);
        active.clear();
        super.onDestroy();
    }
}
