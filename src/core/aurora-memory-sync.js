/**
 * Consent-driven memory sync coordinator.
 * Sync is per-record, explicit, conflict-aware and revocation-aware.
 * Network failures are recorded as bounded metadata; local memory remains authoritative.
 */
function createAuroraMemorySync(memory, options = {}) {
  if (!memory || typeof memory.configureCloud !== "function" || typeof memory.syncRecord !== "function") throw new TypeError("Memory sync requires the AURORA memory service.");
  const now = options.now || (() => new Date().toISOString());
  const isConsentGranted = typeof options.isConsentGranted === "function" ? options.isConsentGranted : () => true;
  let adapter = null, enabled = false;
  const states = new Map(), inFlight = new Map();
  const safeErrorCode = error => typeof error?.code === "string" && /^[A-Z0-9_.-]{1,64}$/.test(error.code) ? error.code : "MEMORY_SYNC_FAILED";
  function consentActive() {
    try { return isConsentGranted() === true; } catch { return false; }
  }
  function disableForRevocation(id) {
    enabled = false; adapter = null;
    try { memory.configureCloud({ enabled: false }); } catch {}
    states.set(String(id), { status: "blocked_consent_revoked", at: now(), code: "CONSENT_REVOKED" });
    return { synced: false, reason: "Cloud memory consent is no longer active. Sync has been disabled." };
  }
  function configure({ enabled: next = false, adapter: nextAdapter = null, consent = false } = {}) {
    if (next && (consent !== true || !consentActive())) throw new Error("Explicit active consent is required to enable memory sync.");
    if (next && (!nextAdapter || typeof nextAdapter.upsert !== "function" || typeof nextAdapter.remove !== "function")) throw new Error("A valid memory sync adapter is required.");
    adapter = next ? nextAdapter : null; enabled = next === true;
    memory.configureCloud({ enabled, adapter, consent: enabled && consent === true });
    return status();
  }
  async function syncOne(id, { conflict = "keep_local" } = {}) {
    const key = String(id);
    if (inFlight.has(key)) return inFlight.get(key);
    const work = (async () => {
      if (!enabled) return { synced: false, reason: "Memory sync is disabled." };
      if (!consentActive()) return disableForRevocation(key);
      if (!["keep_local", "keep_remote", "newest"].includes(conflict)) throw new Error("Unknown conflict policy.");
      const local = memory.list().find(item => item.id === key);
      if (!local) return { synced: false, reason: "Memory not found." };
      try {
        if (typeof adapter.get === "function") {
          const remote = await adapter.get(local.id);
          if (!consentActive()) return disableForRevocation(key);
          if (remote && remote.updatedAt && remote.updatedAt !== local.updatedAt) {
            if (conflict === "keep_remote") {
              states.set(key, { status: "conflict_kept_remote", at: now() });
              return { synced: false, conflict: true, resolution: "keep_remote" };
            }
            if (conflict === "newest" && String(remote.updatedAt) > String(local.updatedAt)) {
              states.set(key, { status: "conflict_remote_newer", at: now() });
              return { synced: false, conflict: true, resolution: "remote_newer" };
            }
          }
        }
        // Recheck immediately before the only operation that can upload user data.
        if (!enabled || !consentActive()) return disableForRevocation(key);
        const result = await memory.syncRecord(local.id);
        if (!result?.synced) {
          states.set(key, { status: "pending", at: now(), code: "SYNC_NOT_CONFIRMED" });
          return { synced: false, reason: result?.reason || "The provider did not confirm the upload." };
        }
        states.set(key, { status: "synced", at: now() });
        return { ...result, conflictChecked: typeof adapter?.get === "function" };
      } catch (error) {
        const code = safeErrorCode(error);
        states.set(key, { status: "failed", at: now(), code });
        return { synced: false, reason: "The selected memory was not confirmed as synced.", code };
      }
    })();
    inFlight.set(key, work);
    try { return await work; } finally { if (inFlight.get(key) === work) inFlight.delete(key); }
  }
  function status() {
    return { enabled, localFirst: true, bulkSync: false, activeSyncCount: inFlight.size, records: [...states.entries()].map(([id, value]) => ({ id, ...value })) };
  }
  return Object.freeze({ configure, syncOne, status, disable: () => configure({ enabled: false }) });
}
export { createAuroraMemorySync };
