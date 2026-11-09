const assert = require("node:assert/strict");

(async () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  let now = 1000;
  const { createAuroraConsentRegistry } = await import("../src/core/aurora-consent-registry.js");
  const consents = createAuroraConsentRegistry({ storage, now: () => now });
  assert.equal(consents.isGranted("screen.read", "accessibility"), false);
  assert.throws(() => consents.requireGrant("screen.read", "accessibility"), error => error.code === "CONSENT_REQUIRED");
  consents.grant({ scope: "screen.read", source: "accessibility", purpose: "Answer a user request", expiresAt: 2000 });
  assert.equal(consents.isGranted("screen.read", "accessibility"), true);
  now = 2001;
  assert.equal(consents.isGranted("screen.read", "accessibility"), false);
  now = 1500;
  consents.grant({ scope: "screen.read", source: "accessibility" });
  assert.equal(consents.revoke("screen.read", "accessibility"), true);
  assert.equal(consents.list().length, 0);

  const { createAuroraUniversalSearch } = await import("../src/core/aurora-universal-search.js");
  const search = createAuroraUniversalSearch({ maxResults: 5 });
  search.register("notes", async q => q.includes("biology") ? [{ id: "n1", title: "Biology revision", content: "Cell structure" }] : []);
  search.register("tools", async () => [{ id: "device.status", label: "Device status", description: "Battery information", score: 2 }], "Tools");
  const results = await search.search("biology");
  assert.equal(results.length, 1);
  assert.equal(results[0].source, "notes");
  assert.equal(results[0].title, "Biology revision");
  assert.equal(search.listSources().length, 2);

  const { createAuroraExtensionRegistry } = await import("../src/core/aurora-extension-registry.js");
  const extensions = createAuroraExtensionRegistry({ storage, getCapabilities: () => [{ id: "device.get_status" }] });
  const manifest = { id: "example.device-tools", name: "Device Tools", version: "1.0", capabilities: ["device.get_status"], permissions: ["device.status"] };
  assert.equal(extensions.preview(manifest).executesCode, false);
  assert.throws(() => extensions.install(manifest), error => error.code === "APPROVAL_REQUIRED");
  assert.throws(() => extensions.preview({ ...manifest, capabilities: ["unknown.execute"] }), /unknown capabilities/i);
  const installed = extensions.install(manifest, { approved: true });
  assert.equal(installed.status, "installed");
  assert.equal(installed.executesCode, false);
  assert.equal(extensions.list().length, 1);
  assert.equal(extensions.uninstall(manifest.id), true);
  assert.equal(extensions.list().length, 0);

  console.log("AURORA privacy/search/extension tests passed: default-deny consent, federated read-only search, declarative extension approvals.");
})().catch(error => { console.error(error); process.exitCode = 1; });
