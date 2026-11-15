const assert = require("node:assert/strict");

(async () => {
  const { createAuroraDeviceContinuity } = await import("../src/core/aurora-device-continuity.js");
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const events = [];
  const deliveries = [];
  const continuity = createAuroraDeviceContinuity({
    storage,
    crypto: { getRandomValues(bytes) { bytes.fill(7); return bytes; } },
    now: () => "2026-11-15T00:00:00.000Z",
    events: { publish: (...args) => events.push(args) }
  });
  const device = {
    deviceId: "aurora-phone-02",
    name: "My Android",
    platform: "Android",
    publicKeyFingerprint: "sha256:example-fingerprint"
  };
  assert.throws(() => continuity.registerTransport("bad", {}), /transport/);
  await assert.rejects(continuity.pair("nearby", device), /explicit approval and consent/i);
  continuity.registerTransport("nearby", {
    verifyPairing: async ({ challenge, response }) => {
      assert.equal(challenge.length, 64);
      assert.equal(response.deviceId, device.deviceId);
      return { authenticated: true, deviceId: response.deviceId };
    },
    sendEncrypted: async request => {
      deliveries.push(request);
      return { delivered: true, encrypted: true };
    },
    revoke: async ({ deviceId }) => ({ revoked: deviceId === device.deviceId })
  });
  const paired = await continuity.pair("nearby", device, { approved: true, consent: true });
  assert.equal(paired.trust, "trusted");
  assert.equal(paired.transportId, "nearby", "trusted devices must remain bound to the transport that authenticated them");
  assert.equal(continuity.list().length, 1);
  assert.equal(values.get("aurora-device-continuity-v1").includes("privateKey"), false);
  await assert.rejects(
    continuity.handoff(device.deviceId, { type: "task", title: "Review notes" }, { transportId: "nearby" }),
    /explicitly approve/i
  );
  await assert.rejects(
    continuity.handoff(device.deviceId, { type: "unknown", data: "x" }, { approved: true, consent: true, transportId: "nearby" }),
    /only approved task or knowledge-reference/i
  );
  await assert.rejects(
    continuity.handoff(device.deviceId, {
      type: "task",
      title: "Private task",
      metadata: { accessToken: "must-not-cross-device" }
    }, { approved: true, consent: true }),
    /credential-like or unsafe fields/i
  );
  await assert.rejects(
    continuity.handoff(device.deviceId, {
      type: "task",
      title: "Oversized task",
      description: "x".repeat(25000)
    }, { approved: true, consent: true }),
    /too large/i
  );
  await assert.rejects(
    continuity.handoff(device.deviceId, {
      type: "task",
      title: "Invalid numeric value",
      progress: Number.POSITIVE_INFINITY
    }, { approved: true, consent: true }),
    /invalid number/i
  );
  assert.equal(deliveries.length, 0, "rejected payloads must never reach the transport");

  const result = await continuity.handoff(
    device.deviceId,
    { type: "knowledge_reference", sourceId: "knowledge-123", title: "Biology notes" },
    { approved: true, consent: true, transportId: "nearby" }
  );
  assert.equal(result.delivered, true);
  assert.equal(result.encrypted, true);
  assert.equal(deliveries.length, 1);
  await assert.rejects(continuity.revoke(device.deviceId, "other-transport"), /does not match/i);
  assert.equal(deliveries[0].payload.sourceId, "knowledge-123");
  assert.equal(await continuity.revoke(device.deviceId, "nearby"), true);
  assert.equal(continuity.list().length, 0);
  assert.equal(events.length, 3);

  const failed = createAuroraDeviceContinuity({
    storage,
    crypto: { getRandomValues(bytes) { bytes.fill(9); return bytes; } }
  });
  failed.registerTransport("nearby", {
    verifyPairing: async () => ({ authenticated: false }),
    sendEncrypted: async () => ({ delivered: false, encrypted: false }),
    revoke: async () => ({ revoked: false })
  });
  await assert.rejects(
    failed.pair("nearby", device, { approved: true, consent: true }),
    error => error.code === "DEVICE_PAIRING_FAILED"
  );
  assert.equal(failed.list().length, 0, "unverified devices must never be trusted");

  const unverified = createAuroraDeviceContinuity({
    storage,
    crypto: { getRandomValues(bytes) { bytes.fill(3); return bytes; } }
  });
  unverified.registerTransport("nearby", {
    verifyPairing: async ({ response }) => ({ authenticated: true, deviceId: response.deviceId }),
    sendEncrypted: async () => ({ delivered: true, encrypted: false }),
    revoke: async () => ({ revoked: false })
  });
  await unverified.pair("nearby", device, { approved: true, consent: true });
  await assert.rejects(
    unverified.handoff(device.deviceId, { type: "task", title: "Test" }, { approved: true, consent: true, transportId: "nearby" }),
    error => error.code === "HANDOFF_DELIVERY_UNVERIFIED"
  );
  await assert.rejects(
    unverified.revoke(device.deviceId, "nearby"),
    error => error.code === "DEVICE_REVOCATION_FAILED"
  );
  assert.equal(unverified.list().length, 1, "unconfirmed revocation must preserve the trust record for retry");

  console.log("AURORA device continuity tests passed: consent, authenticated pairing, encrypted handoff confirmation, revocation and fail-closed trust.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
