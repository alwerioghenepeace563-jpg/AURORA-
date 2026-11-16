import fs from "node:fs";
const app = fs.readFileSync("src/App.jsx", "utf8");
const native = fs.readFileSync("scripts/patch-android-native.mjs", "utf8");
const plugin = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java", "utf8");
const wake = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraAssistantService.java", "utf8");
const config = JSON.parse(fs.readFileSync("capacitor.config.json", "utf8"));
const checks = [
  ["native API routing", app.includes('auroraApiUrl("/api/')],
  ["native assistant UI", app.includes("toggleNativeAssistant")],
  ["native app launching", app.includes("Open WhatsApp")],
  ["screen assistant", app.includes("readCurrentAndroidScreen")],
  ["wake-word service", native.includes("class AuroraAssistantService")],
  ["Android speech lifecycle", plugin.includes("speechGeneration") && plugin.includes("speechPartialResult")],
  ["queued Android TTS", plugin.includes("pendingSpeechCalls") && plugin.includes("rejectPendingSpeech")],
  ["default assistant role", plugin.includes("requestAssistantRole") && plugin.includes("RoleManager.ROLE_ASSISTANT")],
  ["wake retry and state", wake.includes("restartPending") && wake.includes("setListeningState(true)")],
  ["accessibility service", native.includes("class AuroraAccessibilityService")],
  ["in-app APK installer", native.includes("installDownloadedUpdate")],
  ["bundled UI", !(config.server && config.server.url)],
  ["package ID", config.appId === "com.aurora.assistant"],
  ["web directory", config.webDir === "dist"]
];
const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) { console.error("AURORA Android check failed: " + failures.join(", ")); process.exit(1); }
console.log("AURORA native foundation and bundled-interface checks passed.");
