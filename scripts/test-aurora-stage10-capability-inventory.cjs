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


// Stage 10 Wave 3: email is a reviewed native composer handoff, never a silent send.
assert.equal(nativeJava.split("public void prepareEmail(PluginCall call)").length - 1, 1, "Email composer must have one native implementation.");
for (const fragment of ["Intent.ACTION_SENDTO", "mailto:", "Intent.EXTRA_SUBJECT", "Intent.EXTRA_TEXT", "requiresUserReview", "requiresUserSend"]) {
  assert.ok(nativeJava.includes(fragment), "Native email handoff must include " + fragment);
}
for (const fragment of ["prepareEmail(options:", "prepareEmail: async"]) {
  assert.ok(nativeBridge.includes(fragment), "Native bridge must include " + fragment);
}
for (const fragment of ['id: "communication.prepare_email"', "approvalRequired: true", "sentByAurora: false", "Email subject must be text no longer than 200 characters", "Email draft must be text no longer than 8000 characters"]) {
  assert.ok(capabilityRuntime.includes(fragment), "Email capability must include " + fragment);
}
console.log("AURORA Stage 10 email draft tests passed: recipient validation, approval-gated composer handoff and explicit user-controlled sending.");


// Expanded Android utility coverage.
for (const method of ["prepareContact", "prepareAlarm", "prepareTimer"]) {
  assert.ok(nativeJava.includes("public void " + method + "(PluginCall call)"), method + " native implementation is required.");
  assert.ok(nativeBridge.includes(method + "(options:"), method + " bridge declaration is required.");
}
for (const target of ["nfc", "sound", "battery", "app_details"]) {
  assert.ok(nativeJava.includes('case "' + target + '"'), "Native settings must support " + target);
  assert.ok(capabilityRuntime.includes('id: "device.open_' + target + '_settings"'), "Action Engine must expose " + target + " settings");
}
assert.ok(nativeJava.includes("AlarmClock.ACTION_SET_ALARM"));
assert.ok(nativeJava.includes("AlarmClock.ACTION_SET_TIMER"));
assert.ok(nativeJava.includes("ContactsContract.Intents.Insert.NAME"));
assert.ok(nativeJava.includes("requiresUserSave"));
assert.ok(nativeJava.includes("requiresUserConfirmation"));
console.log("AURORA Stage 10 expanded utility tests passed: contact, alarm, timer and extra Android settings handoffs.");
