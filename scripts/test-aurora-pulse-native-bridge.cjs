const fs = require("node:fs");
const assert = require("node:assert/strict");

const plugin = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java", "utf8");
const service = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraOverlayService.java", "utf8");
const bridge = fs.readFileSync("src/lib/aurora-native.ts", "utf8");
const panel = fs.readFileSync("android/app/src/main/assets/aurora_pulse_panel.html", "utf8");
const orb = fs.readFileSync("android/app/src/main/assets/aurora_pulse_orb.html", "utf8");
const edges = fs.readFileSync("android/app/src/main/assets/aurora_pulse_edges.html", "utf8");

for (const method of ["showOverlay", "hideOverlay", "getOverlayStatus"]) {
  assert.match(plugin, new RegExp("public void " + method + "\\(PluginCall call\\)"), "Android plugin must implement " + method);
  assert.match(bridge, new RegExp(method + "\\("), "TypeScript bridge must expose " + method);
}
assert.match(plugin, /AuroraOverlayService\.ACTION_SHOW/, "showOverlay must start the native overlay service");
assert.match(plugin, /AuroraOverlayService\.ACTION_HIDE/, "hideOverlay must stop the native overlay service");
assert.match(service, /orbAttached/, "orb attachment must be tracked independently");
assert.match(service, /panelAttached/, "panel attachment must be tracked independently");
assert.match(service, /edgeView/, "touch-through rainbow edge layer must be attached");
assert.match(service, /FLAG_NOT_TOUCHABLE/, "screen edge light must never intercept background taps");
assert.match(service, /movePanelBy/, "native glass conversation window must be movable");
assert.match(service, /pulse_overlay_shown/, "overlay attachment state must be persisted for status reads");
assert.match(service, /reportOverlayStatus\(false, "AURORA Pulse is closed\."/);
assert.match(service, /removeOverlay\(\);\s*reportOverlayStatus\(false, "AURORA Pulse service stopped\."/);
assert.match(service, /if \(attached && orbAttached && panelAttached && orbView != null && panelView != null\)/,
  "only a complete orb+panel pair may be treated as already running");
assert.match(service, /aurora_pulse_edges\.html/, "native overlay must load the separate screen-edge light asset");
assert.match(service, /aurora_pulse_panel\.html/, "native overlay must load the glass conversation asset");
console.log("AURORA Pulse native bridge, touch-through edge and movable panel checks passed.");
