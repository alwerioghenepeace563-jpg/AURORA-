/**
 * Shared, bounded AURORA event bus. Events are ephemeral by default;
 * persistence must be implemented by an explicit consumer.
 */
function createAuroraEventBus(options = {}) {
  const listeners = new Map();
  const history = [];
  const maxHistory = Math.max(10, Math.min(500, Number(options.maxHistory) || 100));
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  function publish(type, payload = {}, metadata = {}) {
    if (typeof type !== "string" || !/^[a-z][a-z0-9_.-]{1,79}$/i.test(type)) throw new Error("Invalid event type.");
    const event = Object.freeze({
      id: metadata.id || (globalThis.crypto?.randomUUID?.() || "evt-" + Date.now().toString(36)),
      type, at: now(), source: String(metadata.source || "runtime").slice(0, 40),
      payload: payload && typeof payload === "object" ? Object.freeze({ ...payload }) : payload
    });
    history.push(event);
    if (history.length > maxHistory) history.splice(0, history.length - maxHistory);
    for (const [pattern, group] of listeners) {
      if (pattern !== "*" && pattern !== type && !(pattern.endsWith(".*") && type.startsWith(pattern.slice(0, -1)))) continue;
      for (const listener of group) { try { listener(event); } catch { /* isolate consumers */ } }
    }
    return event;
  }
  function subscribe(type, listener) {
    if (typeof listener !== "function") throw new TypeError("Event listener must be a function.");
    const key = String(type || "*");
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(listener);
    return () => { const group = listeners.get(key); group?.delete(listener); if (!group?.size) listeners.delete(key); };
  }
  return Object.freeze({ publish, subscribe, recent: (limit = 30) => history.slice(-Math.max(1, Math.min(maxHistory, Number(limit) || 30))), clearVolatileHistory: () => history.splice(0, history.length), listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0) });
}
const auroraEvents = createAuroraEventBus();
export { createAuroraEventBus, auroraEvents };
