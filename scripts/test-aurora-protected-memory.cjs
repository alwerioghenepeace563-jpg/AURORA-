const assert = require("node:assert/strict");
(async () => {
  const { createAuroraProtectedMemory } = await import("../src/core/aurora-protected-memory.js");
  const values = new Map();
  const secureStore = {
    status: () => ({ available: true, encryption: "android-keystore-aes-gcm" }),
    async set(key, value) { values.set(key, value); },
    async get(key) { return values.has(key) ? { found: true, value: values.get(key) } : { found: false, value: null }; },
    async remove(key) { values.delete(key); }
  };
  const vault = createAuroraProtectedMemory({ secureStore });
  const saved = await vault.remember({ id: "private-1", title: "Private note", content: "A protected test record" });
  assert.equal(saved.storage, "android-keystore-encrypted");
  assert.equal((await vault.get("private-1")).content, "A protected test record");
  assert.equal((await vault.list()).length, 1);
  assert.equal(await vault.forget("private-1"), true);
  assert.equal(await vault.get("private-1"), null);
  assert.equal(await vault.forget("private-1"), false);
  const unavailable = createAuroraProtectedMemory({ secureStore: { ...secureStore, status: () => ({ available: false, encryption: "unavailable" }) } });
  await assert.rejects(() => unavailable.remember({ content: "must not fall back" }), /Android Keystore-backed encryption/);
  await assert.rejects(() => vault.remember({ content: "x".repeat(4001) }), /1–4,000/);
  await assert.rejects(() => vault.get("../bad"), /ID is invalid/);
  values.set("aurora.pm.index", "{broken");
  await assert.rejects(() => vault.list(), /index is unreadable/);
  console.log("AURORA protected memory tests passed: Android-only encryption gate, bounded records, read/list/delete, and corruption safety.");
})().catch(error => { console.error(error); process.exitCode = 1; });
