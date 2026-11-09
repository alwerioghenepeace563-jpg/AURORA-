const assert = require("node:assert/strict");

(async () => {
  const { createAuroraExtensionRegistry } = await import("../src/core/aurora-extension-registry.js");
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const calls = [];
  const registry = createAuroraExtensionRegistry({
    storage,
    getCapabilities: () => [{ id: "device.get_status" }, { id: "device.set_flashlight" }],
    executeCapability: async request => { calls.push(request); return { status: "completed" }; }
  });
  const manifest = { id: "device-tools", name: "Device Tools", version: "1.0.0", capabilities: ["device.get_status"] };
  assert.throws(() => registry.install(manifest), /approval/i);
  registry.install(manifest, { approved: true });
  const result = await registry.execute("device-tools", "device.get_status", {});
  assert.equal(result.status, "completed");
  assert.equal(calls.length, 1);
  await assert.rejects(registry.execute("device-tools", "device.set_flashlight", { enabled: true }), /did not request/i);
  await assert.rejects(registry.execute("missing-extension", "device.get_status", {}), /not found/i);
  assert.equal(registry.list()[0].executesCode, false);
  const savedRaw = values.get("aurora-extensions-v1");
  values.set("aurora-extensions-v1", "{corrupt");
  assert.throws(() => registry.list(), /corrupt|invalid structure/i, "Corrupt extension storage must fail closed.");
  assert.equal(values.get("aurora-extensions-v1"), "{corrupt", "Corrupt extension data must never be silently reset.");
  values.set("aurora-extensions-v1", savedRaw);
  values.set("aurora-extensions-v1", JSON.stringify([{ id: "bad", name: "Bad", version: "1", capabilities: [], status: "installed", executesCode: true }]));
  assert.throws(() => registry.list(), /invalid structure/i, "Unsafe or malformed persisted manifests must fail closed.");
  console.log("AURORA extension execution tests passed: installed-manifest allowlist, no arbitrary code and Action Engine delegation.");
})().catch(error => { console.error(error); process.exitCode = 1; });
