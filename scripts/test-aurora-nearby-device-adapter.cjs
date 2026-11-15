import assert from "node:assert/strict";
import { createAuroraDeviceContinuity } from "../src/core/aurora-device-continuity.js";
import { createAuroraNearbyDeviceAdapter } from "../src/core/aurora-nearby-device-adapter.js";

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
console.log("AURORA Nearby device adapter tests passed.");
