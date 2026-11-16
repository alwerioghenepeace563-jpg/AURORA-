const fs = require("node:fs");
const assert = require("node:assert/strict");

const plugin = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java", "utf8");
const service = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraOverlayService.java", "utf8");
const bridge = fs.readFileSync("src/lib/aurora-native.ts", "utf8");

for (const method of ["showOverlay", "hideOverlay", "getOverlayStatus"]) {
  assert.match(plugin, new RegExp("public void " + method + "\\(PluginCall call\\)"), "Android plugin must implement " + method);
  assert.match(bridge, new RegExp(method + "\\("), "TypeScript bridge must expose " + method);
}
assert.match(plugin, /AuroraOverlayService\.ACTION_SHOW/, "showOverlay must start the native overlay service");
assert.match(plugin, /AuroraOverlayService\.ACTION_HIDE/, "hideOverlay must stop the native overlay service");
assert.match(service, /orbAttached/, "orb attachment must be tracked independently");
assert.match(service, /panelAttached/, "panel attachment must be tracked independently");
assert.match(service, /pulse_overlay_shown/, "overlay attachment state must be persisted for status reads");
assert.match(service, /reportOverlayStatus\(false, "AURORA Pulse is closed\."/);
assert.match(service, /removeOverlay\(\);[\s\S]*?reportOverlayStatus\(false, "AURORA Pulse service stopped\."/);\nassert.match(service, /stopPulseSpeech\(\);\s*removeOverlay\(\);/, "service destruction must stop microphone capture before removing the overlay");
assert.match(service, /if \(attached && orbAttached && panelAttached && orbView != null && panelView != null\)/,
  "only a complete orb+panel pair may be treated as already running");
console.log("AURORA Pulse native bridge contract checks passed.");
