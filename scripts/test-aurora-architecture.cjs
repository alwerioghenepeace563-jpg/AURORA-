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

  for (const capabilityId of ["communication.prepare_sms", "communication.share_text"]) {
    assert.ok(capabilitySource.includes('id: "' + capabilityId + '"'), "Missing Stage 5 communication/share adapter: " + capabilityId);
  }
  for (const nativeMethod of ["prepareSms", "shareText"]) {
    assert.ok(nativeSource.includes(nativeMethod), "Missing typed native bridge method: " + nativeMethod);
    assert.ok(pluginSource.includes("void " + nativeMethod + "(PluginCall call)"), "Missing Android plugin method: " + nativeMethod);
  }
  assert.ok(pluginSource.includes("Intent.ACTION_SENDTO"), "SMS must open the user's composer rather than sending directly.");
  assert.ok(pluginSource.includes('Uri.parse("smsto:"'), "SMS must use the Android SMS composer URI.");
  assert.ok(pluginSource.includes('Intent.createChooser(send, "Share with")'), "Text sharing must use Android's user-controlled chooser.");

  for (const nativeMethod of ["requestContactsPermission", "searchContacts", "openDialer"]) {
    assert.ok(nativeSource.includes(nativeMethod), "Missing typed contacts/dialler bridge method: " + nativeMethod);
    assert.ok(pluginSource.includes("void " + nativeMethod + "(PluginCall call)"), "Missing Android contacts/dialler implementation: " + nativeMethod);
  }
  assert.ok(pluginSource.includes("Manifest.permission.READ_CONTACTS"), "Contacts access must be protected by Android runtime permission.");
  assert.ok(pluginSource.includes("ContactsContract.CommonDataKinds.Phone.CONTENT_URI"), "Contact search must use Android contacts provider.");
  assert.ok(pluginSource.includes("count < 20"), "Contact search results must be bounded.");
  assert.ok(pluginSource.includes("Intent.ACTION_DIAL"), "Phone calls must open the dialler and never place a call silently.");

  for (const nativeMethod of ["hasOverlayPermission", "requestOverlayPermission"]) {
    assert.ok(nativeSource.includes(nativeMethod), "Missing typed overlay permission bridge method: " + nativeMethod);
    assert.ok(pluginSource.includes("void " + nativeMethod + "(PluginCall call)"), "Missing Android overlay permission method: " + nativeMethod);
  }
  assert.ok(pluginSource.includes("Settings.canDrawOverlays"), "Overlay availability must reflect Android's actual permission state.");
  assert.ok(pluginSource.includes("Settings.ACTION_MANAGE_OVERLAY_PERMISSION"), "Overlay permission must be granted through Android Settings.");
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
  assert.ok(nativeSource.includes("speakText(options: { text: string; rate?: number; pitch?: number })"), "Android speech synthesis with optional rate and pitch controls must be exposed through the typed native bridge.");
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
  assert.ok(sharedRuntimeSource.includes('import { createAuroraProtectedMemory } from "./aurora-protected-memory";'), "Protected memory must be available through the shared runtime.");
  assert.ok(sharedRuntimeSource.includes("const protectedMemory = createAuroraProtectedMemory({ secureStore: secureStorage });"), "Protected memory must use the shared Keystore-backed secure store.");
  assert.ok(sharedRuntimeSource.includes("  protectedMemory,"), "Main, Pulse, and voice must share protected memory.");
  assert.ok(sharedRuntimeSource.includes("protected_memory: () =>"), "Protected memory must appear in the privacy inventory.");
  const storageGuardSource = fs.readFileSync(path.join(__dirname, "../src/core/aurora-storage-guard.js"), "utf8");
  assert.ok(storageGuardSource.includes("no data was changed"), "Malformed local data must fail closed rather than reset.");
  for (const file of ["aurora-memory.js", "aurora-consent-registry.js", "aurora-knowledge-graph.js", "aurora-task-journal.js", "aurora-workflow-registry.js", "aurora-routine-scheduler.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "../src/core", file), "utf8");
    assert.ok(source.includes("readStoredJson"), file + " must use the shared fail-closed persistence reader.");
  }
  const protectedMemorySource = fs.readFileSync(path.join(__dirname, "../src/core/aurora-protected-memory.js"), "utf8");
  assert.ok(protectedMemorySource.includes("android-keystore-aes-gcm"), "Protected memory must fail closed without Android Keystore encryption.");
  assert.ok(protectedMemorySource.includes("MAX_RECORDS = 100"), "Protected memory must enforce a bounded record count.");
  assert.ok(protectedMemorySource.includes("MAX_CONTENT = 4000"), "Protected memory must enforce a content-size limit.");
  const layerRegistrySource = fs.readFileSync(path.join(__dirname, "../src/core/aurora-layer-registry.js"), "utf8");
  const knowledgeUniverseSource = fs.readFileSync(path.join(__dirname, "../src/core/aurora-knowledge-universe.js"), "utf8");
  assert.ok(sharedRuntimeSource.includes("knowledgeUniverse: auroraKnowledgeUniverse"), "Stage 9 knowledge must be available from the shared runtime.");
  assert.ok(sharedRuntimeSource.includes("aurora_knowledge_file_import") && sharedRuntimeSource.includes("android_document_picker"), "Explicit Android document imports must be connected to the local knowledge universe.");
  assert.ok(sharedRuntimeSource.includes("describedMediaMatch") && sharedRuntimeSource.includes("android_picker_user_description") && sharedRuntimeSource.includes("aurora_knowledge_media_import"), "User-selected images and audio recordings must be indexed only with an explicit user description or transcript.");
  assert.ok(sharedRuntimeSource.includes("nothing was saved") && sharedRuntimeSource.includes("Nothing was added to the knowledge universe"), "Unsupported or cancelled file imports must not claim success.");
  assert.ok(sharedRuntimeSource.includes("knowledgeSaveMatch") && sharedRuntimeSource.includes("knowledgeSearchMatch"), "Chat, Pulse and voice must expose explicit Stage 9 save and search commands.");
  assert.ok(sharedRuntimeSource.includes("aurora_knowledge_timeline"), "Stage 9 timeline must be reachable through the shared conversational runtime.");
  for (const route of ["knowledgeRecordMatch", "relatedKnowledgeMatch", "connectKnowledgeMatch", "aurora_knowledge_source", "aurora_related_knowledge", "aurora_knowledge_link"]) {
    assert.ok(sharedRuntimeSource.includes(route), "Missing Stage 9 source inspection/relationship route: " + route);
  }
  for (const api of ["addKnowledgeSource", "searchKnowledge", "relateKnowledge", "relatedKnowledge", "knowledgeTimeline", "correctKnowledge", "forgetKnowledge"]) assert.ok(sharedRuntimeSource.includes(api), "Missing shared knowledge API: " + api);
  for (const contract of ["userApproved !== true", "fingerprint", "source:", "function search(", "function timeline(", "function correct(", "function remove(", "MAX_RECORDS = 500", "MAX_CONTENT = 12000"]) assert.ok(knowledgeUniverseSource.includes(contract), "Missing Stage 9 knowledge contract: " + contract);
  assert.ok(knowledgeUniverseSource.includes("cloudSync: false") && knowledgeUniverseSource.includes("automaticCapture: false"), "Knowledge indexing must remain local and user initiated.");
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
  assert.ok(sharedRuntimeSource.includes("corrupt/unavailable consent storage fails closed"), "A corrupt persisted consent registry must not crash startup or enable cloud sync.");
  for (const permissionId of ["android.contacts", "android.accessibility", "android.notification_access", "android.camera"]) {
    assert.ok(capabilitySource.includes('"' + permissionId + '"'), "Missing shared Android permission adapter: " + permissionId);
  }

  // Stage 5 adapter wiring: native features must be reachable through the shared Action Engine.
  for (const capabilityId of [
    "voice.start_listening", "voice.stop_listening", "voice.speak_text", "voice.stop_speaking",
    "assistant.start_background_service", "assistant.stop_background_service", "assistant.get_status",
    "device.open_accessibility_settings", "device.get_build_info", "notifications.request_permission"
  ]) {
    assert.ok(capabilitySource.includes(`id: "${capabilityId}"`), `Missing Stage 5 capability registration: ${capabilityId}`);
  }
  for (const nativeMethod of [
    "startSpeechRecognition", "stopSpeechRecognition", "speakText", "stopTextSpeech",
    "startAssistantService", "stopAssistantService", "openAccessibilitySettings",
    "getBuildInfo", "requestMicrophonePermission", "requestNotificationPermission"
  ]) {
    assert.ok(nativeSource.includes(nativeMethod), `Missing Stage 5 TypeScript bridge method: ${nativeMethod}`);
    assert.ok(pluginSource.includes(`void ${nativeMethod}(PluginCall call)`), `Missing Stage 5 Android plugin method: ${nativeMethod}`);
  }
  for (const permissionId of ["android.microphone", "android.notifications"]) {
    assert.ok(capabilitySource.includes('"' + permissionId + '"'), "Missing Stage 5 permission adapter: " + permissionId);
  }
  const voiceStart = capabilitySource.slice(
    capabilitySource.indexOf('id: "voice.start_listening"'),
    capabilitySource.indexOf('id: "voice.stop_listening"')
  );
  assert.ok(voiceStart.includes("approvalRequired: true"), "Starting microphone capture must require explicit approval.");
  assert.ok(voiceStart.includes('permissionRequirements: ["android.microphone"]'), "Voice input must require microphone permission.");


  for (const capabilityId of ["communication.prepare_sms", "communication.share_text"]) {
    assert.ok(capabilitySource.includes('id: "' + capabilityId + '"'), "Missing Stage 5 communication adapter: " + capabilityId);
  }
  const smsCapability = capabilitySource.slice(
    capabilitySource.indexOf('id: "communication.prepare_sms"'),
    capabilitySource.indexOf('id: "communication.share_text"')
  );
  assert.ok(smsCapability.includes("approvalRequired: true"), "SMS drafting must require fresh approval.");
  assert.ok(smsCapability.includes("requiresUserSend: true"), "AURORA must never send SMS without the user's final action.");
  const shareCapability = capabilitySource.slice(
    capabilitySource.indexOf('id: "communication.share_text"'),
    capabilitySource.indexOf('id: "communication.open_dialer"')
  );
  assert.ok(shareCapability.includes("approvalRequired: true"), "Sharing content externally must require fresh approval.");
  assert.ok(shareCapability.includes("requiresUserDestination: true"), "The user must choose and confirm the share destination.");
  for (const method of ["prepareSms", "shareText"]) {
    assert.ok(nativeSource.includes(method + ": async"), "Missing Stage 5 TypeScript native wrapper: " + method);
    assert.ok(pluginSource.includes("void " + method + "(PluginCall call)"), "Missing Stage 5 Android plugin method: " + method);
  }

  assert.ok(capabilitySource.includes('id: "notifications.search_recent"'), "Recent notifications must be searchable through the shared Action Engine.");
  const notificationSearch = capabilitySource.slice(
    capabilitySource.indexOf('id: "notifications.search_recent"'),
    capabilitySource.indexOf('id: "notifications.clear_recent"')
  );
  assert.ok(notificationSearch.includes("approvalRequired: true"), "Searching private notifications must require fresh approval.");
  assert.ok(notificationSearch.includes('permissionRequirements: ["android.notification_access"]'), "Notification search must require Notification Access.");
  assert.ok(notificationSearch.includes("localOnly: true"), "Notification search results must remain local.");
  assert.ok(capabilitySource.includes('id: "files.search_selected_text"'), "Selected document text must support local search.");
  const documentSearch = capabilitySource.slice(
    capabilitySource.indexOf('id: "files.search_selected_text"'),
    capabilitySource.indexOf('id: "notifications.open_access_settings"')
  );
  assert.ok(documentSearch.includes("approvalRequired: true"), "Reading selected document text must require explicit approval.");
  assert.ok(documentSearch.includes("1000000"), "Document search must enforce a 1 MB input bound.");
  assert.ok(documentSearch.includes("notStored: true"), "Document search must explicitly report that content is not stored.");

  assert.ok(capabilitySource.includes('id: "notifications.request_permission"'), "Android notification permission must be requestable through the Action Engine.");
  const backgroundStart = capabilitySource.slice(
    capabilitySource.indexOf('id: "assistant.start_background_service"'),
    capabilitySource.indexOf('id: "assistant.stop_background_service"')
  );
  assert.ok(backgroundStart.includes("approvalRequired: true"), "Starting the persistent assistant service must require explicit approval.");
  assert.ok(backgroundStart.includes('permissionRequirements: ["android.microphone"]'), "Starting the assistant service must require microphone permission.");
  console.log("AURORA architecture tests passed: registry, shared events, approval gate, idempotency, and rejection safety.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
