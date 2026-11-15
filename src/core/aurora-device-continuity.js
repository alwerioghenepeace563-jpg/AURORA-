/**
 * Consent-first device continuity.
 * Trust metadata only is persisted. Pairing proof verification and encrypted
 * delivery are delegated to an authenticated platform transport adapter.
 */
const KEY = "aurora-device-continuity-v1";
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{2,95}$/;
const MAX_DEVICES = 20;
const MAX_PAYLOAD = 24000;
function createAuroraDeviceContinuity(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const adapters = new Map();
  const now = options.now || (() => new Date().toISOString());
  function read() {
    try {
      const raw = storage?.getItem?.(KEY);
      if (!raw) return [];
      const items = JSON.parse(raw);
      if (!Array.isArray(items) || items.length > MAX_DEVICES || !items.every(item =>
        item && ID.test(String(item.id || "")) && typeof item.name === "string" &&
        typeof item.platform === "string" && typeof item.publicKeyFingerprint === "string" &&
        item.publicKeyFingerprint.length <= 160 && item.trust === "trusted" &&
        typeof item.pairedAt === "string" && typeof item.lastSeenAt === "string" &&
        typeof item.transportId === "string" && ID.test(item.transportId)
      )) return [];
      return items;
    } catch { return []; }
  }
  function write(items) {
    if (!storage?.setItem) throw new Error("Device continuity storage is unavailable.");
    storage.setItem(KEY, JSON.stringify(items.slice(-MAX_DEVICES)));
  }
  function registerTransport(id, adapter) {
    if (!ID.test(String(id)) || !adapter ||
      typeof adapter.verifyPairing !== "function" ||
      typeof adapter.sendEncrypted !== "function" ||
      typeof adapter.revoke !== "function") {
      throw new Error("A device transport must verify pairing, send encrypted handoffs and revoke trust.");
    }
    adapters.set(String(id), adapter);
    return true;
  }
  function createChallenge() {
    const cryptoApi = options.crypto || globalThis.crypto;
    if (!cryptoApi?.getRandomValues) throw new Error("Secure pairing randomness is unavailable on this device.");
    const bytes = new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  }
  async function pair(transportId, response, decision = {}) {
    if (decision.approved !== true || decision.consent !== true) {
      throw Object.assign(new Error("Explicit approval and consent are required to trust a device."), { code: "DEVICE_CONSENT_REQUIRED" });
    }
    const adapter = adapters.get(String(transportId));
    if (!adapter) throw new Error("No authenticated device transport is registered.");
    if (!response || !ID.test(String(response.deviceId || "")) ||
      !String(response.name || "").trim() || !String(response.platform || "").trim() ||
      !String(response.publicKeyFingerprint || "").trim()) {
      throw new Error("The pairing response is incomplete.");
    }
    const challenge = createChallenge();
    let verification;
    try {
      verification = await adapter.verifyPairing({ challenge, response });
    } catch {
      throw Object.assign(new Error("Device authentication could not be verified."), { code: "DEVICE_PAIRING_FAILED" });
    }
    if (verification?.authenticated !== true || verification.deviceId !== response.deviceId) {
      throw Object.assign(new Error("Device authentication could not be verified."), { code: "DEVICE_PAIRING_FAILED" });
    }
    const record = {
      id: String(response.deviceId),
      transportId: String(transportId),
      name: String(response.name).trim().slice(0, 100),
      platform: String(response.platform).trim().slice(0, 60),
      publicKeyFingerprint: String(response.publicKeyFingerprint).slice(0, 160),
      trust: "trusted",
      pairedAt: now(),
      lastSeenAt: now()
    };
    write([...read().filter(item => item.id !== record.id), record]);
    options.events?.publish?.("device.trusted", { deviceId: record.id, platform: record.platform }, { source: "device_continuity" });
    return Object.freeze({ ...record });
  }
  async function handoff(deviceId, payload, decision = {}) {
    if (decision.approved !== true || decision.consent !== true) {
      throw Object.assign(new Error("Review the handoff and explicitly approve sharing it."), { code: "HANDOFF_CONSENT_REQUIRED" });
    }
    const device = read().find(item => item.id === String(deviceId) && item.trust === "trusted");
    if (!device) throw new Error("A trusted destination device was not found.");
    const adapter = adapters.get(device.transportId);
    if (!adapter) throw new Error("The paired device transport is unavailable.");
    if (!payload || !["task", "knowledge_reference"].includes(payload.type)) {
      throw new Error("Only approved task or knowledge-reference handoffs are supported.");
    }
    const body = JSON.stringify(payload);
    if (body.length > MAX_PAYLOAD) throw new Error("The selected handoff is too large.");
    let result;
    try {
      result = await adapter.sendEncrypted({ deviceId: device.id, payload });
    } catch {
      throw Object.assign(new Error("The encrypted handoff could not be delivered."), { code: "HANDOFF_DELIVERY_FAILED" });
    }
    if (result?.delivered !== true || result?.encrypted !== true) {
      throw Object.assign(new Error("The destination did not confirm encrypted delivery."), { code: "HANDOFF_DELIVERY_UNVERIFIED" });
    }
    const updated = read().map(item => item.id === device.id ? { ...item, lastSeenAt: now() } : item);
    write(updated);
    options.events?.publish?.("device.handoff_delivered", { deviceId: device.id, type: payload.type }, { source: "device_continuity" });
    return Object.freeze({ delivered: true, encrypted: true, deviceId: device.id, type: payload.type });
  }
  async function revoke(deviceId, transportId) {
    const device = read().find(item => item.id === String(deviceId));
    if (!device) return false;
    if (String(transportId || "") !== device.transportId) throw new Error("The selected transport does not match this paired device.");
    const adapter = adapters.get(device.transportId);
    if (!adapter) throw new Error("The trusted device cannot be revoked until its transport is available.");
    try {
      const result = await adapter.revoke({ deviceId: device.id });
      if (result?.revoked !== true) throw new Error("Revocation was not confirmed.");
    } catch {
      throw Object.assign(new Error("Device revocation could not be confirmed; trust remains recorded for retry."), { code: "DEVICE_REVOCATION_FAILED" });
    }
    write(read().filter(item => item.id !== device.id));
    options.events?.publish?.("device.revoked", { deviceId: device.id }, { source: "device_continuity" });
    return true;
  }
  function list() { return read().map(item => Object.freeze({ ...item })); }
  return Object.freeze({ registerTransport, pair, handoff, revoke, list });
}
export { createAuroraDeviceContinuity };
