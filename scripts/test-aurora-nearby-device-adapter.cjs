const assert = require("node:assert/strict");
const fs = require("node:fs");

(async () => {
  const { createAuroraDeviceContinuity } = await import("../src/core/aurora-device-continuity.js");
  const { createAuroraNearbyDeviceAdapter } = await import("../src/core/aurora-nearby-device-adapter.js");

const records = new Map();
const storage = {
  getItem(key) { return records.get(key) || null; },
  setItem(key, value) { records.set(key, value); }
};
const published = [];
const listeners = new Map();
const peer = {
  endpointId: "nearby-endpoint-01",
  deviceId: "aurora-peer-device-01",
  name: "AURORA Test Phone",
  platform: "Android 15",
  publicKeyFingerprint: "sha256:test-peer-fingerprint",
  authenticated: false
};
const calls = [];
const nativeTransport = {
  isAvailable: () => true,
  getIdentity: async () => ({ available: true, deviceId: "aurora-local-device-01" }),
  requestPermissions: async () => ({ granted: true }),
  startAdvertising: async () => { calls.push("advertise"); return { started: true }; },
  startDiscovery: async () => { calls.push("discover"); return { started: true }; },
  stopAdvertising: async () => ({ stopped: true }),
  stopDiscovery: async () => ({ stopped: true }),
  requestConnection: async endpointId => ({ requested: endpointId === peer.endpointId }),
  acceptConnection: async (endpointId, confirmed) => ({ accepted: endpointId === peer.endpointId && confirmed }),
  rejectConnection: async () => ({ rejected: true }),
  getConnectedPeers: async () => ({ items: [peer], count: 1 }),
  verifyPeer: async (endpointId, challenge) => ({
    authenticated: endpointId === peer.endpointId && /^[a-f0-9]{64}$/i.test(challenge),
    deviceId: peer.deviceId,
    publicKeyFingerprint: peer.publicKeyFingerprint
  }),
  sendEncrypted: async (deviceId, payload) => {
    assert.equal(deviceId, peer.deviceId);
    assert.equal(payload.type, "knowledge_reference");
    return { delivered: true, encrypted: true };
  },
  disconnect: async deviceId => ({ disconnected: deviceId === peer.deviceId }),
  addListener: async (name, callback) => {
    listeners.set(name, callback);
    return { remove: async () => listeners.delete(name) };
  }
};
const continuity = createAuroraDeviceContinuity({
  storage,
  crypto: { getRandomValues(bytes) { bytes.fill(7); return bytes; } },
  events: { publish: (name, payload) => published.push({ name, payload }) }
});
const nearby = createAuroraNearbyDeviceAdapter({
  nativeTransport,
  deviceContinuity: continuity,
  events: { publish: (name, payload) => published.push({ name, payload }) }
});

assert.equal(nearby.isAvailable(), true);
const started = await nearby.start();
assert.deepEqual(started, { started: true, advertising: true, discovery: true });
assert.deepEqual(calls, ["advertise", "discover"]);
assert.equal((await nearby.requestConnection(peer.endpointId)).requested, true);
assert.equal((await nearby.approveConnection(peer.endpointId, true)).accepted, true);
await assert.rejects(nearby.approveConnection(peer.endpointId, false), /Compare the same authentication code/);

const trusted = await nearby.pair(peer.endpointId, { approved: true, consent: true });
assert.equal(trusted.id, peer.deviceId);
assert.equal(trusted.publicKeyFingerprint, peer.publicKeyFingerprint);
assert.equal(continuity.list().length, 1);

const delivered = await nearby.handoff(peer.deviceId, {
  type: "knowledge_reference",
  sourceId: "biology-notes",
  title: "Biology notes"
}, { approved: true, consent: true });
assert.equal(delivered.delivered, true);
assert.equal(delivered.encrypted, true);

assert.equal(await nearby.revoke(peer.deviceId), true);
assert.equal(continuity.list().length, 0);
assert.equal((await nearby.stop()).stopped, true);
await nearby.destroy();
const nearbyPlugin = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraNearbyPlugin.java", "utf8");
const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const mainActivity = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/MainActivity.java", "utf8");
const gradle = fs.readFileSync("android/app/build.gradle", "utf8");
const patcher = fs.readFileSync("scripts/patch-android-native.mjs", "utf8");
const runtime = fs.readFileSync("src/core/aurora-runtime.js", "utf8");
const workspace = fs.readFileSync("src/components/IntelligenceEcosystemWorkspace.jsx", "utf8");
assert.ok(nearbyPlugin.includes("AndroidKeyStore"), "device signing identity must use Android Keystore");
assert.ok(nearbyPlugin.includes("SHA256withECDSA"), "pairing must prove private-key possession");
assert.ok(nearbyPlugin.includes("60000L"), "pairing proofs must be time-bounded");
assert.ok(nearbyPlugin.includes("stopAllEndpoints"), "nearby sessions must stop when the app backgrounds");
assert.ok(nearbyPlugin.includes("must complete authenticated pairing"), "handoff must require authenticated pairing");
assert.ok(gradle.includes("play-services-nearby:19.5.1"), "Google Nearby SDK dependency must be installed");
assert.ok(manifest.includes("android.permission.BLUETOOTH_SCAN") && manifest.includes("android.permission.NEARBY_WIFI_DEVICES"), "modern Nearby permissions must be declared");
assert.ok(mainActivity.includes("registerPlugin(AuroraNearbyPlugin.class)"), "Capacitor must register the Nearby plugin");
assert.ok(patcher.includes("registerPlugin(AuroraNearbyPlugin.class);"), "Android sync must preserve Nearby registration");
assert.ok(runtime.includes("createAuroraNearbyDeviceAdapter"), "shared runtime must expose the transport adapter");
assert.ok(workspace.includes('tab === "devices"') && workspace.includes("authenticationDigits"), "device workspace must expose pairing-code approval");
assert.ok(workspace.includes("Send approved reference"), "device workspace must expose explicit reference handoff");
console.log("AURORA Nearby device adapter tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
