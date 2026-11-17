import fs from "node:fs";
const app = fs.readFileSync("src/App.jsx", "utf8");
const native = fs.readFileSync("scripts/patch-android-native.mjs", "utf8");
const config = JSON.parse(fs.readFileSync("capacitor.config.json", "utf8"));
const checks = [
  ["native API routing", app.includes('auroraApiUrl("/api/')],
  ["native assistant UI", app.includes("toggleNativeAssistant")],
  ["native app launching", app.includes("Open WhatsApp")],
  ["screen assistant", app.includes("readCurrentAndroidScreen")],
  ["wake-word service", native.includes("class AuroraAssistantService")],
  ["voice interaction assistant service", fs.existsSync("android/app/src/main/java/com/aurora/assistant/AuroraVoiceInteractionService.java") && fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraVoiceInteractionService.java", "utf8").includes("voice_interaction_service_ready")],
  ["VoiceInteractionService is the sole assistant entry point", fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8").includes("android.permission.BIND_VOICE_INTERACTION") && !fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8").includes("<action android:name=\"android.intent.action.ASSIST\"")],
  ["Android system assistant launches Pulse directly and auto-listens", fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraVoiceInteractionSession.java", "utf8").includes("AuroraOverlayService.ACTION_SHOW") && fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraVoiceInteractionSession.java", "utf8").includes("EXTRA_AUTO_LISTEN, true") && fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraVoiceInteractionSession.java", "utf8").includes("startForegroundService")],
  ["assistant role bridge", fs.readFileSync("src/lib/aurora-native.ts", "utf8").includes("openAssistantRoleSettings")],
  ["accessibility service", native.includes("class AuroraAccessibilityService")],
  ["in-app APK installer", native.includes("installDownloadedUpdate")],
  ["bundled UI", !(config.server && config.server.url)],
  ["Nearby Connections native plugin registered", fs.readFileSync("android/app/src/main/java/com/aurora/assistant/MainActivity.java", "utf8").includes("registerPlugin(AuroraNearbyPlugin.class)")],
  ["Nearby Connections dependency", fs.readFileSync("android/app/build.gradle", "utf8").includes("play-services-nearby:19.5.1")],
  ["Nearby Connections native transport", fs.existsSync("android/app/src/main/java/com/aurora/assistant/AuroraNearbyPlugin.java")],
  ["One-shot Android location plugin registered", fs.readFileSync("android/app/src/main/java/com/aurora/assistant/MainActivity.java", "utf8").includes("registerPlugin(AuroraLocationPlugin.class)")],
  ["One-shot Android location plugin source", fs.existsSync("android/app/src/main/java/com/aurora/assistant/AuroraLocationPlugin.java")],
  ["Consent-gated screen capture plugin registered", fs.readFileSync("android/app/src/main/java/com/aurora/assistant/MainActivity.java", "utf8").includes("registerPlugin(AuroraScreenCapturePlugin.class)")],
  ["One-frame MediaProjection foreground service", fs.existsSync("android/app/src/main/java/com/aurora/assistant/AuroraScreenCaptureService.java")],
  ["Foreground NFC plugin registered", fs.readFileSync("android/app/src/main/java/com/aurora/assistant/MainActivity.java", "utf8").includes("registerPlugin(AuroraNfcPlugin.class)")],
  ["NFC hardware optional", fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8").includes('android.hardware.nfc" android:required="false"')],
  ["MediaProjection foreground-service permission", fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8").includes("android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION")],
  ["Nearby Connections typed bridge", fs.existsSync("src/lib/aurora-nearby.ts")],
  ["Nearby Connections runtime adapter", fs.existsSync("src/core/aurora-nearby-device-adapter.js")],
  ["package ID", config.appId === "com.aurora.assistant"],
  ["web directory", config.webDir === "dist"]
];
const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) { console.error("AURORA Android check failed: " + failures.join(", ")); process.exit(1); }
console.log("AURORA native foundation and bundled-interface checks passed.");
