/**
 * Stage 12 predictive/sensor foundation.
 * Accepts coarse, explicitly supplied readings from permission-aware adapters.
 * No background sampling, location collection, or automatic action execution.
 */
const MAX_SAMPLES = 120;
const MAX_SUGGESTIONS = 40;
const ALLOWED_SIGNALS = new Set(["motion", "stillness", "ambient_light", "device_idle", "battery_saver"]);
const boundedText = (value, max = 120) => String(value || "").trim().slice(0, max);

function createAuroraPredictiveIntelligence(options = {}) {
  const now = options.now || (() => Date.now());
  const events = options.events;
  const sources = new Map();
  const samples = [];
  const suggestions = [];
  const snoozed = new Map();
  let enabled = false;
  let paused = false;
  let retentionMs = 24 * 60 * 60 * 1000;
  let lastSampleAt = new Map();

  function publish(type, payload = {}) {
    events?.publish?.("prediction." + type, payload, { source: "predictive_intelligence" });
  }
  function requireEnabled() {
    if (!enabled || paused) throw Object.assign(new Error("Predictive intelligence is disabled or paused."), { code: "PREDICTION_PAUSED" });
  }
  function configure(input = {}) {
    if (input.enabled === true && input.consent !== true) throw Object.assign(new Error("Explicit consent is required to enable predictive intelligence."), { code: "CONSENT_REQUIRED" });
    enabled = input.enabled === true;
    paused = input.paused === true;
    if (Number.isFinite(input.retentionHours)) retentionMs = Math.max(1, Math.min(168, input.retentionHours)) * 60 * 60 * 1000;
    if (!enabled) { samples.splice(0); suggestions.splice(0); snoozed.clear(); }
    publish("settings_changed", { enabled, paused, retentionHours: retentionMs / 3600000 });
    return getStatus();
  }
  function registerSource(source = {}) {
    const id = boundedText(source.id, 64);
    if (!id || !ALLOWED_SIGNALS.has(source.signal)) throw new Error("Sensor source ID or signal type is invalid.");
    if (source.permissionGranted !== true || source.consent !== true) throw Object.assign(new Error("Sensor permission and source consent are both required."), { code: "SENSOR_ACCESS_DENIED" });
    const record = Object.freeze({ id, signal: source.signal, label: boundedText(source.label || source.signal, 60), samplingIntervalMs: Math.max(5000, Math.min(3600000, Number(source.samplingIntervalMs) || 60000)) });
    sources.set(id, record);
    publish("source_registered", { sourceId: id, signal: record.signal });
    return record;
  }
  function unregisterSource(id) {
    const key = String(id);
    sources.delete(key);
    lastSampleAt.delete(key);
    for (let i = samples.length - 1; i >= 0; i--) if (samples[i].sourceId === key) samples.splice(i, 1);
    publish("source_removed", { sourceId: key });
    return true;
  }
  function prune() {
    const cutoff = now() - retentionMs;
    for (let i = samples.length - 1; i >= 0; i--) if (samples[i].at < cutoff) samples.splice(i, 1);
    for (let i = suggestions.length - 1; i >= 0; i--) if (suggestions[i].createdAt < cutoff) suggestions.splice(i, 1);
  }
  function recordSignal(sourceId, value, timestamp = now()) {
    requireEnabled();
    const source = sources.get(String(sourceId));
    if (!source) throw new Error("Sensor source is not registered.");
    const at = Number(timestamp);
    if (!Number.isSafeInteger(at) || at > now() + 5000 || at < now() - 60000) throw new Error("Sensor timestamp is outside the accepted window.");
    if (at - (lastSampleAt.get(source.id) || 0) < source.samplingIntervalMs) return { accepted: false, reason: "sampling_interval" };
    const normalized = typeof value === "boolean" ? value : Number(value);
    if (typeof normalized === "number" && (!Number.isFinite(normalized) || normalized < 0 || normalized > 100)) throw new Error("Sensor reading is outside the supported range.");
    const sample = Object.freeze({ sourceId: source.id, signal: source.signal, value: normalized, at });
    samples.push(sample);
    if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
    lastSampleAt.set(source.id, at);
    prune();
    publish("sample_recorded", { sourceId: source.id, signal: source.signal, at });
    return { accepted: true, signal: source.signal, at };
  }
  function suggest(input = {}) {
    requireEnabled();
    prune();
    const title = boundedText(input.title, 100), reason = boundedText(input.reason, 240);
    if (!title || !reason) throw new Error("A suggestion needs a title and an explanation.");
    const id = boundedText(input.id || "suggestion-" + now().toString(36), 80);
    const item = Object.freeze({ id, title, reason, sourceIds: Array.isArray(input.sourceIds) ? input.sourceIds.map(x => boundedText(x, 64)).filter(x => sources.has(x)).slice(0, 8) : [], createdAt: now(), status: "pending" });
    const existing = suggestions.findIndex(x => x.id === id);
    if (existing >= 0) suggestions.splice(existing, 1);
    suggestions.unshift(item);
    if (suggestions.length > MAX_SUGGESTIONS) suggestions.length = MAX_SUGGESTIONS;
    publish("suggestion_created", { id, sourceCount: item.sourceIds.length });
    return item;
  }
  function listSuggestions() {
    prune();
    return suggestions.filter(item => !snoozed.has(item.id) || snoozed.get(item.id) <= now()).map(item => ({ ...item }));
  }
  function snooze(id, durationMs = 60 * 60 * 1000) {
    const key = String(id);
    if (!suggestions.some(item => item.id === key)) return false;
    snoozed.set(key, now() + Math.max(60000, Math.min(7 * 86400000, Number(durationMs) || 3600000)));
    publish("suggestion_snoozed", { id: key });
    return true;
  }
  function dismiss(id) {
    const key = String(id), before = suggestions.length;
    for (let i = suggestions.length - 1; i >= 0; i--) if (suggestions[i].id === key) suggestions.splice(i, 1);
    snoozed.delete(key);
    if (suggestions.length !== before) publish("suggestion_dismissed", { id: key });
    return suggestions.length !== before;
  }
  function getStatus() {
    prune();
    return Object.freeze({ enabled, paused, sourceCount: sources.size, sampleCount: samples.length, suggestionCount: suggestions.length, retentionHours: retentionMs / 3600000, supportedSignals: [...ALLOWED_SIGNALS] });
  }
  return Object.freeze({ configure, registerSource, unregisterSource, recordSignal, suggest, listSuggestions, snooze, dismiss, getStatus, pause: () => configure({ enabled, paused: true, retentionHours: retentionMs / 3600000 }), resume: (consent) => configure({ enabled, paused: false, consent, retentionHours: retentionMs / 3600000 }), clear: () => { samples.splice(0); suggestions.splice(0); snoozed.clear(); publish("data_cleared"); return true; } });
}
export { createAuroraPredictiveIntelligence };
