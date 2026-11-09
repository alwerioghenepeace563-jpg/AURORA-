/**
 * Consent-driven memory sync coordinator.
 * Sync is per-record, explicit, and conflict-aware. No bulk upload is exposed.
 */
function createAuroraMemorySync(memory, options = {}) {
  if (!memory || typeof memory.configureCloud !== "function" || typeof memory.syncRecord !== "function") throw new TypeError("Memory sync requires the AURORA memory service.");
  const now = options.now || (() => new Date().toISOString());
  let adapter = null;
  let enabled = false;
  const states = new Map();
  function configure({ enabled: next = false, adapter: nextAdapter = null, consent = false } = {}) {
    if (next && consent !== true) throw new Error("Explicit consent is required to enable memory sync.");
    if (next && (!nextAdapter || typeof nextAdapter.upsert !== "function" || typeof nextAdapter.remove !== "function")) throw new Error("A valid memory sync adapter is required.");
    adapter = next ? nextAdapter : null;
    enabled = next === true;
    memory.configureCloud({ enabled, adapter, consent });
    return status();
  }
  async function syncOne(id, { conflict = "keep_local" } = {}) {
    if (!enabled) return { synced: false, reason: "Memory sync is disabled." };
    const local = memory.list().find(item => item.id === String(id));
    if (!local) return { synced: false, reason: "Memory not found." };
    if (!["keep_local", "keep_remote", "newest"].includes(conflict)) throw new Error("Unknown conflict policy.");
    if (typeof adapter.get === "function") {
      const remote = await adapter.get(local.id);
      if (remote && remote.updatedAt && remote.updatedAt !== local.updatedAt) {
        if (conflict === "keep_remote") {
          states.set(local.id, { status: "conflict_kept_remote", at: now() });
          return { synced: false, conflict: true, resolution: "keep_remote", remote };
        }
        if (conflict === "newest" && String(remote.updatedAt) > String(local.updatedAt)) {
          states.set(local.id, { status: "conflict_remote_newer", at: now() });
          return { synced: false, conflict: true, resolution: "remote_newer", remote };
        }
      }
    }
    const result = await memory.syncRecord(local.id);
    states.set(local.id, { status: result.synced ? "synced" : "pending", at: now() });
    return { ...result, conflictChecked: typeof adapter.get === "function" };
  }
  function status() {
    return { enabled, localFirst: true, bulkSync: false, records: [...states.entries()].map(([id, value]) => ({ id, ...value })) };
  }
  return Object.freeze({ configure, syncOne, status, disable: () => configure({ enabled: false }) });
}
export { createAuroraMemorySync };
