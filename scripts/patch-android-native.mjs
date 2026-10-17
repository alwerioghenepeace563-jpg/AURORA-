import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reducedPermissionTest = process.env.AURORA_REDUCED_PERMISSION_TEST === "true";
const android = path.join(root, "android");
const javaRoot = path.join(android, "app/src/main/java/com/aurora/assistant");
if (!fs.existsSync(path.join(android, "app/src/main/AndroidManifest.xml"))) {
  throw new Error("Android project is missing. Run 'npx cap add android' first.");
}
fs.mkdirSync(javaRoot, { recursive: true });

const files = {
  "AuroraAssistantPlugin.java": `package com.aurora.assistant;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.net.Uri;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import androidx.core.content.FileProvider;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AuroraNative"${reducedPermissionTest ? "" : ", permissions = { @Permission(alias = \"microphone\", strings = { Manifest.permission.RECORD_AUDIO }) }"})
public class AuroraAssistantPlugin extends Plugin {
    @PluginMethod
    public void requestMicrophonePermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) { JSObject r=new JSObject(); r.put("granted",true); call.resolve(r); return; }
        requestPermissionForAlias("microphone",call,"microphonePermissionCallback");
    }
    @PermissionCallback private void microphonePermissionCallback(PluginCall call) { if(getPermissionState("microphone")!=PermissionState.GRANTED){call.reject("Microphone permission is needed for Hey AURORA. You can deny it and use AURORA normally.");return;} JSObject r=new JSObject();r.put("granted",true);call.resolve(r); }
    @PluginMethod public void consumeWakeWord(PluginCall call) { android.content.SharedPreferences p=getContext().getSharedPreferences("aurora_assistant",0);boolean d=p.getBoolean("wake_detected",false);if(d)p.edit().putBoolean("wake_detected",false).apply();JSObject r=new JSObject();r.put("detected",d);call.resolve(r); }
    @PluginMethod
    public void startAssistantService(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { call.reject("Grant microphone permission first to enable Hey AURORA."); return; }
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
        result.put("backgroundServiceFoundation", ${reducedPermissionTest ? "false" : "true"});
        boolean notificationsAllowed = Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        result.put("notificationsPermissionGranted", notificationsAllowed);
        result.put("notificationsPermissionRequired", Build.VERSION.SDK_INT >= 33 && !notificationsAllowed);
        result.put("wakeWordEnabled", ${reducedPermissionTest ? "false" : "true"});
        result.put("wakeWordListening", getContext().getSharedPreferences("aurora_assistant", 0).getBoolean("wake_word_listening", false));
        result.put("liveRealtimeVoiceEnabled", false);
        call.resolve(result);
    }
}
`,
  "AuroraAssistantService.java": "package com.aurora.assistant;\nimport android.app.Notification; import android.app.NotificationChannel; import android.app.NotificationManager; import android.app.PendingIntent; import android.app.Service;\nimport android.content.Intent; import android.content.SharedPreferences; import android.content.pm.PackageManager; import android.content.pm.ServiceInfo;\nimport android.os.Build; import android.os.Bundle; import android.os.Handler; import android.os.IBinder; import android.os.Looper;\nimport android.speech.RecognitionListener; import android.speech.RecognizerIntent; import android.speech.SpeechRecognizer; import java.util.ArrayList; import java.util.Locale;\npublic class AuroraAssistantService extends Service {\n public static final String ACTION_START=\"com.aurora.assistant.START\", ACTION_STOP=\"com.aurora.assistant.STOP\"; private static final String CHANNEL_ID=\"aurora_assistant_status\"; private static final int NOTIFICATION_ID=7401;\n private final Handler handler=new Handler(Looper.getMainLooper()); private SpeechRecognizer recognizer; private boolean stopping=false, wakeDetected=false;\n @Override public void onCreate(){ super.onCreate(); if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O){ NotificationChannel c=new NotificationChannel(CHANNEL_ID,\"AURORA Assistant\",NotificationManager.IMPORTANCE_LOW); c.setDescription(\"Visible status for AURORA's microphone wake listener.\"); NotificationManager m=getSystemService(NotificationManager.class); if(m!=null)m.createNotificationChannel(c); } }\n @Override public int onStartCommand(Intent intent,int flags,int startId){ String action=intent==null?ACTION_START:intent.getAction(); if(ACTION_STOP.equals(action)){stopping=true;getSharedPreferences(\"aurora_assistant\",MODE_PRIVATE).edit().putBoolean(\"wake_word_listening\",false).apply();stopRecognition();stopForeground(true);stopSelf();return START_NOT_STICKY;} if(checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){stopSelf();return START_NOT_STICKY;} Notification n=buildNotification(\"Listening for Hey AURORA · tap to open\"); if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION_ID,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);else startForeground(NOTIFICATION_ID,n); stopping=false;wakeDetected=false;getSharedPreferences(\"aurora_assistant\",MODE_PRIVATE).edit().putBoolean(\"wake_word_listening\",true).apply();handler.post(this::listen);return START_STICKY; }\n private Notification buildNotification(String text){ Intent launch=getPackageManager().getLaunchIntentForPackage(getPackageName()); PendingIntent pi=launch==null?null:PendingIntent.getActivity(this,0,launch,PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0)); Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL_ID):new Notification.Builder(this); b.setContentTitle(\"AURORA · Hey AURORA\").setContentText(text).setSmallIcon(getApplicationInfo().icon).setOngoing(true);if(pi!=null)b.setContentIntent(pi);return b.build(); }\n private void updateNote(String text){NotificationManager m=getSystemService(NotificationManager.class);if(m!=null)m.notify(NOTIFICATION_ID,buildNotification(text));}\n private void listen(){if(stopping||wakeDetected)return;if(!SpeechRecognizer.isRecognitionAvailable(this)){updateNote(\"Speech recognition unavailable · open AURORA to use mic\");handler.postDelayed(this::listen,5000);return;}try{if(recognizer!=null){recognizer.destroy();recognizer=null;}recognizer=SpeechRecognizer.createSpeechRecognizer(this);recognizer.setRecognitionListener(new RecognitionListener(){\n public void onReadyForSpeech(Bundle b){} public void onBeginningOfSpeech(){} public void onRmsChanged(float r){} public void onBufferReceived(byte[] b){} public void onEndOfSpeech(){}\n public void onError(int e){if(!stopping&&!wakeDetected)handler.postDelayed(AuroraAssistantService.this::listen,1200);} public void onResults(Bundle b){check(b,true);} public void onPartialResults(Bundle b){check(b,false);} public void onEvent(int e,Bundle b){} });\n Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,Locale.UK.toLanguageTag());i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true);i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,3);recognizer.startListening(i);}catch(Exception e){handler.postDelayed(this::listen,2500);} }\n private void check(Bundle b, boolean finalResult){if(b==null||stopping||wakeDetected)return;ArrayList<String> a=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);if(a==null)return;for(String s:a){String v=s==null?\"\":s.toLowerCase(Locale.UK).replaceAll(\"[^a-z ]\",\" \").replaceAll(\"\\\\s+\",\" \").trim();if(v.contains(\"hey aurora\")||v.contains(\"hey a urora\")||v.contains(\"hey orora\")){wakeDetected=true;stopRecognition();getSharedPreferences(\"aurora_assistant\",MODE_PRIVATE).edit().putBoolean(\"wake_detected\",true).apply();updateNote(\"Wake phrase heard · opening AURORA\");Intent launch=getPackageManager().getLaunchIntentForPackage(getPackageName());if(launch!=null){launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);startActivity(launch);}return;}}if(finalResult&&!stopping&&!wakeDetected)handler.postDelayed(this::listen,300);}\n private void stopRecognition(){handler.removeCallbacksAndMessages(null);if(recognizer!=null){try{recognizer.cancel();}catch(Exception e){}try{recognizer.destroy();}catch(Exception e){}recognizer=null;}}\n @Override public void onDestroy(){stopping=true;stopRecognition();super.onDestroy();} @Override public IBinder onBind(Intent i){return null;}\n}",
  "AuroraAccessibilityService.java": `package com.aurora.assistant;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;

public class AuroraAccessibilityService extends AccessibilityService {
    private static volatile AuroraAccessibilityService instance;
    private static volatile String lastExternalScreenText = "";

    @Override public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null
                || "com.aurora.assistant".contentEquals(event.getPackageName())) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        String visible = collectVisibleText(root);
        root.recycle();
        if (visible != null && !visible.trim().isEmpty()) lastExternalScreenText = visible;
    }

    @Override public void onInterrupt() { }

    @Override public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    public static String readVisibleText() {
        AuroraAccessibilityService service = instance;
        if (service == null) return null;
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return lastExternalScreenText;
        String packageName = String.valueOf(root.getPackageName());
        String visible = collectVisibleText(root);
        root.recycle();
        if (!"com.aurora.assistant".equals(packageName) && visible != null && !visible.trim().isEmpty()) {
            lastExternalScreenText = visible;
            return visible;
        }
        return lastExternalScreenText;
    }

    private static String collectVisibleText(AccessibilityNodeInfo root) {
        List<String> lines = new ArrayList<>();
        collect(root, lines);
        StringBuilder result = new StringBuilder();
        for (String line : lines) {
            if (result.length() > 0) result.append("\\n");
            result.append(line);
            if (result.length() >= 12000) break;
        }
        return result.toString();
    }

    private static void collect(AccessibilityNodeInfo node, List<String> lines) {
        if (node == null || lines.size() >= 400) return;
        CharSequence text = node.getText();
        if (text == null) text = node.getContentDescription();
        if (text != null) {
            String value = text.toString().trim();
            if (!value.isEmpty() && !lines.contains(value)) lines.add(value);
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) { collect(child, lines); child.recycle(); }
        }
    }
}`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(javaRoot, name), content);
}

const xmlDir = path.join(android, "app/src/main/res/xml");
fs.mkdirSync(xmlDir, { recursive: true });
fs.writeFileSync(path.join(xmlDir, "aurora_accessibility_service.xml"), `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="150"
    android:canRetrieveWindowContent="true"
    android:description="@string/aurora_accessibility_description"
    android:accessibilityFlags="flagReportViewIds|flagRetrieveInteractiveWindows" />
`);
const valuesDir = path.join(android, "app/src/main/res/values");
fs.mkdirSync(valuesDir, { recursive: true });
const stringsPath = path.join(valuesDir, "strings.xml");
let strings = fs.existsSync(stringsPath) ? fs.readFileSync(stringsPath, "utf8") : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
if (!strings.includes("aurora_accessibility_description")) {
  strings = strings.replace("</resources>", '    <string name="aurora_accessibility_description">Allows AURORA to read visible text from other apps after you enable Screen Assistant in Android settings. Text is sent to AI only when you ask AURORA to read your screen.</string>\n</resources>');
}
fs.writeFileSync(stringsPath, strings);

const manifestPath = path.join(android, "app/src/main/AndroidManifest.xml");
let manifest = fs.readFileSync(manifestPath, "utf8");
const permissions = reducedPermissionTest ? [] : [
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'
];
for (const permission of permissions) {
  const key = permission.match(/android:name="([^"]+)"/)[1];
  if (!manifest.includes(key)) manifest = manifest.replace("<application", permission + "\n    <application");
}
if (!manifest.includes('android:name="androidx.core.content.FileProvider"')) {
  manifest = manifest.replace("</application>", '        <provider android:name="androidx.core.content.FileProvider" android:authorities="com.aurora.assistant.fileprovider" android:exported="false" android:grantUriPermissions="true"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/aurora_file_paths" /></provider>\n    </application>');
}
const filePaths = path.join(xmlDir, "aurora_file_paths.xml");
fs.writeFileSync(filePaths, `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="aurora_updates" path="." />
</paths>
`);

if (!reducedPermissionTest && !manifest.includes('android:name=".AuroraAssistantService"')) {
  manifest = manifest.replace("</application>", '        <service android:name=".AuroraAssistantService" android:exported="false" android:stopWithTask="false" android:foregroundServiceType="microphone" />\n    </application>');
}
if (!reducedPermissionTest && !manifest.includes('android:name=".AuroraAccessibilityService"')) {
  manifest = manifest.replace("</application>", '        <service android:name=".AuroraAccessibilityService" android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE" android:exported="true" android:label="AURORA Screen Assistant">\n            <intent-filter><action android:name="android.accessibilityservice.AccessibilityService" /></intent-filter>\n            <meta-data android:name="android.accessibilityservice" android:resource="@xml/aurora_accessibility_service" />\n        </service>\n    </application>');
}
const visiblePackages = [
  "com.whatsapp", "com.whatsapp.w4b", "com.google.android.youtube",
  "com.android.chrome", "com.android.settings", "com.google.android.gm",
  "com.google.android.apps.maps", "com.google.android.apps.messaging", "com.android.vending"
];
if (!manifest.includes("<queries>")) {
  const queryXml = "    <queries>" + visiblePackages.map((name) => '<package android:name="' + name + '" />').join("") + "</queries>\\n";
  manifest = manifest.replace("</manifest>", queryXml + "</manifest>");
} else {
  for (const name of visiblePackages) {
    if (!manifest.includes('android:name="' + name + '"')) {
      manifest = manifest.replace("</queries>", '<package android:name="' + name + '" /></queries>');
    }
  }
}
// Register the OAuth callback URI so Android can return from the external browser.
const callbackIntentFilter = `            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="com.aurora.assistant" android:host="login-callback" />
            </intent-filter>`;
const mainActivityStart = manifest.indexOf('<activity');
const mainActivityEnd = mainActivityStart >= 0 ? manifest.indexOf('</activity>', mainActivityStart) : -1;
if (mainActivityStart >= 0 && mainActivityEnd > mainActivityStart && !manifest.includes('android:host="login-callback"')) {
  manifest = manifest.slice(0, mainActivityEnd) + callbackIntentFilter + "\\n        " + manifest.slice(mainActivityEnd);
}
fs.writeFileSync(manifestPath, manifest);

const mainActivity = path.join(javaRoot, "MainActivity.java");
const expectedMainActivity = `package com.aurora.assistant;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AuroraAssistantPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
if (!fs.existsSync(mainActivity)) {
  fs.writeFileSync(mainActivity, expectedMainActivity);
} else {
  let main = fs.readFileSync(mainActivity, "utf8");
  // Capacitor requires custom plugins to be registered before BridgeActivity creates
  // the bridge. Normalize the order even if an earlier patch inserted the line in
  // the wrong place or duplicated it.
  main = main.replace(/^[ \\t]*registerPlugin\\(AuroraAssistantPlugin\\.class\\);[ \\t]*\\r?\\n/gm, "");
  const onCreate = /(@Override\\s+public void onCreate\\(Bundle savedInstanceState\\)\\s*\\{)/;
  if (!onCreate.test(main)) {
    throw new Error("MainActivity.onCreate was not found; refusing to produce an APK with an unregistered AuroraNative plugin.");
  }
  if (!main.includes("import com.getcapacitor.BridgeActivity;")) {
    main = main.replace(/(package [^;]+;)/, "$1\\n\\nimport com.getcapacitor.BridgeActivity;");
  }
  main = main.replace(onCreate, "$1\\n        registerPlugin(AuroraAssistantPlugin.class);");
  if (!main.includes("import android.os.Bundle;")) {
    main = main.replace(/(package [^;]+;)/, "$1\\n\\nimport android.os.Bundle;");
  }
  fs.writeFileSync(mainActivity, main);
}
if (!fs.readFileSync(mainActivity, "utf8").includes("registerPlugin(AuroraAssistantPlugin.class);")) {
  throw new Error("AuroraNative plugin registration verification failed.");
}
console.log(reducedPermissionTest
  ? "AURORA reduced-permission test build: microphone and accessibility permissions/services omitted."
  : "AURORA native bridge, opt-in screen reader, and Hey AURORA wake-word listener installed.");
