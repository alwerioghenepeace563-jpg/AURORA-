const assert = require("node:assert/strict");

(async () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  const { createAuroraTaskJournal } = await import("../src/core/aurora-task-journal.js");
  const journal = createAuroraTaskJournal({ storage, now: () => "2026-11-09T00:00:00.000Z" });
  journal.record({ type: "task.plan_created", plan: { id: "task-1", title: "Prepare notes", steps: [{ id: "s1" }] } });
  journal.record({ type: "task.started", taskId: "task-1" });
  assert.equal(journal.get("task-1").status, "running");
  assert.equal(journal.recoverable()[0].requiresFreshConfirmation, true);
  journal.record({ type: "task.finished", result: { taskId: "task-1", status: "failed" } });
  assert.equal(journal.get("task-1").status, "failed");
  assert.equal(journal.forget("task-1"), true);

  const { createAuroraMemory } = await import("../src/core/aurora-memory.js");
  const memory = createAuroraMemory({ storage, createId: () => "m-1" });
  const saved = memory.remember({ title: "Study plan", content: "Revise biology notes" });
  const { createAuroraMemorySync } = await import("../src/core/aurora-memory-sync.js");
  const sync = createAuroraMemorySync(memory);
  let upserts = 0;
  const adapter = { upsert: async () => { upserts++; }, remove: async () => {}, get: async () => null };
  assert.throws(() => sync.configure({ enabled: true, adapter }), /consent/i);
  sync.configure({ enabled: true, adapter, consent: true });
  assert.equal((await sync.syncOne(saved.id)).synced, true);
  assert.equal(upserts, 1);
  assert.equal(sync.status().bulkSync, false);
  sync.disable();
  assert.equal((await sync.syncOne(saved.id)).synced, false);

  const { createAuroraActionEngine } = await import("../src/core/aurora-action-engine.js");
  const { createAuroraCapabilityIntelligence } = await import("../src/core/aurora-capability-intelligence.js");
  const engine = createAuroraActionEngine();
  engine.registerCapability({ id: "device.get_status", label: "Get device status", category: "device", description: "Read battery and device details", risk: "low", execute: async () => ({}) });
  const intelligence = createAuroraCapabilityIntelligence(engine);
  assert.equal(intelligence.find("battery")[0].id, "device.get_status");
  assert.equal(intelligence.inspect().length, 1);
  const availability = await intelligence.availability("missing.capability");
  assert.equal(availability.available, false);
  console.log("AURORA next-wave tests passed: task recovery journal, explicit per-record memory sync, read-only capability discovery.");
})().catch(error => { console.error(error); process.exitCode = 1; });
