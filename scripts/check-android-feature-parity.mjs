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
  ["accessibility service", native.includes("class AuroraAccessibilityService")],
  ["in-app APK installer", native.includes("installDownloadedUpdate")],
  ["bundled UI", !(config.server && config.server.url)],
  ["Nearby Connections native plugin registered", fs.readFileSync("android/app/src/main/java/com/aurora/assistant/MainActivity.java", "utf8").includes("registerPlugin(AuroraNearbyPlugin.class)")],
  ["Nearby Connections dependency", fs.readFileSync("android/app/build.gradle", "utf8").includes("play-services-nearby:19.5.1")],
  ["Nearby Connections native transport", fs.existsSync("android/app/src/main/java/com/aurora/assistant/AuroraNearbyPlugin.java")],
  ["Nearby Connections typed bridge", fs.existsSync("src/lib/aurora-nearby.ts")],
  ["Nearby Connections runtime adapter", fs.existsSync("src/core/aurora-nearby-device-adapter.js")],
  ["package ID", config.appId === "com.aurora.assistant"],
  ["web directory", config.webDir === "dist"]
];
const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) { console.error("AURORA Android check failed: " + failures.join(", ")); process.exit(1); }
console.log("AURORA native foundation and bundled-interface checks passed.");
