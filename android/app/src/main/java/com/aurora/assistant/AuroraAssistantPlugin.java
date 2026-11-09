package com.aurora.assistant;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.provider.Settings;
import android.net.Uri;
import android.location.Location;
import android.location.LocationManager;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import androidx.core.content.FileProvider;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import androidx.activity.result.ActivityResult;
import android.database.Cursor;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AuroraNative", permissions = { @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }), @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }), @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }), @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }), @Permission(alias = "calendar_read", strings = { Manifest.permission.READ_CALENDAR }), @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }) })
public class AuroraAssistantPlugin extends Plugin {
    private SpeechRecognizer speechRecognizer;
    private TextToSpeech textToSpeech;
    private boolean textToSpeechReady = false;
    private boolean isTrustedUpdateUrl(URL url) {
        if (url == null || !"https".equalsIgnoreCase(url.getProtocol())) return false;
        String host = url.getHost().toLowerCase(java.util.Locale.ROOT);
        return host.equals("github.com") || host.endsWith(".github.com")
            || host.equals("raw.githubusercontent.com")
            || host.endsWith(".githubusercontent.com");
    }

    private boolean isCompatibleSignedUpdate(File apk) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        android.content.pm.PackageInfo candidate;
        android.content.pm.PackageInfo installed;
        if (Build.VERSION.SDK_INT >= 28) {
            candidate = pm.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
            installed = pm.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
            if (candidate == null || installed == null
                || !"com.aurora.assistant".equals(candidate.packageName)
                || candidate.signingInfo == null || installed.signingInfo == null
                || candidate.signingInfo.hasMultipleSigners()
                || installed.signingInfo.hasMultipleSigners()) return false;
            android.content.pm.Signature[] a = candidate.signingInfo.getApkContentsSigners();
            android.content.pm.Signature[] b = installed.signingInfo.getApkContentsSigners();
            return a != null && b != null && a.length == 1 && b.length == 1 && a[0].equals(b[0]);
        }
        candidate = pm.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNATURES);
        installed = pm.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNATURES);
        return candidate != null && installed != null
            && "com.aurora.assistant".equals(candidate.packageName)
            && candidate.signatures != null && installed.signatures != null
            && candidate.signatures.length == 1 && installed.signatures.length == 1
            && candidate.signatures[0].equals(installed.signatures[0]);
    }



    @PluginMethod
    public void hasOverlayPermission(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(getContext());
        call.resolve(new JSObject().put("granted", granted));
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(getContext())) {
            call.resolve(new JSObject().put("opened", false).put("granted", true)); return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true).put("granted", false));
        } catch (Exception e) {
            call.reject("Could not open Android overlay permission settings.", e);
        }
    }

    @PluginMethod
    public void requestCalendarReadPermission(PluginCall call) {
        if (getPermissionState("calendar_read") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("granted", true)); return;
        }
        requestPermissionForAlias("calendar_read", call, "calendarReadPermissionCallback");
    }

    @PermissionCallback
    private void calendarReadPermissionCallback(PluginCall call) {
        call.resolve(new JSObject().put("granted", getPermissionState("calendar_read") == PermissionState.GRANTED));
    }

    @PluginMethod
    public void showOverlay(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(getContext())) {
            call.resolve(new JSObject().put("requested", false).put("shown", false)
                .put("note", "Allow AURORA to display over other apps, then try again."));
            return;
        }
        try {
            Intent intent = new Intent(getContext(), AuroraOverlayService.class);
            intent.setAction(AuroraOverlayService.ACTION_SHOW);
            getContext().startService(intent);
            android.content.SharedPreferences state = getContext().getSharedPreferences("aurora_assistant", 0);
            call.resolve(new JSObject().put("requested", true)
                .put("shown", state.getBoolean("pulse_overlay_shown", false))
                .put("note", state.getString("pulse_overlay_note", "AURORA Pulse launch requested.")));
        } catch (Exception error) {
            call.reject("Android could not start AURORA Pulse.", error);
        }
    }

    @PluginMethod
    public void hideOverlay(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), AuroraOverlayService.class);
            intent.setAction(AuroraOverlayService.ACTION_HIDE);
            getContext().startService(intent);
            call.resolve(new JSObject().put("hidden", true));
        } catch (Exception error) {
            call.reject("Android could not close AURORA Pulse.", error);
        }
    }

    @PluginMethod
    public void getOverlayStatus(PluginCall call) {
        android.content.SharedPreferences state = getContext().getSharedPreferences("aurora_assistant", 0);
        call.resolve(new JSObject()
            .put("shown", state.getBoolean("pulse_overlay_shown", false))
            .put("note", state.getString("pulse_overlay_note", "AURORA Pulse has not been started.")));
    }

    @PluginMethod
    public void requestLocationPermission(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (granted) { call.resolve(new JSObject().put("granted", true)); return; }
        requestPermissionForAlias("location", call, "locationPermissionCallback");
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        call.resolve(new JSObject().put("granted", granted));
    }

    @PluginMethod
    public void requestContactsPermission(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("granted", true)); return;
        }
        requestPermissionForAlias("contacts", call, "contactsPermissionCallback");
    }

    @PermissionCallback
    private void contactsPermissionCallback(PluginCall call) {
        call.resolve(new JSObject().put("granted", getPermissionState("contacts") == PermissionState.GRANTED));
    }

    @PluginMethod
    public void searchContacts(PluginCall call) {
        String query = call.getString("query");
        if (query == null || query.trim().isEmpty() || query.length() > 100) {
            call.reject("Provide a contact search query of 1 to 100 characters."); return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Grant Contacts permission before searching contacts."); return;
        }
        Cursor cursor = null;
        try {
            String[] projection = {
                android.provider.ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER
            };
            String selection = android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ? OR "
                + android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER + " LIKE ?";
            String pattern = "%" + query.trim() + "%";
            cursor = getContext().getContentResolver().query(
                android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection, selection, new String[] { pattern, pattern },
                android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            );
            JSArray contacts = new JSArray();
            int count = 0;
            if (cursor != null) {
                while (cursor.moveToNext() && count < 20) {
                    JSObject item = new JSObject();
                    item.put("id", cursor.getString(cursor.getColumnIndexOrThrow(android.provider.ContactsContract.CommonDataKinds.Phone.CONTACT_ID)));
                    item.put("name", cursor.getString(cursor.getColumnIndexOrThrow(android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)));
                    item.put("number", cursor.getString(cursor.getColumnIndexOrThrow(android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER)));
                    contacts.put(item);
                    count++;
                }
            }
            call.resolve(new JSObject().put("contacts", contacts).put("limit", 20));
        } catch (Exception e) {
            call.reject("Could not search the device contacts.", e);
        } finally {
            if (cursor != null) try { cursor.close(); } catch (Exception ignored) {}
        }
    }

    @PluginMethod
    public void openDialer(PluginCall call) {
        String number = call.getString("number");
        if (number == null || !number.trim().matches("[+0-9(). -]{5,25}")) {
            call.reject("Provide a valid phone number."); return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(number.trim())));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (Exception e) {
            call.reject("Could not open the phone dialler.", e);
        }
    }

    @PluginMethod
    public void startSpeechRecognition(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Grant microphone permission first.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                    call.reject("Android speech recognition is unavailable. Install or enable a speech recognition service, then try again.");
                    return;
                }
                if (speechRecognizer != null) {
                    speechRecognizer.destroy();
                    speechRecognizer = null;
                }
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) { notifyListeners("speechStatus", speechPayload("status", "listening")); }
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() { notifyListeners("speechStatus", speechPayload("status", "processing")); }
                    @Override public void onError(int error) {
                        JSObject errorEvent = new JSObject(); errorEvent.put("code", error); errorEvent.put("message", speechErrorMessage(error)); notifyListeners("speechError", errorEvent);
                        cleanupSpeechRecognizer();
                    }
                    @Override public void onResults(Bundle results) {
                        java.util.ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        String transcript = matches == null || matches.isEmpty() ? "" : matches.get(0);
                        notifyListeners("speechResult", speechPayload("transcript", transcript));
                        cleanupSpeechRecognizer();
                    }
                    @Override public void onPartialResults(Bundle partialResults) {}
                    @Override public void onEvent(int eventType, Bundle params) {}
                });
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-GB");
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-GB");
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                speechRecognizer.startListening(intent);
                call.resolve(speechPayload("started", true));
            } catch (Exception e) {
                cleanupSpeechRecognizer();
                call.reject("Could not start Android speech recognition: " + (e.getMessage() == null ? "unknown error" : e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void stopSpeechRecognition(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            cleanupSpeechRecognizer();
            call.resolve(speechPayload("stopped", true));
        });
    }

    @PluginMethod
    public void speakText(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty() || text.length() > 2500) {
            call.reject("Provide text between 1 and 2500 characters for Android speech.");
            return;
        }
        final String utterance = text.trim();
        getActivity().runOnUiThread(() -> {
            try {
                if (textToSpeech != null && textToSpeechReady) {
                    speakWithAndroidTts(utterance, call);
                    return;
                }
                if (textToSpeech != null) {
                    call.reject("Android speech is still initializing. Try again in a moment.");
                    return;
                }
                textToSpeech = new TextToSpeech(getContext(), status -> {
                    if (status != TextToSpeech.SUCCESS) {
                        textToSpeech = null;
                        call.reject("Android text-to-speech could not initialize. Check the phone's Text-to-speech settings.");
                        return;
                    }
                    textToSpeechReady = true;
                    int language = textToSpeech.setLanguage(java.util.Locale.UK);
                    if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
                        textToSpeech.setLanguage(java.util.Locale.US);
                    }
                    textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) {
                            JSObject event = new JSObject(); event.put("status", "started"); notifyListeners("ttsStatus", event);
                        }
                        @Override public void onDone(String id) {
                            JSObject event = new JSObject(); event.put("status", "done"); notifyListeners("ttsStatus", event);
                        }
                        @Override public void onError(String id) {
                            JSObject event = new JSObject(); event.put("status", "error"); notifyListeners("ttsStatus", event);
                        }
                    });
                    speakWithAndroidTts(utterance, call);
                });
            } catch (Exception error) {
                call.reject("Android text-to-speech failed: " + (error.getMessage() == null ? "unknown error" : error.getMessage()));
            }
        });
    }

    private void speakWithAndroidTts(String text, PluginCall call) {
        String id = "aurora-tts-" + java.util.UUID.randomUUID().toString();
        int result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
        if (result == TextToSpeech.ERROR) {
            call.reject("Android could not start speech. Check the selected system voice.");
            return;
        }
        JSObject response = new JSObject(); response.put("started", true); response.put("engine", "android-tts");
        call.resolve(response);
    }

    @PluginMethod
    public void stopTextSpeech(PluginCall call) {
        try { if (textToSpeech != null) textToSpeech.stop(); } catch (Exception ignored) {}
        call.resolve(new JSObject().put("stopped", true));
    }

    private void cleanupSpeechRecognizer() {
        if (speechRecognizer != null) {
            try { speechRecognizer.cancel(); } catch (Exception ignored) {}
            try { speechRecognizer.destroy(); } catch (Exception ignored) {}
            speechRecognizer = null;
        }
    }

    private JSObject speechPayload(String key, Object value) {
        JSObject payload = new JSObject();
        payload.put(key, value);
        return payload;
    }

    private String speechErrorMessage(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO: return "Audio recording error";
            case SpeechRecognizer.ERROR_CLIENT: return "Recognition cancelled";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "Microphone permission denied";
            case SpeechRecognizer.ERROR_NETWORK: return "Network error";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "Network timeout";
            case SpeechRecognizer.ERROR_NO_MATCH: return "No speech recognized";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "Speech recognizer is busy";
            case SpeechRecognizer.ERROR_SERVER: return "Speech service error";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "No speech detected";
            default: return "Speech recognition error " + error;
        }
    }

    @PluginMethod
    public void requestMicrophonePermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) { JSObject r=new JSObject(); r.put("granted",true); call.resolve(r); return; }
        requestPermissionForAlias("microphone",call,"microphonePermissionCallback");
    }
    @PermissionCallback private void microphonePermissionCallback(PluginCall call) { if(getPermissionState("microphone")!=PermissionState.GRANTED){call.reject("Microphone permission is needed for Hey AURORA. You can deny it and use AURORA normally.");return;} JSObject r=new JSObject();r.put("granted",true);call.resolve(r); }
    @PluginMethod public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) { call.resolve(new JSObject().put("granted", true)); return; }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }
    @PermissionCallback private void notificationPermissionCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) call.resolve(new JSObject().put("granted", true));
        else call.reject("Allow AURORA notifications so the wake-word microphone service can remain visibly active. You can deny this and continue using AURORA normally.");
    }
    @PluginMethod public void consumeWakeWord(PluginCall call) { android.content.SharedPreferences p=getContext().getSharedPreferences("aurora_assistant",0);boolean d=p.getBoolean("wake_detected",false);if(d)p.edit().putBoolean("wake_detected",false).apply();JSObject r=new JSObject();r.put("detected",d);call.resolve(r); }
    @PluginMethod public void consumePulseOpenRequest(PluginCall call) { android.content.SharedPreferences p=getContext().getSharedPreferences("aurora_assistant",0);boolean requested=p.getBoolean("pulse_open_requested",false);if(requested)p.edit().putBoolean("pulse_open_requested",false).apply();JSObject r=new JSObject();r.put("requested",requested);call.resolve(r); }
    @PluginMethod
    public void startAssistantService(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Grant microphone permission first to enable Hey AURORA."); return;
        }
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Allow notifications first so Android can show the active microphone listener and its Stop control."); return;
        }
        Intent intent = new Intent(getContext(), AuroraAssistantService.class);
        intent.setAction(AuroraAssistantService.ACTION_START);
        androidx.core.content.ContextCompat.startForegroundService(getContext(), intent);
        JSObject result = new JSObject();
        result.put("started", true);
        result.put("note", "Hey AURORA wake-word listening is on. Say Hey AURORA to open AURORA hands-free.");
        call.resolve(result);
    }

    @PluginMethod
    public void stopAssistantService(PluginCall call) {
        Intent intent = new Intent(getContext(), AuroraAssistantService.class);
        intent.setAction(AuroraAssistantService.ACTION_STOP);
        getContext().startService(intent);
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null || packageName.trim().isEmpty()) {
            call.reject("packageName is required");
            return;
        }
        PackageManager pm = getContext().getPackageManager();
        Intent launch = pm.getLaunchIntentForPackage(packageName);
        if (launch == null) {
            call.reject("App is not installed or cannot be opened: " + packageName);
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launch);
        JSObject result = new JSObject();
        result.put("opened", true);
        result.put("packageName", packageName);
        call.resolve(result);
    }



    @PluginMethod
    public void prepareSms(PluginCall call) {
        String number = call.getString("number");
        String body = call.getString("body", "");
        if (number == null || !number.trim().matches("[+0-9(). -]{5,25}")) {
            call.reject("Provide a valid phone number for the SMS composer."); return;
        }
        if (body == null || body.length() > 2000) { call.reject("The SMS draft must be 2000 characters or fewer."); return; }
        try {
            Uri uri = Uri.parse("smsto:" + Uri.encode(number.trim()));
            Intent intent = new Intent(Intent.ACTION_SENDTO, uri);
            if (!body.isEmpty()) intent.putExtra("sms_body", body);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject(); result.put("opened", true); call.resolve(result);
        } catch (Exception e) { call.reject("No SMS application could open the message composer.", e); }
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty() || text.length() > 8000) {
            call.reject("Provide text between 1 and 8000 characters to share."); return;
        }
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text);
            Intent chooser = Intent.createChooser(send, "Share with");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            JSObject result = new JSObject(); result.put("opened", true); call.resolve(result);
        } catch (Exception e) { call.reject("Android could not open the share sheet.", e); }
    }

    @PluginMethod
    public void searchOnMap(PluginCall call) {
        String query = call.getString("query");
        if (query == null || query.trim().isEmpty()) { call.reject("A place or address is required."); return; }
        try {
            Uri uri = Uri.parse("geo:0,0?q=" + Uri.encode(query.trim()));
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject(); result.put("opened", true); result.put("query", query.trim()); call.resolve(result);
        } catch (Exception e) { call.reject("No map application could open this search.", e); }
    }

    @PluginMethod
    public void startMapDirections(PluginCall call) {
        String destination = call.getString("destination");
        String mode = call.getString("mode", "driving");
        if (destination == null || destination.trim().isEmpty()) { call.reject("A destination is required."); return; }
        if (!java.util.Arrays.asList("driving", "walking", "bicycling", "transit").contains(mode)) { call.reject("Choose a supported travel mode."); return; }
        try {
            Uri uri = Uri.parse("google.navigation:q=" + Uri.encode(destination.trim()) + "&mode=" + mode.substring(0, 1));
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject(); result.put("opened", true); result.put("destination", destination.trim()); result.put("mode", mode); call.resolve(result);
        } catch (Exception e) { call.reject("Could not hand directions to a map application.", e); }
    }

    @PluginMethod
    public void prepareCalendarEvent(PluginCall call) {
        String title = call.getString("title");
        Long begin = call.getLong("beginTime");
        Long end = call.getLong("endTime");
        if (title == null || title.trim().isEmpty() || begin == null || end == null || end <= begin) {
            call.reject("A title and valid start/end times are required."); return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_INSERT);
            intent.setData(android.provider.CalendarContract.Events.CONTENT_URI);
            intent.putExtra(android.provider.CalendarContract.Events.TITLE, title.trim());
            intent.putExtra(android.provider.CalendarContract.EXTRA_EVENT_BEGIN_TIME, begin);
            intent.putExtra(android.provider.CalendarContract.EXTRA_EVENT_END_TIME, end);
            String description = call.getString("description");
            String location = call.getString("location");
            if (description != null) intent.putExtra(android.provider.CalendarContract.Events.DESCRIPTION, description);
            if (location != null) intent.putExtra(android.provider.CalendarContract.Events.EVENT_LOCATION, location);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject(); result.put("opened", true); result.put("requiresUserSave", true); call.resolve(result);
        } catch (Exception e) { call.reject("Could not open a calendar to review this event.", e); }
    }

    @PluginMethod
    public void searchCalendarEvents(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Grant Calendar permission before searching events."); return;
        }
        String query = call.getString("query", "");
        if (query.length() > 100) { call.reject("Calendar search query must be 100 characters or fewer."); return; }
        Cursor cursor = null;
        try {
            long now = System.currentTimeMillis();
            long horizon = now + (90L * 24L * 60L * 60L * 1000L);
            String selection = android.provider.CalendarContract.Events.DTSTART + " >= ? AND "
                + android.provider.CalendarContract.Events.DTSTART + " <= ?";
            java.util.ArrayList<String> args = new java.util.ArrayList<>();
            args.add(String.valueOf(now)); args.add(String.valueOf(horizon));
            if (query != null && !query.trim().isEmpty()) {
                selection += " AND " + android.provider.CalendarContract.Events.TITLE + " LIKE ?";
                args.add("%" + query.trim() + "%");
            }
            String[] projection = {
                android.provider.CalendarContract.Events._ID,
                android.provider.CalendarContract.Events.TITLE,
                android.provider.CalendarContract.Events.DTSTART,
                android.provider.CalendarContract.Events.DTEND,
                android.provider.CalendarContract.Events.EVENT_LOCATION
            };
            cursor = getContext().getContentResolver().query(
                android.provider.CalendarContract.Events.CONTENT_URI,
                projection, selection, args.toArray(new String[0]),
                android.provider.CalendarContract.Events.DTSTART + " ASC"
            );
            JSArray events = new JSArray();
            int count = 0;
            if (cursor != null) {
                while (cursor.moveToNext() && count < 20) {
                    JSObject item = new JSObject();
                    item.put("id", cursor.getString(cursor.getColumnIndexOrThrow(android.provider.CalendarContract.Events._ID)));
                    item.put("title", cursor.getString(cursor.getColumnIndexOrThrow(android.provider.CalendarContract.Events.TITLE)));
                    item.put("beginTime", cursor.getLong(cursor.getColumnIndexOrThrow(android.provider.CalendarContract.Events.DTSTART)));
                    int endIndex = cursor.getColumnIndex(android.provider.CalendarContract.Events.DTEND);
                    item.put("endTime", endIndex >= 0 && !cursor.isNull(endIndex) ? cursor.getLong(endIndex) : 0L);
                    int locationIndex = cursor.getColumnIndex(android.provider.CalendarContract.Events.EVENT_LOCATION);
                    item.put("location", locationIndex >= 0 ? cursor.getString(locationIndex) : "");
                    events.put(item); count++;
                }
            }
            JSObject result = new JSObject();
            result.put("events", events); result.put("count", count); result.put("limit", 20);
            result.put("windowEnd", horizon); result.put("localOnly", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not read upcoming calendar events.", e);
        } finally {
            if (cursor != null) try { cursor.close(); } catch (Exception ignored) {}
        }
    }

    @PluginMethod
    public void searchMedia(PluginCall call) {
        String query = call.getString("query");
        if (query == null || query.trim().isEmpty()) { call.reject("A song, artist or media title is required."); return; }
        try {
            Intent intent = new Intent(android.provider.MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH);
            intent.putExtra(android.app.SearchManager.QUERY, query.trim());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject(); result.put("opened", true); result.put("query", query.trim()); call.resolve(result);
        } catch (Exception e) { call.reject("No media application could handle this search.", e); }
    }


    @PluginMethod
    public void pickDocument(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "handleDocumentResult");
    }

    @com.getcapacitor.annotation.ActivityCallback
    private void handleDocumentResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult == null || activityResult.getResultCode() != android.app.Activity.RESULT_OK
            || activityResult.getData() == null || activityResult.getData().getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        Uri uri = activityResult.getData().getData();
        try {
            String mimeType = getContext().getContentResolver().getType(uri);
            String displayName = "Selected file";
            try (Cursor cursor = getContext().getContentResolver().query(uri,
                new String[] { android.provider.OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                    if (nameIndex >= 0 && cursor.getString(nameIndex) != null) displayName = cursor.getString(nameIndex);
                }
            }
            JSObject result = new JSObject();
            result.put("cancelled", false);
            result.put("name", displayName);
            result.put("mimeType", mimeType == null ? "application/octet-stream" : mimeType);
            result.put("contentUri", uri.toString());
            boolean textLike = mimeType != null && (mimeType.startsWith("text/")
                || mimeType.equals("application/json") || mimeType.equals("application/xml"));
            if (textLike) {
                try (InputStream input = getContext().getContentResolver().openInputStream(uri);
                     ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    if (input != null) {
                        byte[] buffer = new byte[8192];
                        int count;
                        while ((count = input.read(buffer)) != -1) {
                            if (output.size() + count > 1024 * 1024) {
                                call.reject("Text file exceeds AURORA's 1 MB preview limit.");
                                return;
                            }
                            output.write(buffer, 0, count);
                        }
                        result.put("text", new String(output.toByteArray(), StandardCharsets.UTF_8));
                        result.put("textIncluded", true);
                    }
                }
            } else {
                result.put("textIncluded", false);
                result.put("note", "Selected file type is not available as a plain-text preview.");
            }
            call.resolve(result);
        } catch (Exception e) {
            call.reject("AURORA could not read the selected file.", e);
        }
    }


    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) { call.reject("Could not open Android notification access settings.", e); }
    }

    @PluginMethod
    public void hasNotificationAccess(PluginCall call) {
        String enabled = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        String expected = getContext().getPackageName() + "/" + AuroraNotificationListenerService.class.getName();
        boolean granted = false;
        if (enabled != null) {
            for (String item : enabled.split(":")) {
                if (expected.equalsIgnoreCase(item)) { granted = true; break; }
            }
        }
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void readRecentNotifications(PluginCall call) {
        String enabled = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        String expected = getContext().getPackageName() + "/" + AuroraNotificationListenerService.class.getName();
        boolean granted = false;
        if (enabled != null) for (String item : enabled.split(":")) if (expected.equalsIgnoreCase(item)) granted = true;
        if (!granted) { call.reject("Enable AURORA Notification Access in Android Settings first."); return; }
        call.resolve(AuroraNotificationListenerService.readRecent(getContext()));
    }

    @PluginMethod
    public void clearRecentNotifications(PluginCall call) {
        AuroraNotificationListenerService.clearRecent(getContext());
        JSObject result = new JSObject();
        result.put("cleared", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getCurrentLocation(PluginCall call) {
        boolean coarse = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean fine = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!coarse && !fine) { call.reject("Grant location permission before requesting your location."); return; }
        try {
            LocationManager manager = (LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
            if (manager == null) { call.reject("Android location services are unavailable."); return; }
            Location best = null;
            for (String provider : manager.getProviders(true)) {
                try {
                    Location candidate = manager.getLastKnownLocation(provider);
                    if (candidate != null && (best == null || candidate.getTime() > best.getTime())) best = candidate;
                } catch (SecurityException ignored) { }
            }
            if (best == null) { call.reject("No recent device location is available yet. Enable location services and try again."); return; }
            long ageMs = Math.max(0L, System.currentTimeMillis() - best.getTime());
            JSObject result = new JSObject();
            result.put("latitude", best.getLatitude());
            result.put("longitude", best.getLongitude());
            result.put("accuracyMeters", best.hasAccuracy() ? best.getAccuracy() : -1);
            result.put("provider", best.getProvider() == null ? "unknown" : best.getProvider());
            result.put("timestamp", best.getTime());
            result.put("ageMs", ageMs);
            result.put("fresh", ageMs <= 120000L);
            result.put("precision", fine ? "fine" : "coarse");
            result.put("backgroundTracking", false);
            call.resolve(result);
        } catch (SecurityException e) {
            call.reject("Android denied access to the device location.", e);
        } catch (Exception e) {
            call.reject("Could not read the device's last known location.", e);
        }
    }

    @PluginMethod
    public void getDeviceCapabilityInventory(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            JSObject hardware = new JSObject();
            hardware.put("camera", pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY));
            hardware.put("cameraFlash", pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH));
            hardware.put("microphone", pm.hasSystemFeature(PackageManager.FEATURE_MICROPHONE));
            hardware.put("telephony", pm.hasSystemFeature(PackageManager.FEATURE_TELEPHONY));
            hardware.put("bluetooth", pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH)
                || pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE));
            hardware.put("wifi", pm.hasSystemFeature(PackageManager.FEATURE_WIFI));
            hardware.put("gps", pm.hasSystemFeature(PackageManager.FEATURE_LOCATION_GPS));
            hardware.put("networkLocation", pm.hasSystemFeature(PackageManager.FEATURE_LOCATION_NETWORK));
            hardware.put("nfc", pm.hasSystemFeature(PackageManager.FEATURE_NFC));

            JSObject permissions = new JSObject();
            permissions.put("camera", ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED);
            permissions.put("microphone", ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
            permissions.put("contacts", ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED);
            permissions.put("calendarRead", ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED);
            permissions.put("locationCoarse", ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED);
            permissions.put("locationFine", ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED);
            permissions.put("notifications", Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);

            String enabledNotifications = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
            String expectedListener = getContext().getPackageName() + "/" + AuroraNotificationListenerService.class.getName();
            boolean notificationAccess = false;
            if (enabledNotifications != null) {
                for (String item : enabledNotifications.split(":")) {
                    if (expectedListener.equalsIgnoreCase(item)) { notificationAccess = true; break; }
                }
            }
            String enabledAccessibility = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            String expectedAccessibility = getContext().getPackageName() + "/" + AuroraAccessibilityService.class.getName();
            boolean accessibility = false;
            if (enabledAccessibility != null) {
                for (String item : enabledAccessibility.split(":")) {
                    if (expectedAccessibility.equalsIgnoreCase(item) || item.toLowerCase(java.util.Locale.ROOT).contains("auroraaccessibilityservice")) { accessibility = true; break; }
                }
            }
            JSObject specialAccess = new JSObject();
            specialAccess.put("overlay", Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(getContext()));
            specialAccess.put("notificationListener", notificationAccess);
            specialAccess.put("accessibilityService", accessibility);

            JSObject device = new JSObject();
            device.put("manufacturer", Build.MANUFACTURER);
            device.put("model", Build.MODEL);
            device.put("sdk", Build.VERSION.SDK_INT);
            JSObject result = new JSObject();
            result.put("platform", "android");
            result.put("device", device);
            result.put("hardware", hardware);
            result.put("permissions", permissions);
            result.put("specialAccess", specialAccess);
            result.put("readOnly", true);
            result.put("capturedAt", System.currentTimeMillis());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not inspect Android device capabilities.", e);
        }
    }

    @PluginMethod
    public void getDeviceStatus(PluginCall call) {
        try {
            Intent battery = getContext().registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            JSObject result = new JSObject();
            if (battery != null) {
                int level = battery.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                int scale = battery.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
                if (level >= 0 && scale > 0) result.put("batteryPercent", Math.round(level * 100f / scale));
                int plugged = battery.getIntExtra(android.os.BatteryManager.EXTRA_PLUGGED, 0);
                result.put("charging", plugged != 0);
                result.put("batteryHealth", battery.getIntExtra(android.os.BatteryManager.EXTRA_HEALTH, -1));
            }
            result.put("platform", "android");
            result.put("sdk", Build.VERSION.SDK_INT);
            result.put("manufacturer", Build.MANUFACTURER);
            result.put("model", Build.MODEL);
            call.resolve(result);
        } catch (Exception e) { call.reject("Could not read device status.", e); }
    }

    @PluginMethod
    public void requestCameraPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            JSObject result = new JSObject(); result.put("granted", true); call.resolve(result); return;
        }
        requestPermissionForAlias("camera", call, "cameraPermissionCallback");
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Camera permission is needed to control the flashlight. You can deny it and continue using AURORA.");
            return;
        }
        JSObject result = new JSObject(); result.put("granted", true); call.resolve(result);
    }

    @PluginMethod
    public void setFlashlight(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) { call.reject("Choose whether to turn the flashlight on or off."); return; }
        try {
            android.hardware.camera2.CameraManager manager =
                (android.hardware.camera2.CameraManager) getContext().getSystemService(android.content.Context.CAMERA_SERVICE);
            String selected = null;
            for (String id : manager.getCameraIdList()) {
                android.hardware.camera2.CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
                Boolean hasFlash = characteristics.get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer facing = characteristics.get(android.hardware.camera2.CameraCharacteristics.LENS_FACING);
                if (Boolean.TRUE.equals(hasFlash) && (facing == null || facing == android.hardware.camera2.CameraCharacteristics.LENS_FACING_BACK)) {
                    selected = id; break;
                }
            }
            if (selected == null) { call.reject("No flashlight is available on this device."); return; }
            manager.setTorchMode(selected, enabled);
            JSObject result = new JSObject();
            result.put("enabled", enabled);
            call.resolve(result);
        } catch (Exception e) { call.reject("Could not change the flashlight state.", e); }
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
    }

    @PluginMethod
    public void readScreen(PluginCall call) {
        String text = AuroraAccessibilityService.readVisibleText();
        if (text == null) {
            call.reject("Enable AURORA Screen Assistant in Android Accessibility settings first.");
            return;
        }
        JSObject result = new JSObject();
        result.put("text", text);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadAndInstallUpdate(PluginCall call) {
        String urlString = call.getString("url");
        if (urlString == null || !urlString.startsWith("https://")) {
            call.reject("A secure HTTPS update URL is required.");
            return;
        }
        try {
            String host = new URL(urlString).getHost().toLowerCase(java.util.Locale.ROOT);
            if (!(host.equals("github.com") || host.endsWith(".github.com") || host.equals("raw.githubusercontent.com") || host.endsWith(".githubusercontent.com"))) {
                call.reject("The update must come from the trusted GitHub release host.");
                return;
            }
        } catch (Exception e) { call.reject("The update URL is invalid."); return; }
        new Thread(() -> {
            File apk = new File(getContext().getCacheDir(), "aurora-update.apk");
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(urlString).openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(45000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "AURORA-Updater");
                int code = connection.getResponseCode();
                if (!isTrustedUpdateUrl(connection.getURL())) {
                    throw new Exception("The download redirected to an untrusted destination.");
                }
                if (code < 200 || code >= 300) throw new Exception("Download server returned HTTP " + code);
                long total = 0;
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[16384];
                    int count;
                    while ((count = in.read(buffer)) != -1) {
                        total += count;
                        if (total > 120L * 1024L * 1024L) throw new Exception("The update file is larger than expected.");
                        out.write(buffer, 0, count);
                    }
                    out.getFD().sync();
                }
                if (total < 100000) throw new Exception("The downloaded update file is incomplete.");
                if (!isCompatibleSignedUpdate(apk)) {
                    throw new Exception("Downloaded APK package or signing certificate does not match this AURORA installation.");
                }
                final long downloadedBytes = total;
                getActivity().runOnUiThread(() -> {
                    JSObject result = new JSObject();
                    result.put("downloaded", true);
                    result.put("bytes", downloadedBytes);
                    call.resolve(result);
                });
            } catch (Exception e) {
                apk.delete();
                getActivity().runOnUiThread(() -> call.reject("Update download failed: " + (e.getMessage() == null ? "network error" : e.getMessage())));
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void installDownloadedUpdate(PluginCall call) {
        File apk = new File(getContext().getCacheDir(), "aurora-update.apk");
        if (!apk.exists() || apk.length() < 100000) {
            call.reject("Download the update first.");
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                JSObject result = new JSObject();
                result.put("needsInstallPermission", true);
                call.resolve(result);
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(install);
            JSObject result = new JSObject();
            result.put("installerLaunched", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not open Android's installer: " + (e.getMessage() == null ? "unknown error" : e.getMessage()));
        }
    }

    @PluginMethod
    public void getBuildInfo(PluginCall call) {
        try {
            android.content.pm.PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionCode", android.os.Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode);
            result.put("versionName", info.versionName == null ? "" : info.versionName);
            call.resolve(result);
        } catch (Exception e) { call.reject("Could not read the installed AURORA build version.", e); }
    }
    @PluginMethod
    public void isAccessibilityEnabled(PluginCall call) {
        String enabled = android.provider.Settings.Secure.getString(getContext().getContentResolver(), android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        boolean active = false;
        if (enabled != null) {
            String expected = getContext().getPackageName() + "/" + AuroraAccessibilityService.class.getName();
            for (String item : enabled.split(":")) {
                if (expected.equalsIgnoreCase(item) || item.toLowerCase(java.util.Locale.ROOT).contains("auroraaccessibilityservice")) { active = true; break; }
            }
        }
        JSObject result = new JSObject(); result.put("enabled", active); call.resolve(result);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("nativeBridge", true);
        result.put("backgroundServiceFoundation", true);
        boolean notificationsAllowed = Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        result.put("notificationsPermissionGranted", notificationsAllowed);
        result.put("notificationsPermissionRequired", Build.VERSION.SDK_INT >= 33 && !notificationsAllowed);
        result.put("wakeWordEnabled", true);
        boolean serviceRunning = false;
        android.app.ActivityManager activityManager =
            (android.app.ActivityManager) getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE);
        if (activityManager != null) {
            for (android.app.ActivityManager.RunningServiceInfo running : activityManager.getRunningServices(Integer.MAX_VALUE)) {
                if (running.service != null
                    && AuroraAssistantService.class.getName().equals(running.service.getClassName())) {
                    serviceRunning = true;
                    break;
                }
            }
        }
        boolean listeningFlag = getContext().getSharedPreferences("aurora_assistant", 0)
            .getBoolean("wake_word_listening", false);
        result.put("wakeWordListening", serviceRunning && listeningFlag);
        result.put("liveRealtimeVoiceEnabled", false);
        call.resolve(result);
    }
}
