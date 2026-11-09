import { readStoredJson, isRecord } from "./aurora-storage-guard.js";

/**
 * Stage 9 Personal Knowledge Universe.
 * Only explicitly user-approved records are indexed. No background scanning,
 * implicit imports, binary uploads, or cloud sync are performed here.
 */
const KEY = "aurora-knowledge-universe-v1";
const MAX_RECORDS = 500;
const MAX_CONTENT = 12000;
const MAX_REVISIONS = 5;
const SOURCE_TYPES = Object.freeze(["note", "document", "project", "task", "conversation", "website", "recording", "image", "event"]);
const clean = (value, max = 500) => String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
const normalise = value => clean(value, MAX_CONTENT).toLowerCase().replace(/\s+/g, " ").trim();
function fingerprint(input) {
  const value = normalise(input.type) + "|" + normalise(input.title) + "|" + normalise(input.content);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return "ku-" + (hash >>> 0).toString(16);
}
function sameSource(left, right) {
  return normalise(left.type) === normalise(right.type) &&
    normalise(left.title) === normalise(right.title) &&
    normalise(left.content) === normalise(right.content);
}
function createAuroraKnowledgeUniverse(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const createId = typeof options.createId === "function" ? options.createId : () => globalThis.crypto?.randomUUID?.() || "ku-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
  function read() {
    return readStoredJson(storage, KEY, { records: [], links: [] }, value =>
      isRecord(value) && Array.isArray(value.records) && Array.isArray(value.links) &&
      value.records.every(item => isRecord(item) && typeof item.id === "string" && typeof item.title === "string" && typeof item.content === "string" && SOURCE_TYPES.includes(item.type)) &&
      value.links.every(item => isRecord(item) && typeof item.from === "string" && typeof item.to === "string" && typeof item.relation === "string"),
      "AURORA knowledge universe");
  }
  function write(data) {
    if (!storage?.setItem) throw new Error("Local knowledge storage is unavailable.");
    storage.setItem(KEY, JSON.stringify({ records: data.records.slice(-MAX_RECORDS), links: data.links.slice(-2000) }));
  }
  function add(input = {}) {
    if (input.userApproved !== true) throw new Error("Explicit user approval is required before adding a source to the knowledge universe.");
    const type = clean(input.type, 24).toLowerCase();
    const title = clean(input.title, 160);
    const content = clean(input.content, MAX_CONTENT);
    if (!SOURCE_TYPES.includes(type) || !title || !content) throw new Error("A supported source type, title and bounded text or description are required.");
    const uri = clean(input.uri, 1000);
    if (uri && !/^https?:\/\//i.test(uri)) throw new Error("Source links must use HTTP or HTTPS.");
    const data = read(), key = fingerprint({ type, title, content });
    const duplicate = data.records.find(item => item.fingerprint === key && sameSource(item, { type, title, content }));
    if (duplicate) return { record: { ...duplicate }, duplicate: true };
    if (data.records.length >= MAX_RECORDS) throw new Error("The local knowledge universe is full (500 records).");
    const timestamp = now();
    const record = {
      id: clean(input.id || createId(), 100), type, title, content,
      contentTruncated: String(input.content ?? "").replace(/\u0000/g, "").length > MAX_CONTENT,
      summary: clean(input.summary || content, 500),
      tags: [...new Set((Array.isArray(input.tags) ? input.tags : []).map(tag => clean(tag, 40).toLowerCase()).filter(Boolean))].slice(0, 20),
      projectId: clean(input.projectId, 100),
      source: { label: clean(input.sourceLabel || title, 160), uri, capturedAt: clean(input.capturedAt || timestamp, 40), method: clean(input.sourceMethod || "user_selected", 40) },
      fingerprint: key, userApproved: true, revisions: [],
      createdAt: timestamp, updatedAt: timestamp, storage: "local"
    };
    data.records.unshift(record); write(data);
    return { record: { ...record }, duplicate: false };
  }
  function search(query, filters = {}) {
    const terms = normalise(query).split(/[^a-z0-9]+/).filter(Boolean);
    if (!terms.length) return [];
    const selectedTypes = Array.isArray(filters.types) ? new Set(filters.types) : null;
    const selectedTags = Array.isArray(filters.tags) ? new Set(filters.tags.map(tag => clean(tag, 40).toLowerCase())) : null;
    const needle = normalise(query);
    return read().records.filter(item =>
      (!selectedTypes || selectedTypes.has(item.type)) &&
      (!filters.projectId || item.projectId === String(filters.projectId)) &&
      (!selectedTags || [...selectedTags].every(tag => item.tags.includes(tag)))
    ).map(item => {
      const title = normalise(item.title), body = normalise(item.content + " " + item.summary + " " + item.tags.join(" "));
      const matches = terms.filter(term => title.includes(term) || body.includes(term));
      const score = matches.length / terms.length + (title.includes(needle) ? 0.75 : 0) + (item.projectId && filters.projectId ? 0.25 : 0);
      return { ...item, score, matchedTerms: [...new Set(matches)] };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, Math.max(1, Math.min(50, Number(filters.limit) || 20)));
  }
  function link(input = {}) {
    const data = read(), from = String(input.from || ""), to = String(input.to || ""), relation = clean(input.relation, 48).toLowerCase();
    if (from === to || !data.records.some(item => item.id === from) || !data.records.some(item => item.id === to) || !/^[a-z][a-z0-9_.-]{1,47}$/.test(relation)) {
      throw new Error("Both source records and a valid relationship are required.");
    }
    const existing = data.links.find(item => item.from === from && item.to === to && item.relation === relation);
    if (existing) return { ...existing, duplicate: true };
    const edge = { id: clean(input.id || createId(), 100), from, to, relation, createdAt: now() };
    data.links.push(edge); write(data); return { ...edge, duplicate: false };
  }
  function related(id) {
    const data = read(), record = data.records.find(item => item.id === String(id));
    if (!record) return null;
    const links = data.links.filter(edge => edge.from === record.id || edge.to === record.id);
    const ids = new Set(links.flatMap(edge => [edge.from, edge.to]));
    return { record: { ...record }, links, related: data.records.filter(item => ids.has(item.id) && item.id !== record.id) };
  }
  function timeline(filters = {}) {
    return read().records.filter(item =>
      (!filters.projectId || item.projectId === String(filters.projectId)) &&
      (!filters.type || item.type === filters.type) &&
      (!filters.from || item.updatedAt >= String(filters.from)) &&
      (!filters.to || item.updatedAt <= String(filters.to))
    ).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, Math.max(1, Math.min(100, Number(filters.limit) || 30))).map(item => ({ ...item }));
  }
  function correct(id, patch = {}, options = {}) {
    if (options.confirmed !== true) throw new Error("A separate confirmation is required before correcting a saved source.");
    const data = read(), item = data.records.find(record => record.id === String(id));
    if (!item) return null;
    const title = patch.title == null ? item.title : clean(patch.title, 160);
    const content = patch.content == null ? item.content : clean(patch.content, MAX_CONTENT);
    if (!title || !content) throw new Error("Corrected title and content cannot be empty.");
    item.revisions = [...(item.revisions || []), { title: item.title, content: item.content, savedAt: now() }].slice(-MAX_REVISIONS);
    item.title = title; item.content = content;
    item.summary = clean(patch.summary == null ? content : patch.summary, 500);
    if (Array.isArray(patch.tags)) item.tags = [...new Set(patch.tags.map(tag => clean(tag, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
    if (patch.projectId !== undefined) item.projectId = clean(patch.projectId, 100);
    item.fingerprint = fingerprint({ type: item.type, title, content });
    item.updatedAt = now(); write(data); return { ...item };
  }
  function remove(id, options = {}) {
    if (options.confirmed !== true) throw new Error("A separate confirmation is required before deleting a knowledge source.");
    const data = read(), records = data.records.filter(item => item.id !== String(id));
    if (records.length === data.records.length) return false;
    data.records = records; data.links = data.links.filter(edge => edge.from !== String(id) && edge.to !== String(id));
    write(data); return true;
  }
  return Object.freeze({
    add, search, link, related, timeline, correct, remove,
    get: id => { const item = read().records.find(record => record.id === String(id)); return item ? { ...item } : null; },
    list: () => read().records.map(item => ({ ...item })),
    status: () => ({ recordCount: read().records.length, relationshipCount: read().links.length, storage: "local", cloudSync: false, automaticCapture: false }),
    clear: options => { if (options?.confirmed !== true) throw new Error("A separate confirmation is required before clearing the knowledge universe."); const count = read().records.length; if (storage?.removeItem) storage.removeItem(KEY); else write({ records: [], links: [] }); return count; }
  });
}
const auroraKnowledgeUniverse = createAuroraKnowledgeUniverse();
export { KEY as AURORA_KNOWLEDGE_UNIVERSE_STORAGE_KEY, SOURCE_TYPES as AURORA_KNOWLEDGE_SOURCE_TYPES, createAuroraKnowledgeUniverse, auroraKnowledgeUniverse };
