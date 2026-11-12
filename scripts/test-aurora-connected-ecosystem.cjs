const assert = require("node:assert/strict");
(async () => {
  const { createAuroraConnectedEcosystem } = await import("../src/core/aurora-connected-ecosystem.js");
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key,value) => data.set(key,value) };
  const calls = [];
  const events = { publish: (...args) => calls.push(["event", ...args]) };
  const engineCalls = [];
  const service = createAuroraConnectedEcosystem({ storage, events, getCapabilities: () => [{ id: "memory.search" }], executeCapability: request => { engineCalls.push(request); return { ok: true }; }, now: () => "2026-11-10T00:00:00.000Z" });
  const manifest = { id: "google.calendar", name: "Google Calendar", version: "1", scopes: ["calendar.read"], capabilities: ["memory.search"] };
  assert.equal(service.preview(manifest).credentialsStored, false);
  await assert.rejects(() => service.connect(manifest, { approved: true, consent: false }), /approval and scope consent/i);
  await assert.rejects(() => service.connect(manifest, { approved: true, consent: true }), /No supported connector adapter/);
  let connectedScopes = null, disconnected = false;
  service.registerAdapter("google.calendar", { connect: async ({ scopes }) => { connectedScopes = scopes; return { connected: true, accountLabel: "primary" }; }, disconnect: async () => { disconnected = true; } });
  const connected = await service.connect(manifest, { approved: true, consent: true });
  assert.equal(connected.status, "connected");
  assert.deepEqual(connectedScopes, ["calendar.read"]);
  assert.equal(connected.credentialsStored, false);
  assert.equal(service.status().connected, 1);
  assert.deepEqual(await service.execute("google.calendar", "memory.search", { query: "class" }), { ok: true });
  assert.equal(engineCalls.length, 1);
  await assert.rejects(() => service.execute("google.calendar", "device.call", {}), /did not request/);
  assert.equal(await service.disconnect("google.calendar"), true);
  assert.equal(disconnected, true);

  const unsafeStore = new Map();
  unsafeStore.set("aurora-connected-ecosystem-v1", JSON.stringify([{
    id: "google.calendar", name: "Google Calendar", version: "1", description: "",
    scopes: ["calendar.read"], capabilities: ["memory.search"], status: "connected",
    credentialsStored: false, connectedAt: "2026-11-11T00:00:00.000Z"
  }]));
  const noAdapterService = createAuroraConnectedEcosystem({
    storage: { getItem: key => unsafeStore.get(key) || null, setItem: (key, value) => unsafeStore.set(key, value) },
    getCapabilities: () => [{ id: "memory.search" }],
    executeCapability: async () => ({ ok: true })
  });
  await assert.rejects(() => noAdapterService.disconnect("google.calendar"), /adapter is available/i);
  assert.equal(noAdapterService.list().length, 1, "a connector record must remain until its provider adapter can revoke the remote session");

  const malformedStore = new Map();
  malformedStore.set("aurora-connected-ecosystem-v1", JSON.stringify([{
    id: "google.calendar", name: "Google Calendar", version: "1", description: "",
    scopes: ["calendar.read"], capabilities: "not-an-array", status: "connected", credentialsStored: false
  }]));
  const malformedService = createAuroraConnectedEcosystem({
    storage: { getItem: key => malformedStore.get(key) || null, setItem: (key, value) => malformedStore.set(key, value) },
    getCapabilities: () => []
  });
  assert.equal(malformedService.list().length, 0, "malformed connector metadata must fail closed");

  assert.throws(() => service.preview({ ...manifest, capabilities: Array.from({ length: 51 }, (_, index) => "capability." + index) }), /capabilities are invalid/i);
  assert.equal(service.status().connected, 0);
  assert.equal(service.list().length, 0);
  assert.equal(calls.filter(x => x[0] === "event").length, 2);
  assert.throws(() => service.registerAdapter("invalid", {}), /adapter/);
  console.log("AURORA connected ecosystem tests passed: explicit consent, adapter boundary, shared Action Engine routing, disconnect and credential isolation.");
})().catch(error => { console.error(error); process.exitCode = 1; });
