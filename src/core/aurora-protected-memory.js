/**
 * Encrypted, Android-only vault for explicitly protected memory records.
 * This is separate from ordinary local-first memory: it never falls back to
 * localStorage and refuses to operate unless the Keystore-backed store exists.
 */
const INDEX_KEY = "aurora.pm.index";
const RECORD_PREFIX = "aurora.pm.record.";
const MAX_RECORDS = 100;
const MAX_CONTENT = 4000;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,80}$/;

function createAuroraProtectedMemory(options = {}) {
  const store = options.secureStore;
  if (!store || typeof store.get !== "function" || typeof store.set !== "function" || typeof store.remove !== "function") {
    throw new TypeError("Protected memory requires the AURORA secure-store interface.");
  }
  function assertAvailable() {
    const status = typeof store.status === "function" ? store.status() : null;
    if (!status?.available || status.encryption !== "android-keystore-aes-gcm") {
      throw new Error("Protected memory is available only when Android Keystore-backed encryption is active.");
    }
  }
  async function read(key) {
    const result = await store.get(key);
    if (typeof result === "string") return result;
    return result?.found === true && typeof result.value === "string" ? result.value : null;
  }
  async function readIndex() {
    const raw = await read(INDEX_KEY);
    if (!raw) return [];
    try {
      const ids = JSON.parse(raw);
      return Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === "string" && SAFE_ID.test(id)))].slice(0, MAX_RECORDS) : [];
    } catch {
      throw new Error("Protected memory index is unreadable; no records were changed.");
    }
  }
  async function remember(input = {}) {
    assertAvailable();
    const content = String(input.content || "").replace(/\u0000/g, "").trim();
    if (!content || content.length > MAX_CONTENT) throw new Error("Protected memory must contain 1–4,000 characters.");
    const id = String(input.id || globalThis.crypto?.randomUUID?.() || "pm-" + Date.now().toString(36)).slice(0, 80);
    if (!SAFE_ID.test(id)) throw new Error("Protected memory ID is invalid.");
    const ids = await readIndex();
    if (!ids.includes(id) && ids.length >= MAX_RECORDS) throw new Error("Protected memory is full (100 records).");
    const now = new Date().toISOString();
    const previousRaw = await read(RECORD_PREFIX + id);
    let previous = null;
    if (previousRaw) { try { previous = JSON.parse(previousRaw); } catch { throw new Error("The existing protected record is unreadable; it was not overwritten."); } }
    const record = {
      id,
      title: String(input.title || "Protected memory").trim().slice(0, 120) || "Protected memory",
      content,
      kind: String(input.kind || "private_note").trim().toLowerCase().slice(0, 40),
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      storage: "android-keystore-encrypted"
    };
    await store.set(RECORD_PREFIX + id, JSON.stringify(record));
    if (!ids.includes(id)) {
      try { await store.set(INDEX_KEY, JSON.stringify([id, ...ids])); }
      catch (error) { await store.remove(RECORD_PREFIX + id).catch(() => {}); throw error; }
    }
    return Object.freeze({ ...record });
  }
  async function get(id) {
    assertAvailable();
    if (!SAFE_ID.test(String(id))) throw new Error("Protected memory ID is invalid.");
    const raw = await read(RECORD_PREFIX + id);
    if (!raw) return null;
    try { return Object.freeze(JSON.parse(raw)); }
    catch { throw new Error("Protected memory record is unreadable."); }
  }
  async function list() {
    assertAvailable();
    const ids = await readIndex();
    const result = [];
    for (const id of ids) {
      const record = await get(id);
      if (record) result.push({ id: record.id, title: record.title, kind: record.kind, createdAt: record.createdAt, updatedAt: record.updatedAt, storage: record.storage });
    }
    return result;
  }
  async function forget(id) {
    assertAvailable();
    if (!SAFE_ID.test(String(id))) throw new Error("Protected memory ID is invalid.");
    const ids = await readIndex();
    if (!ids.includes(id)) return false;
    await store.remove(RECORD_PREFIX + id);
    await store.set(INDEX_KEY, JSON.stringify(ids.filter(item => item !== id)));
    return true;
  }
  return Object.freeze({ remember, get, list, forget, status: () => ({ available: true, encrypted: true, location: "Android Keystore-backed encrypted storage", maxRecords: MAX_RECORDS }) });
}
export { createAuroraProtectedMemory };
