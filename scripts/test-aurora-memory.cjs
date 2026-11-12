const assert = require("node:assert/strict");

(async () => {
  const { createAuroraMemory, AURORA_MEMORY_STORAGE_KEY } = await import("../src/core/aurora-memory.js");
  const values = new Map();
  const storage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  let id = 0;
  const memory = createAuroraMemory({ storage, now: () => "2026-11-09T00:00:00.000Z", createId: () => "memory-" + (++id) });
  const saved = memory.remember({ kind: "project", title: "AURORA architecture", content: "Hybrid memory stays local unless cloud sync is explicitly enabled.", tags: ["AURORA", "architecture"] });
  assert.equal(saved.id, "memory-1");
  assert.equal(memory.search("hybrid cloud memory")[0].id, saved.id);
  assert.equal(memory.status().mode, "local");
  assert.equal(memory.status().automaticBulkUpload, false);
  assert.throws(() => memory.configureCloud({ enabled: true, adapter: { upsert() {}, remove() {} } }), /consent/i);
  let uploaded = 0;
  const adapter = { upsert: async () => { uploaded++; }, remove: async () => {} };
  memory.configureCloud({ enabled: true, adapter, consent: true });
  await memory.syncRecord(saved.id);
  assert.equal(uploaded, 1);
  assert.equal(memory.status().mode, "hybrid");
  assert.equal(memory.forget(saved.id), true);
  assert.equal(memory.forget(saved.id), false);
  assert.equal(memory.list().length, 0);
  assert.equal(values.has(AURORA_MEMORY_STORAGE_KEY), true);
  assert.equal(memory.clear(), 0);
  assert.equal(values.has(AURORA_MEMORY_STORAGE_KEY), false);
  assert.throws(() => memory.remember({ content: " " }), /empty/i);
  console.log("AURORA memory tests passed: local-first storage, ranked search, explicit cloud consent, per-record sync and deletion.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
