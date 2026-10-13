import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
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
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AuroraNative")
public class AuroraAssistantPlugin extends Plugin {
    @PluginMethod
    public void startAssistantService(PluginCall call) {
        Intent intent = new Intent(getContext(), AuroraAssistantService.class);
        intent.setAction(AuroraAssistantService.ACTION_START);
        androidx.core.content.ContextCompat.startForegroundService(getContext(), intent);
        JSObject result = new JSObject();
        result.put("started", true);
        result.put("note", "Foreground service started; wake-word listening is not enabled by this foundation build.");
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
        result.put("wakeWordEnabled", false);
        result.put("liveRealtimeVoiceEnabled", false);
        call.resolve(result);
    }
}
`,
  "AuroraAssistantService.java": `package com.aurora.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

public class AuroraAssistantService extends Service {
    public static final String ACTION_START = "com.aurora.assistant.START";
    public static final String ACTION_STOP = "com.aurora.assistant.STOP";
    private static final String CHANNEL_ID = "aurora_assistant_status";
    private static final int NOTIFICATION_ID = 7401;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "AURORA Assistant", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shows when AURORA's assistant service is active.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pendingIntent = launchIntent == null ? null : PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        builder.setContentTitle("AURORA is ready")
            .setContentText("Assistant service is active. Wake-word listening is not active yet.")
            .setSmallIcon(getApplicationInfo().icon)
            .setOngoing(true);
        if (pendingIntent != null) builder.setContentIntent(pendingIntent);
        startForeground(NOTIFICATION_ID, builder.build());
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(javaRoot, name), content);
}

const manifestPath = path.join(android, "app/src/main/AndroidManifest.xml");
let manifest = fs.readFileSync(manifestPath, "utf8");
const permissions = [
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
];
for (const permission of permissions) {
  const key = permission.match(/android:name="([^"]+)"/)[1];
  if (!manifest.includes(key)) manifest = manifest.replace("<application", permission + "\n    <application");
}
if (!manifest.includes('android:name=".AuroraAssistantService"')) {
  manifest = manifest.replace("</application>", '        <service android:name=".AuroraAssistantService" android:exported="false" android:stopWithTask="false" />\n    </application>');
}
if (!manifest.includes('com.whatsapp')) {
  manifest = manifest.replace("</manifest>", '    <queries><package android:name="com.whatsapp" /><package android:name="com.whatsapp.w4b" /></queries>\n</manifest>');
}
fs.writeFileSync(manifestPath, manifest);

const mainActivity = path.join(javaRoot, "MainActivity.java");
if (!fs.existsSync(mainActivity)) {
  fs.writeFileSync(mainActivity, `package com.aurora.assistant;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AuroraAssistantPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);
} else {
  let main = fs.readFileSync(mainActivity, "utf8");
  if (!main.includes("registerPlugin(AuroraAssistantPlugin.class)")) {
    main = main.replace("super.onCreate(savedInstanceState);", "registerPlugin(AuroraAssistantPlugin.class);\n        super.onCreate(savedInstanceState);");
    fs.writeFileSync(mainActivity, main);
  }
}
console.log("AURORA native Android bridge and foreground-service foundation installed.");
