const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const nativeJava = read("android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java");
const nativeBridge = read("src/lib/aurora-native.ts");
const capabilityRuntime = read("src/core/aurora-capability-runtime.js");
const registry = read("src/core/aurora-layer-registry.js");

assert.equal((nativeJava.match(/public void getDeviceCapabilityInventory\(PluginCall call\)/g) || []).length, 1, "Native inventory must have exactly one plugin implementation.");
for (const feature of ["FEATURE_CAMERA_ANY", "FEATURE_CAMERA_FLASH", "FEATURE_MICROPHONE", "FEATURE_TELEPHONY", "FEATURE_BLUETOOTH", "FEATURE_BLUETOOTH_LE", "FEATURE_WIFI", "FEATURE_LOCATION_GPS", "FEATURE_LOCATION_NETWORK", "FEATURE_NFC"]) {
  assert.ok(nativeJava.includes(feature), "Native inventory must inspect " + feature);
}
for (const permission of ["Manifest.permission.CAMERA", "Manifest.permission.RECORD_AUDIO", "Manifest.permission.READ_CONTACTS", "Manifest.permission.READ_CALENDAR", "Manifest.permission.ACCESS_COARSE_LOCATION", "Manifest.permission.ACCESS_FINE_LOCATION", "Manifest.permission.POST_NOTIFICATIONS"]) {
  assert.ok(nativeJava.includes(permission), "Native inventory must report " + permission);
}
for (const field of ["notificationListener", "accessibilityService", "overlay"]) {
  assert.ok(nativeJava.includes('specialAccess.put("' + field + '"'), "Native inventory must report special access: " + field);
}
assert.match(nativeBridge, /getDeviceCapabilityInventory\(\): Promise/);
assert.match(nativeBridge, /getDeviceCapabilityInventory: async \(\)/);
assert.match(capabilityRuntime, /id: "android\.inspect_capabilities"/);
assert.match(capabilityRuntime, /noPermissionPrompt: true/);
assert.match(capabilityRuntime, /noSettingsChanged: true/);
assert.match(nativeJava, /hardware\.put\("networkLocation"/);
assert.match(nativeJava, /specialAccess\.put\("notificationListener"/);
assert.match(nativeJava, /result\.put\("readOnly", true\)/);
assert.match(registry, /STAGE_TEN_CHECKPOINT/);
assert.match(registry, /status: "in_progress"/);
console.log("AURORA Stage 10 capability inventory tests passed: hardware, runtime permissions and special access are exposed read-only.");
