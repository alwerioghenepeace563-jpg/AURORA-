const assert = require("node:assert/strict");

(async () => {
  const { createAuroraConnectedEcosystem } = await import("../src/core/aurora-connected-ecosystem.js");
  const { createAuroraExtensionRegistry } = await import("../src/core/aurora-extension-registry.js");
  const {
    STAGE_THIRTEEN_SCOPE,
    STAGE_THIRTEEN_LAYER_AUDIT,
    STAGE_THIRTEEN_CHECKPOINT,
    STAGE_FOURTEEN_CHECKPOINT
  } = await import("../src/core/aurora-layer-registry.js");

  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const published = [];
  const engineCalls = [];
  const capabilities = [{ id: "memory.search" }, { id: "device.get_status" }];
  const ecosystem = createAuroraConnectedEcosystem({
    storage,
    events: { publish: (...args) => published.push(args) },
    getCapabilities: () => capabilities,
    executeCapability: async request => {
      engineCalls.push(request);
      return { status: "completed", capabilityId: request.capabilityId };
    },
    now: () => "2026-11-15T00:00:00.000Z"
  });
  const manifest = {
    id: "calendar.provider",
    name: "Calendar Provider",
    version: "1.0",
    scopes: ["calendar.read"],
    capabilities: ["memory.search"]
  };

  assert.equal(STAGE_THIRTEEN_CHECKPOINT.status, "active");
  assert.equal(STAGE_FOURTEEN_CHECKPOINT.status, "complete");
  assert.equal(Object.keys(STAGE_THIRTEEN_SCOPE).length, 12);
  assert.equal(Object.keys(STAGE_THIRTEEN_LAYER_AUDIT).length, 12);
  for (const [layerId, scope] of Object.entries(STAGE_THIRTEEN_SCOPE)) {
    assert.ok(scope.length >= 3, `Stage 13 scope is incomplete for ${layerId}`);
    assert.ok(STAGE_THIRTEEN_LAYER_AUDIT[layerId].length >= 3,
      `Stage 13 audit evidence is incomplete for ${layerId}`);
  }

  const preview = ecosystem.preview(manifest);
  assert.equal(preview.status, "approval_required");
  assert.equal(preview.credentialsStored, false);
  await assert.rejects(
    ecosystem.connect(manifest, { approved: true, consent: false }),
    /approval and scope consent/i
  );
  await assert.rejects(
    ecosystem.connect({ ...manifest, capabilities: ["device.delete_all"] }, { approved: true, consent: true }),
    /unknown AURORA capabilities/i
  );

  let receivedScopes = [];
  let disconnectCalls = 0;
  ecosystem.registerAdapter(manifest.id, {
    connect: async ({ scopes }) => {
      receivedScopes = scopes;
      return { connected: true, accountLabel: "test account", accessToken: "must-not-be-stored" };
    },
    disconnect: async () => { disconnectCalls += 1; }
  });
  const connected = await ecosystem.connect(manifest, { approved: true, consent: true });
  assert.equal(connected.status, "connected");
  assert.deepEqual(receivedScopes, ["calendar.read"]);
  assert.equal(connected.credentialsStored, false);
  assert.equal(Object.hasOwn(connected, "accessToken"), false);
  assert.equal(connected.accountLabel, "test account");
  const persisted = values.get("aurora-connected-ecosystem-v1");
  assert.equal(persisted.includes("must-not-be-stored"), false,
    "provider credentials returned by an adapter must never enter local registry storage");

  const action = await ecosystem.execute(manifest.id, "memory.search", { query: "today" });
  assert.equal(action.status, "completed");
  assert.equal(engineCalls.length, 1);
  assert.equal(engineCalls[0].capabilityId, "memory.search");
  await assert.rejects(
    ecosystem.execute(manifest.id, "device.get_status", {}),
    /did not request that capability/i
  );

  ecosystem.registerAdapter(manifest.id, {
    connect: async () => { throw new Error("provider-secret-response"); },
    disconnect: async () => { throw new Error("provider-secret-response"); }
  });
  await assert.rejects(ecosystem.disconnect(manifest.id), /disconnect this service|provider-secret-response/i);
  assert.equal(ecosystem.list().length, 1,
    "failed remote revocation must not erase the local connection record");
  assert.equal(disconnectCalls, 0);

  ecosystem.registerAdapter(manifest.id, {
    connect: async () => ({ connected: true }),
    disconnect: async () => { disconnectCalls += 1; }
  });
  assert.equal(await ecosystem.disconnect(manifest.id), true);
  assert.equal(ecosystem.list().length, 0);
  assert.equal(disconnectCalls, 1);
  assert.equal(published.length, 2);

  const extensionValues = new Map();
  const extensionStorage = {
    getItem: key => extensionValues.get(key) ?? null,
    setItem: (key, value) => extensionValues.set(key, value)
  };
  const extensionCalls = [];
  const extensions = createAuroraExtensionRegistry({
    storage: extensionStorage,
    getCapabilities: () => capabilities,
    executeCapability: async request => {
      extensionCalls.push(request);
      return { status: "completed" };
    }
  });
  const extensionManifest = {
    id: "calendar-tools",
    name: "Calendar Tools",
    version: "1.0",
    capabilities: ["memory.search"],
    permissions: ["calendar.read"]
  };
  assert.equal(extensions.preview(extensionManifest).executesCode, false);
  assert.throws(() => extensions.install(extensionManifest), /approval/i);
  assert.throws(
    () => extensions.preview({ ...extensionManifest, capabilities: ["unknown.capability"] }),
    /unknown capabilities/i
  );
  const installed = extensions.install(extensionManifest, { approved: true });
  assert.equal(installed.executesCode, false);
  assert.equal(extensions.list()[0].executesCode, false);
  await extensions.execute("calendar-tools", "memory.search", { query: "events" });
  assert.equal(extensionCalls.length, 1);
  await assert.rejects(
    extensions.execute("calendar-tools", "device.get_status", {}),
    /did not request that capability/i
  );
  assert.equal(extensions.uninstall("calendar-tools"), true);
  assert.equal(extensions.list().length, 0);
  await assert.rejects(
    extensions.execute("calendar-tools", "memory.search", {}),
    /not found/i
  );

  console.log("AURORA Stage 13 acceptance checks passed: 12-layer scope, consent, credential isolation, Action Engine routing, disconnect safety and declarative extension controls.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
