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
  for (const capabilityId of ["maps.search_place", "maps.get_directions", "calendar.prepare_event", "media.search_play", "files.pick_document"]) {
    assert.ok(capabilitySource.includes(`id: "${capabilityId}"`), `Missing capability registration: ${capabilityId}`);
  }
  for (const nativeMethod of ["searchOnMap", "startMapDirections", "prepareCalendarEvent", "searchMedia", "pickDocument"]) {
    assert.ok(nativeSource.includes(nativeMethod), `Missing TypeScript native bridge: ${nativeMethod}`);
    assert.ok(pluginSource.includes(`void ${nativeMethod}(PluginCall call)`), `Missing Android plugin method: ${nativeMethod}`);
  }
  assert.ok(pluginSource.includes("Intent.ACTION_INSERT"), "Calendar event must use Android's review-before-save editor.");
  assert.ok(pluginSource.includes("Intent.ACTION_MEDIA_PLAY_FROM_SEARCH"), "Media search must use Android media handoff.");
  assert.ok(pluginSource.includes("Intent.ACTION_OPEN_DOCUMENT"), "File access must use Android's user-selected document picker.");
  assert.ok(pluginSource.includes("1024 * 1024"), "Text file previews must enforce the 1 MB limit.");
  assert.throws(() => engine.registerCapability({ id: "bad id", execute: async () => {} }), /identifiers/i);
  console.log("AURORA architecture tests passed: registry, shared events, approval gate, idempotency, and rejection safety.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
