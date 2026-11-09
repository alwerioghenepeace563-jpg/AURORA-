const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const { createAuroraActionEngine } = await import("../src/core/aurora-action-engine.js");
  const { createAuroraApprovalBroker } = await import("../src/core/aurora-approval-broker.js");
  let executions = 0;
  let approvals = 0;
  const events = [];
  const engine = createAuroraActionEngine({
    createId: (() => { let id = 0; return () => "test-" + (++id); })(),
    now: () => "2026-11-09T00:00:00.000Z",
    approve: async () => { approvals++; return { approved: true, approvalId: "approval-test" }; }
  });
  engine.subscribe((event) => events.push(event.type));
  engine.registerCapability({ id: "test.low_risk", label: "Low-risk internal action", risk: "low", execute: async ({ value }) => { executions++; return { value }; } });
  engine.registerCapability({ id: "test.approved_action", label: "Approval-gated action", risk: "high", execute: async () => { executions++; return { changed: true }; } });

  const low = await engine.execute({ capabilityId: "test.low_risk", input: { value: 7 }, requestId: "low-1" });
  assert.equal(low.status, "completed");
  assert.equal(low.result.value, 7);
  assert.equal(approvals, 0);

  const gated = await engine.execute({ capabilityId: "test.approved_action", input: {}, requestId: "high-1" });
  assert.equal(gated.status, "completed");
  assert.equal(approvals, 1);
  const duplicate = await engine.execute({ capabilityId: "test.approved_action", input: {}, requestId: "high-1" });
  assert.equal(duplicate, gated);
  assert.equal(executions, 2);
  assert.ok(events.includes("action.approval_required"));
  assert.ok(events.includes("action.completed"));

  const deniedEngine = createAuroraActionEngine({ approve: async () => ({ approved: false }) });
  let deniedExecutions = 0;
  deniedEngine.registerCapability({ id: "test.denied_action", risk: "high", execute: async () => { deniedExecutions++; } });
  const denied = await deniedEngine.execute({ capabilityId: "test.denied_action" });
  assert.equal(denied.status, "rejected");
  assert.equal(deniedExecutions, 0);
  let concurrentRuns = 0;
  const concurrentEngine = createAuroraActionEngine({ approve: async () => ({ approved: true }) });
  concurrentEngine.registerCapability({
    id: "test.concurrent_write", risk: "low",
    execute: async () => { concurrentRuns++; await new Promise((resolve) => setTimeout(resolve, 10)); return { ok: true }; }
  });
  const concurrent = await Promise.all([
    concurrentEngine.execute({ capabilityId: "test.concurrent_write", requestId: "same-request" }),
    concurrentEngine.execute({ capabilityId: "test.concurrent_write", requestId: "same-request" })
  ]);
  assert.equal(concurrentRuns, 1);
  assert.equal(concurrent[0], concurrent[1]);

  const broker = createAuroraApprovalBroker({ createId: () => "approval-1", timeoutMs: 5000 });
  const approvalEvents = [];
  broker.subscribe((event) => approvalEvents.push(event.type));
  const decisionPromise = broker.request({ requestId: "req-1", capabilityId: "test.approved_action", label: "Test approval", risk: "high", input: {} });
  assert.equal(broker.listPending().length, 1);
  assert.equal(broker.approve("approval-1"), true);
  const decision = await decisionPromise;
  assert.equal(decision.approved, true);
  assert.equal(broker.listPending().length, 0);
  assert.ok(approvalEvents.includes("approval.created"));
  assert.ok(approvalEvents.includes("approval.approved"));

  const capabilitySource = fs.readFileSync(path.join(__dirname, "../src/core/aurora-capability-runtime.js"), "utf8");
  const nativeSource = fs.readFileSync(path.join(__dirname, "../src/lib/aurora-native.ts"), "utf8");
  const pluginSource = fs.readFileSync(path.join(__dirname, "../android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java"), "utf8");
  for (const capabilityId of ["maps.search_place", "maps.get_directions", "calendar.prepare_event", "media.search_play", "files.pick_document", "notifications.open_access_settings", "notifications.read_recent", "notifications.clear_recent", "device.get_status", "device.set_flashlight"]) {
    assert.ok(capabilitySource.includes(`id: "${capabilityId}"`), `Missing capability registration: ${capabilityId}`);
  }
  for (const nativeMethod of ["searchOnMap", "startMapDirections", "prepareCalendarEvent", "searchMedia", "pickDocument", "openNotificationAccessSettings", "hasNotificationAccess", "readRecentNotifications", "clearRecentNotifications", "getDeviceStatus", "setFlashlight", "requestCameraPermission"]) {
    assert.ok(nativeSource.includes(nativeMethod), `Missing TypeScript native bridge: ${nativeMethod}`);
    assert.ok(pluginSource.includes(`void ${nativeMethod}(PluginCall call)`), `Missing Android plugin method: ${nativeMethod}`);
  }
  assert.ok(pluginSource.includes("Intent.ACTION_INSERT"), "Calendar event must use Android's review-before-save editor.");
  assert.ok(pluginSource.includes("MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH"), "Media search must use Android media handoff.");
  assert.ok(pluginSource.includes("Intent.ACTION_OPEN_DOCUMENT"), "File access must use Android's user-selected document picker.");
  assert.ok(pluginSource.includes("1024 * 1024"), "Text file previews must enforce the 1 MB limit.");
  assert.ok(pluginSource.includes("Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"), "Notification access must be configured through Android Settings.");
  assert.ok(pluginSource.includes("AuroraNotificationListenerService.readRecent"), "Notifications must be read through the opt-in listener.");
  assert.ok(fs.readFileSync(path.join(__dirname, "../android/app/src/main/java/com/aurora/assistant/AuroraNotificationListenerService.java"), "utf8").includes("getNoBackupFilesDir"), "Notification previews must be excluded from Android cloud backups.");
  assert.ok(pluginSource.includes("CameraManager"), "Flashlight control must use Android CameraManager.");
  assert.ok(pluginSource.includes("requestPermissionForAlias(\"camera\""), "Flashlight control must request camera permission before activation.");
  assert.ok(pluginSource.includes("BatteryManager.EXTRA_LEVEL"), "Device status must include battery information.");
  assert.ok(nativeSource.includes("speakText(options: { text: string })"), "Android speech synthesis must be exposed through the typed native bridge.");
  assert.ok(nativeSource.includes('addListener("ttsStatus", callback)'), "Android speech synthesis completion events must be observable by the app.");
  assert.ok(pluginSource.includes("TextToSpeech.QUEUE_FLUSH"), "Android speech fallback must replace stale queued speech.");
  assert.ok(pluginSource.includes("UtteranceProgressListener"), "Android speech fallback must report completion and errors.");
  assert.ok(pluginSource.includes('notifyListeners("ttsStatus"'), "Android speech completion events must reach the UI.");
  assert.ok(fs.existsSync(path.join(__dirname, "../android/app/src/main/java/com/aurora/assistant/AuroraNotificationListenerService.java")), "Notification listener service must exist.");
  assert.ok(fs.readFileSync(path.join(__dirname, "../android/app/src/main/AndroidManifest.xml"), "utf8").includes("BIND_NOTIFICATION_LISTENER_SERVICE"), "Notification listener must be protected by Android's binding permission.");
  assert.throws(() => engine.registerCapability({ id: "bad id", execute: async () => {} }), /identifiers/i);
  const nativePatchScript = fs.readFileSync(path.join(__dirname, "patch-android-native.mjs"), "utf8");
  assert.ok(nativePatchScript.includes('name === "AuroraAssistantPlugin.java" && fs.existsSync(target)'), "Android build bootstrap must preserve the committed native plugin.");
  assert.ok(nativePatchScript.includes("requiredNativeMethods"), "Android build bootstrap must verify native adapters instead of silently overwriting them.");
  assert.ok(nativePatchScript.includes('"speakText", "stopTextSpeech"'), "Android build bootstrap must verify native speech synthesis methods.");
  assert.ok(nativePatchScript.includes("AuroraNotificationListenerService"), "Android build bootstrap must register the notification listener service.");
  const foundationMap = fs.readFileSync(path.join(__dirname, "../docs/architecture/AURORA_COMPLETE_FOUNDATION_MAP.md"), "utf8");
  for (const foundation of [
    "Android and device interaction",
    "Voice and multimodal interaction",
    "Screen, accessibility, and notifications",
    "Communication and people",
    "Location, maps, and travel",
    "Calendar, tasks, and productivity",
    "Files, documents, and knowledge",
    "Media and creative tools",
    "Intelligence and personalisation",
    "Extensions and interoperability",
    "Safety, privacy, and security",
    "Reliability and operations"
  ]) {
    assert.ok(foundationMap.includes(foundation), `Missing AURORA foundation family: ${foundation}`);
  }
  assert.ok(foundationMap.includes("One brain, many surfaces"), "Main, Pulse, and voice must share one architecture.");
  assert.ok(foundationMap.includes("not a claim that every listed capability is already implemented"), "The foundation map must distinguish architecture from shipped functionality.");
  assert.ok(foundationMap.includes("Do not regenerate or replace the Android signing key"), "Signing identity must remain protected.");
  const sharedRuntimeSource = fs.readFileSync(path.join(__dirname, "../src/core/aurora-runtime.js"), "utf8");
  assert.ok(sharedRuntimeSource.includes('import { auroraLayerRegistry } from "./aurora-layer-registry";'), "The shared runtime must own the staged layer registry.");
  assert.ok(sharedRuntimeSource.includes("  layers: auroraLayerRegistry,"), "All surfaces must be able to inspect the same layer registry.");
  const layerRegistrySource = fs.readFileSync(path.join(__dirname, "../src/core/aurora-layer-registry.js"), "utf8");
  const stagedRoadmap = fs.readFileSync(path.join(__dirname, "../docs/architecture/AURORA_STAGED_IMPLEMENTATION_ROADMAP.md"), "utf8");
  for (const layerId of ["android_device", "voice_multimodal", "screen_accessibility", "communication_people", "location_travel", "calendar_productivity", "files_knowledge", "media_creative", "intelligence_personalisation", "extensions_interoperability", "safety_privacy_security", "reliability_operations"]) {
    assert.ok(layerRegistrySource.includes('id: "' + layerId + '"'), `Missing staged layer registry entry: ${layerId}`);
  }
  assert.ok(stagedRoadmap.includes("Every stage advances every active layer"), "Every stage must upgrade the whole active system.");
  assert.ok(stagedRoadmap.includes("removed from the active upgrade queue"), "Final layers must leave the active queue only after acceptance.");
  assert.ok(stagedRoadmap.includes("Stage 1 — Whole-system baseline"), "Stage one checkpoint must be documented.");
  assert.ok(stagedRoadmap.includes("Stage 2 — Shared contracts and enforcement"), "Stage two contract work must be tracked.");
  assert.ok(stagedRoadmap.includes("All 12 layers remain active"), "No layer may be dropped before its own stage checks pass.");
  const actionEngineSource = fs.readFileSync(path.join(__dirname, "../src/core/aurora-action-engine.js"), "utf8");
  assert.ok(actionEngineSource.includes("permissionRequirements"), "Shared action contracts must declare permission requirements.");
  assert.ok(actionEngineSource.includes("consentRequirements"), "Shared action contracts must declare consent requirements.");
  assert.ok(actionEngineSource.includes("VERIFICATION_FAILED"), "Action completion must support result verification.");
  assert.ok(actionEngineSource.includes("timeoutMs"), "Every capability must expose a bounded execution deadline.");
  assert.ok(actionEngineSource.includes("ACTION_TIMEOUT"), "Execution deadlines must produce an explicit timeout receipt.");
  assert.ok(actionEngineSource.includes("ACTION_CANCELLED"), "Action cancellation must be explicit.");
  assert.ok(actionEngineSource.includes('idempotency: "request-id"'), "Repeated request IDs must use the shared idempotency contract.");
  assert.ok(actionEngineSource.includes("cancel: (requestId)"), "The Action Engine must expose cancellation by request ID.");
  assert.ok(actionEngineSource.includes("signal: controller.signal"), "Execution adapters must receive a cooperative cancellation signal.");
  assert.ok(layerRegistrySource.includes("STAGE_TWO_LAYER_AUDIT"), "Every capability family must carry Stage 2 contract evidence.");
  assert.ok(layerRegistrySource.includes('status: "complete"'), "Stage 2 contract checkpoint must be explicitly recorded as complete.");
  assert.ok(layerRegistrySource.includes('adapterContractAudit: "passed"'), "Every active layer must pass the Stage 2 adapter contract audit.");
  const consentRegistrySource = fs.readFileSync(path.join(__dirname, "../src/core/aurora-consent-registry.js"), "utf8");
  assert.ok(sharedRuntimeSource.includes("auroraConsents.isGranted(scope, source)"), "Shared runtime must enforce declared consent through the consent registry.");
  for (const permissionId of ["android.contacts", "android.accessibility", "android.notification_access", "android.camera"]) {
    assert.ok(capabilitySource.includes('"' + permissionId + '"'), "Missing shared Android permission adapter: " + permissionId);
  }
  console.log("AURORA architecture tests passed: registry, shared events, approval gate, idempotency, and rejection safety.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
