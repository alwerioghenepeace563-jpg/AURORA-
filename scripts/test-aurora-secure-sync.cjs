const assert = require("node:assert/strict");

(async () => {
  const { createAuroraSupabaseMemoryAdapter } = await import("../src/core/aurora-supabase-memory-adapter.js");
  const calls = [];
  let token = "user-access-token";
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "GET") return { ok: true, status: 200, text: async () => JSON.stringify([{ id: "m1", payload: { id: "m1", content: "Biology" }, updated_at: "2026-11-09T00:00:00Z" }]) };
    return { ok: true, status: 204, text: async () => "" };
  };
  const adapter = createAuroraSupabaseMemoryAdapter({ url: "https://example.supabase.co", anonKey: "public-anon-key", getAccessToken: () => token, fetchImpl });
  assert.equal(adapter.isConfigured(), true);
  await adapter.upsert({ id: "m1", content: "Biology", updatedAt: "2026-11-09T00:00:00Z" });
  assert.equal(calls[0].init.headers.Authorization, "Bearer user-access-token");
  assert.equal(calls[0].init.headers.apikey, "public-anon-key");
  assert.match(calls[0].url, /on_conflict=user_id,id/, "Upserts must use the per-user composite key.");
  assert.equal(JSON.parse(calls[0].init.body).user_id, undefined, "The database derives ownership from auth.uid().");
  const remote = await adapter.get("m1");
  assert.equal(remote.content, "Biology");
  await adapter.remove("m1");
  assert.match(calls[2].url, /aurora_memories/);
  assert.equal(calls[2].init.method, "DELETE");
  token = "";
  await assert.rejects(adapter.get("m1"), /Sign in/);
  const unconfigured = createAuroraSupabaseMemoryAdapter({});
  assert.equal(unconfigured.isConfigured(), false);
  await assert.rejects(unconfigured.get("m1"), /not configured/);

  const { createAuroraSecureStore } = await import("../src/core/aurora-secure-store.js");
  const values = new Map();
  const secure = createAuroraSecureStore({ available: true, adapter: {
    set: async (key, value) => values.set(key, value),
    get: async key => values.has(key) ? { found: true, value: values.get(key) } : { found: false },
    remove: async key => ({ removed: values.delete(key) })
  } });
  await secure.set("provider.token", "secret");
  assert.equal((await secure.get("provider.token")).value, "secret");
  assert.equal((await secure.remove("provider.token")).removed, true);
  const unavailable = createAuroraSecureStore({ available: false, adapter: null });
  await assert.rejects(unavailable.set("x", "y"), /Android/);

  const { createAuroraMemory } = await import("../src/core/aurora-memory.js");
  const { createAuroraMemorySync } = await import("../src/core/aurora-memory-sync.js");
  const memoryValues = new Map();
  const memoryStorage = { getItem: key => memoryValues.get(key) ?? null, setItem: (key,value) => memoryValues.set(key,value), removeItem: key => memoryValues.delete(key) };
  const memory = createAuroraMemory({ storage: memoryStorage, createId: () => "selected-record" });
  memory.remember({ id: "selected-record", content: "Only this record" });
  let consent = true, uploads = 0;
  const sync = createAuroraMemorySync(memory, { isConsentGranted: () => consent });
  sync.configure({ enabled: true, consent: true, adapter: { upsert: async () => { uploads++; }, remove: async () => ({ removed: true }) } });
  assert.equal((await sync.syncOne("selected-record")).synced, true);
  assert.equal(uploads, 1);
  consent = false;
  const blocked = await sync.syncOne("selected-record");
  assert.equal(blocked.synced, false);
  assert.match(blocked.reason, /consent is no longer active/i);
  assert.equal(sync.status().enabled, false, "Revoked consent must disable future sync attempts.");
  assert.equal(uploads, 1, "No upload may occur after consent revocation.");
  console.log("AURORA secure storage and sync tests passed: authenticated per-record sync, dynamic consent revocation, no bulk upload, and Android-only secure-store boundary.");
})().catch(error => { console.error(error); process.exitCode = 1; });
