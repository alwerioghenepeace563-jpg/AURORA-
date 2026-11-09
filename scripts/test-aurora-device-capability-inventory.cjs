const assert = require("node:assert/strict");
const fs = require("node:fs");
const java = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java", "utf8");
const native = fs.readFileSync("src/lib/aurora-native.ts", "utf8");
const runtime = fs.readFileSync("src/core/aurora-capability-runtime.js", "utf8");

assert.match(java, /public void getDeviceCapabilityInventory\\(PluginCall call\\)/);
for (const feature of ["FEATURE_CAMERA_ANY", "FEATURE_CAMERA_FLASH", "FEATURE_MICROPHONE", "FEATURE_TELEPHONY", "FEATURE_WIFI", "FEATURE_BLUETOOTH", "FEATURE_NFC", "FEATURE_LOCATION_GPS", "FEATURE_LOCATION_NETWORK"]) {
  assert.ok(java.includes(feature), "Missing hardware inventory feature: " + feature);
}
for (const permission of ["CAMERA", "RECORD_AUDIO", "READ_CONTACTS", "READ_CALENDAR", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "notificationAccess", "accessibility", "overlay"]) {
  assert.ok(java.includes(permission), "Missing permission inventory: " + permission);
}
assert.match(java, /result\\.put\\("readOnly", true\\)/);
assert.match(native, /getDeviceCapabilityInventory\\(\\): Promise<AuroraDeviceCapabilityInventory>/);
assert.match(native, /getDeviceCapabilityInventory: async \\(\\) =>/);
assert.match(runtime, /id: "android\\.inspect_capabilities"/);
assert.match(runtime, /getDeviceCapabilityInventory\\(\\)/);
console.log("AURORA Android capability inventory checks passed.");
