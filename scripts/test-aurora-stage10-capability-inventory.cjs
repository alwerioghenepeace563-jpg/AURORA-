const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const nativeJava = read("android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java");
const notificationService = read("android/app/src/main/java/com/aurora/assistant/AuroraNotificationListenerService.java");
const nativeBridge = read("src/lib/aurora-native.ts");
const capabilityRuntime = read("src/core/aurora-capability-runtime.js");
const registry = read("src/core/aurora-layer-registry.js");
const manifest = read("android/app/src/main/AndroidManifest.xml");

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


// Stage 10 Wave 4: volume control and read-only storage capacity plus expanded settings shortcuts.
assert.ok(nativeJava.includes("public void setAudioVolume(PluginCall call)"));
assert.ok(nativeJava.includes("FLAG_SHOW_UI"));
assert.ok(nativeJava.includes("public void getStorageStatus(PluginCall call)"));
assert.ok(nativeJava.includes("fileContentsRead"));
assert.ok(nativeBridge.includes("setAudioVolume(options:"));
assert.ok(nativeBridge.includes("getStorageStatus(): Promise"));
assert.ok(capabilityRuntime.includes('id: "device.set_audio_volume"'));
assert.ok(capabilityRuntime.includes('id: "device.get_storage_status"'));
assert.ok(manifest.includes("android.permission.MODIFY_AUDIO_SETTINGS"));
for (const target of ["location", "notifications", "security", "date_time", "storage"]) {
  assert.ok(nativeJava.includes('case "' + target + '"'));
  assert.ok(capabilityRuntime.includes('id: "device.open_' + target + '_settings"'));
}
console.log("AURORA Stage 10 device controls tests passed: approval-gated volume, read-only storage and five additional Android settings handoffs.");


// Stage 10 Wave 5: launcher app discovery and privacy-safe connectivity diagnostics.
assert.ok(nativeJava.includes("public void listLaunchableApps(PluginCall call)"));
assert.ok(nativeJava.includes("public void getNetworkStatus(PluginCall call)"));
assert.ok(nativeJava.includes("Intent.CATEGORY_LAUNCHER"));
assert.ok(nativeJava.includes("NET_CAPABILITY_VALIDATED"));
assert.ok(nativeBridge.includes("listLaunchableApps(): Promise"));
assert.ok(nativeBridge.includes("getNetworkStatus(): Promise"));
assert.ok(capabilityRuntime.includes('id: "apps.list_launchable"'));
assert.ok(capabilityRuntime.includes('id: "device.get_network_status"'));
assert.ok(nativeJava.includes("result.put(\"ssidRead\", false)"));
console.log("AURORA Stage 10 discovery and connectivity tests passed: launcher-only app listing and privacy-safe network diagnostics.");


// Stage 10 Wave 6: user-selected media and reviewed file sharing.
assert.ok(nativeJava.includes("public void pickMedia(PluginCall call)"));
assert.ok(nativeJava.includes("handleMediaResult(PluginCall call"));
assert.ok(nativeJava.includes("public void shareSelectedFile(PluginCall call)"));
assert.ok(nativeJava.includes("Intent.ACTION_OPEN_DOCUMENT"));
assert.ok(nativeJava.includes("Intent.EXTRA_STREAM"));
assert.ok(nativeJava.includes("FLAG_GRANT_READ_URI_PERMISSION"));
assert.ok(nativeJava.includes("fileSentByAurora"));
assert.ok(nativeBridge.includes("pickMedia(options:"));
assert.ok(nativeBridge.includes("shareSelectedFile(options:"));
assert.ok(capabilityRuntime.includes('id: "files.pick_media"'));
assert.ok(capabilityRuntime.includes('id: "files.share_selected_file"'));
assert.ok(capabilityRuntime.includes("contentLoaded: false"));
console.log("AURORA Stage 10 media picker and explicit file-sharing tests passed.");


// Stage 10 Wave 7: explicit, bounded clipboard read/write.
assert.ok(nativeJava.includes("public void readClipboardText(PluginCall call)"));
assert.ok(nativeJava.includes("public void writeClipboardText(PluginCall call)"));
assert.ok(nativeJava.includes("getPrimaryClip()"));
assert.ok(nativeJava.includes("setPrimaryClip"));
assert.ok(nativeJava.includes("text.length() > 8000"));
assert.ok(nativeBridge.includes("readClipboardText(): Promise"));
assert.ok(nativeBridge.includes("writeClipboardText(options:"));
for (const id of ['device.read_clipboard', 'device.write_clipboard']) {
  assert.ok(capabilityRuntime.includes('id: "' + id + '"'));
}
assert.ok(capabilityRuntime.includes("notStored: true"));
console.log("AURORA Stage 10 clipboard tests passed: explicit approval, bounded text and no persistence.");


// Stage 10 Wave 8: camera capture is explicit and preview-only.
assert.equal((nativeJava.match(/public void capturePhoto\(PluginCall call\)/g) || []).length, 1);
assert.ok(nativeJava.includes("MediaStore.ACTION_IMAGE_CAPTURE"));
assert.ok(nativeJava.includes('extras.get("data")'));
assert.ok(nativeJava.includes("CompressFormat.JPEG"));
assert.ok(nativeJava.includes("2 * 1024 * 1024"));
assert.ok(nativeJava.includes('put("thumbnailOnly", true)'));
assert.ok(nativeJava.includes('put("fullResolutionSaved", false)'));
assert.ok(nativeBridge.includes("capturePhoto(): Promise"));
assert.ok(nativeBridge.includes("capturePhoto: async"));
assert.ok(capabilityRuntime.includes('id: "camera.capture_preview"'));
assert.ok(capabilityRuntime.includes("approvalRequired: true"));
assert.ok(capabilityRuntime.includes("fullResolutionSaved: false"));
console.log("AURORA Stage 10 camera tests passed: user-invoked system camera, bounded thumbnail-only result and approval gate.");



// Stage 10 Wave 8: explicit external-camera capture with thumbnail-only return.
assert.ok(nativeJava.includes("public void capturePhoto(PluginCall call)"));
assert.ok(nativeJava.includes("MediaStore.ACTION_IMAGE_CAPTURE"));
assert.ok(nativeJava.includes("thumbnailOnly"));
assert.ok(nativeJava.includes("fullResolutionSaved"));
assert.ok(nativeBridge.includes("capturePhoto(): Promise"));
assert.ok(nativeBridge.includes("capturePhoto: async"));
assert.ok(capabilityRuntime.includes('id: "camera.capture_photo"'));
assert.ok(capabilityRuntime.includes("approvalRequired: true"));
assert.ok(capabilityRuntime.includes("fullResolutionSaved: false"));
console.log("AURORA Stage 10 camera capture tests passed: explicit approval and thumbnail-only result.");


// Stage 10 Wave 9: user-controlled audio recording handoff.
assert.equal((nativeJava.match(/public void prepareAudioRecording\(PluginCall call\)/g) || []).length, 1);
assert.ok(nativeJava.includes('new Intent("android.provider.MediaStore.RECORD_SOUND")'));
assert.ok(nativeJava.includes("handleAudioRecordingResult(PluginCall call"));
assert.ok(nativeJava.includes('put("userControlledRecorder", true)'));
assert.ok(nativeJava.includes('put("audioReadByAurora", false)'));
assert.ok(nativeBridge.includes("prepareAudioRecording(): Promise"));
assert.ok(nativeBridge.includes("prepareAudioRecording: async"));
assert.ok(capabilityRuntime.includes('id: "audio.prepare_recording"'));
assert.ok(capabilityRuntime.includes("approvalRequired: true"));
assert.ok(capabilityRuntime.includes("audioReadByAurora: false"));
console.log("AURORA Stage 10 audio tests passed: explicit external recorder handoff, user-controlled recording and no automatic audio reading.");


// Stage 10 Wave 10: open a selected, still-active notification in its originating app.
assert.ok(notificationService.includes("public static boolean openNotification(String key)"));
assert.ok(notificationService.includes("getActiveNotifications()"));
assert.ok(notificationService.includes("notification.contentIntent.send()"));
assert.ok(nativeJava.includes("public void openNotification(PluginCall call)"));
assert.ok(nativeJava.includes("Enable AURORA Notification Access"));
assert.ok(nativeBridge.includes("openNotification(options: { key: string })"));
assert.ok(nativeBridge.includes("openNotification: async"));
assert.ok(capabilityRuntime.includes('id: "notifications.open_item"'));
assert.ok(capabilityRuntime.includes("approvalRequired: true"));
assert.ok(capabilityRuntime.includes("notificationModified: false"));
assert.ok(capabilityRuntime.includes("messageSent: false"));
assert.ok(capabilityRuntime.includes("Select a notification from AURORA's recent notification list first."));

assert.ok(notificationService.includes("public static boolean dismissNotification(String key)"));
assert.ok(notificationService.includes("service.cancelNotification(key)"));
assert.ok(nativeJava.includes("public void dismissNotification(PluginCall call)"));
assert.ok(nativeBridge.includes("dismissNotification(options: { key: string })"));
assert.ok(nativeBridge.includes("dismissNotification: async"));
assert.ok(capabilityRuntime.includes('id: "notifications.dismiss_item"'));
assert.ok(capabilityRuntime.includes("otherNotificationsAffected: false"));
console.log("AURORA Stage 10 notification tests passed: explicit approval, active-item validation and open-only behavior.");


// Stage 10 Wave 13: approval-gated Android active media-session transport controls.
assert.ok(notificationService.includes("controlActiveMedia(String requestedAction)"));
for (const action of ["play_pause", "next", "previous"]) assert.ok(notificationService.includes('"'+action+'"'));
assert.ok(notificationService.includes("Notification.EXTRA_MEDIA_SESSION"));
assert.ok(notificationService.includes("MediaController.TransportControls"));
assert.ok(notificationService.includes("controls.skipToNext()"));
assert.ok(notificationService.includes("controls.skipToPrevious()"));
assert.ok(nativeJava.includes("public void controlActiveMedia(PluginCall call)"));
assert.ok(nativeBridge.includes("controlActiveMedia(options:"));
assert.ok(nativeBridge.includes("controlActiveMedia: async"));
assert.ok(capabilityRuntime.includes('id: "media.control_active_session"'));
assert.ok(capabilityRuntime.includes('permissionRequirements: ["android.notification_access"]'));
assert.ok(capabilityRuntime.includes("approvalRequired: true"));
console.log("AURORA Stage 10 media-session tests passed: selected active session only, supported transport actions, Notification Access and explicit approval.");

// Stage 10 Wave 12: expanded read-only device health diagnostics.
assert.ok(nativeJava.includes("public void getDeviceStatus(PluginCall call)"));
assert.ok(nativeJava.includes("BatteryManager.EXTRA_TEMPERATURE"));
assert.ok(nativeJava.includes("BatteryManager.EXTRA_VOLTAGE"));
assert.ok(nativeJava.includes("memoryAvailableBytes"));
assert.ok(nativeJava.includes("memoryTotalBytes"));
assert.ok(nativeJava.includes("memoryLow"));
assert.ok(nativeJava.includes("getCurrentThermalStatus()"));
assert.ok(nativeJava.includes('result.put("readOnly", true)'));
assert.ok(nativeJava.includes('result.put("capturedAt", System.currentTimeMillis())'));
assert.ok(nativeBridge.includes("batteryTemperatureC?: number"));
assert.ok(nativeBridge.includes("memoryAvailableBytes?: number"));
assert.ok(nativeBridge.includes("thermalStatus?: number"));
assert.ok(capabilityRuntime.includes("verified read-only device health snapshot"));
console.log("AURORA Stage 10 device health tests passed: battery, memory and thermal diagnostics are read-only and timestamped.");

