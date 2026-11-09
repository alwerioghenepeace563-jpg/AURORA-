import { readStoredJson, isRecord } from "./aurora-storage-guard.js";
/**
 * AURORA Hybrid Memory Core.
 * Local-first by default. Cloud sync is disabled until the user explicitly
 * enables it and supplies an adapter; existing local records are never bulk
 * uploaded as a side effect of enabling the adapter.
 */
const STORAGE_KEY = "aurora-memory-v1";
const MAX_RECORDS = 500;
const MAX_CONTENT = 4000;
const SAFE_KIND = /^[a-z][a-z0-9_.-]{1,39}$/;

function makeId() {
  return globalThis.crypto?.randomUUID?.() || "memory-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}
function cleanText(value, max = MAX_CONTENT) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}
function tokenize(value) {
  return cleanText(value, 10000).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);
}

function createAuroraMemory(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const createId = typeof options.createId === "function" ? options.createId : makeId;
  const listeners = new Set();
  let cloud = { enabled: false, adapter: null };

  function emit(type, record) {
    const event = Object.freeze({ type, record: record ? Object.freeze({ ...record }) : null, at: now() });
    for (const listener of listeners) { try { listener(event); } catch { /* isolate subscribers */ } }
  }
  function readAll() {
    return readStoredJson(storage, STORAGE_KEY, [], value =>
      Array.isArray(value) && value.every(item => isRecord(item) && typeof item.id === "string" && item.id.length > 0 &&
        typeof item.kind === "string" && typeof item.title === "string" && typeof item.content === "string" &&
        (item.tags == null || Array.isArray(item.tags))),
      "AURORA memory");
  }
  function writeAll(records) {
    if (!storage?.setItem) throw new Error("Local memory storage is unavailable.");
    storage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  }
  function remember(input = {}) {
    const content = cleanText(input.content);
    if (!content) throw new Error("Memory content cannot be empty.");
    const kind = cleanText(input.kind || "fact", 40).toLowerCase();
    if (!SAFE_KIND.test(kind)) throw new Error("Memory kind must be a short lowercase identifier.");
    const record = Object.freeze({
      id: cleanText(input.id || createId(), 100),
      kind,
      title: cleanText(input.title || kind, 120),
      content,
      tags: [...new Set((Array.isArray(input.tags) ? input.tags : []).map((tag) => cleanText(tag, 32).toLowerCase()).filter(Boolean))].slice(0, 12),
      source: cleanText(input.source || "user", 40),
      createdAt: now(),
      updatedAt: now(),
      storage: "local"
    });
    if (!record.id) throw new Error("Memory ID is required.");
    const records = readAll().filter((item) => item.id !== record.id);
    records.unshift(record);
    writeAll(records);
    emit("memory.saved", record);
    return record;
  }
  function search(query, options = {}) {
    const terms = tokenize(query);
    if (!terms.length) return [];
    const limit = Math.max(1, Math.min(50, Number(options.limit) || 10));
    const records = readAll().map((record) => {
      const haystack = tokenize([record.title, record.content, ...(record.tags || [])].join(" "));
      const unique = new Set(haystack);
      const matches = terms.filter((term) => unique.has(term));
      const score = matches.length / terms.length + (cleanText(record.title).toLowerCase().includes(cleanText(query).toLowerCase()) ? 0.5 : 0);
      return { ...record, score, matchedTerms: matches };
    }).filter((record) => record.score > 0);
    return records.sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, limit);
  }
  function forget(id) {
    const records = readAll();
    const next = records.filter((record) => record.id !== String(id));
    if (next.length === records.length) return false;
    writeAll(next);
    emit("memory.forgotten", { id: String(id) });
    if (cloud.enabled && cloud.adapter?.remove) {
      Promise.resolve(cloud.adapter.remove(String(id))).catch(() => {});
    }
    return true;
  }
  function clear() {
    const records = readAll();
    if (storage?.removeItem) storage.removeItem(STORAGE_KEY);
    else writeAll([]);
    emit("memory.cleared", { count: records.length });
    return records.length;
  }
  function configureCloud({ enabled = false, adapter = null, consent = false } = {}) {
    if (enabled && consent !== true) throw new Error("Explicit user consent is required before cloud memory can be enabled.");
    if (enabled && (!adapter || typeof adapter.upsert !== "function" || typeof adapter.remove !== "function")) {
      throw new Error("A cloud memory adapter with upsert and remove methods is required.");
    }
    cloud = { enabled: enabled === true, adapter: enabled ? adapter : null };
    emit("memory.cloud_configuration_changed", null);
    return { enabled: cloud.enabled, localFirst: true, automaticBulkUpload: false };
  }
  async function syncRecord(id) {
    if (!cloud.enabled || !cloud.adapter) return { synced: false, reason: "Cloud memory is disabled." };
    const record = readAll().find((item) => item.id === String(id));
    if (!record) return { synced: false, reason: "Memory record was not found." };
    await cloud.adapter.upsert({ ...record, storage: "cloud-linked" });
    emit("memory.synced", record);
    return { synced: true, id: record.id };
  }
  return Object.freeze({
    remember, search, forget, clear, list: () => readAll().map((item) => ({ ...item })),
    subscribe(listener) { if (typeof listener !== "function") throw new TypeError("Listener must be a function."); listeners.add(listener); return () => listeners.delete(listener); },
    configureCloud, syncRecord,
    status: () => ({ mode: cloud.enabled ? "hybrid" : "local", cloudEnabled: cloud.enabled, localFirst: true, automaticBulkUpload: false, recordCount: readAll().length })
  });
}

const auroraMemory = createAuroraMemory();
export { STORAGE_KEY as AURORA_MEMORY_STORAGE_KEY, createAuroraMemory, auroraMemory };
