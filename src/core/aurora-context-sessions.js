const SOURCES = new Set(["screen", "document", "location", "media", "notification"]);
const SURFACES = new Set(["main_chat", "pulse", "voice"]);
function createAuroraContextSessions({ events = null, now = () => Date.now(), maxActive = 8, maxText = 12000 } = {}) {
  const sessions = new Map(); let sequence = 0;
  const publish = (type, session, extra = {}) => { if (events?.publish) events.publish("context." + type, { sessionId: session.id, source: session.source, surface: session.surface, ...extra }, { source: "context_sessions" }); };
  function begin({ source, surface, userInitiated = false, ttlMs = 30000 } = {}) {
    if (!userInitiated) throw new Error("Context capture must be started by an explicit user action.");
    if (!SOURCES.has(source) || !SURFACES.has(surface)) throw new Error("Unsupported context source or surface.");
    if (sessions.size >= maxActive) throw new Error("Too many active context sessions. Close an existing session first.");
    const stamp = now(), id = globalThis.crypto?.randomUUID?.() || "ctx-" + (++sequence).toString(36) + "-" + stamp.toString(36);
    const session = Object.freeze({ id, source, surface, expiresAt: stamp + Math.max(1000, Math.min(60000, Number(ttlMs) || 30000)) });
    sessions.set(id, session); publish("session_started", session);
    return { id, source, surface, expiresAt: session.expiresAt };
  }
  function consume(id, payload) {
    const session = sessions.get(id); if (!session) throw new Error("Context session is missing, expired, or already used.");
    sessions.delete(id);
    if (now() > session.expiresAt) { publish("session_expired", session); throw new Error("Context session expired. Start a new capture when ready."); }
    const raw = typeof payload === "string" ? payload : payload?.text;
    if (typeof raw !== "string" || !raw.trim()) throw new Error("No readable context was supplied.");
    const normalized = raw.trim(), text = normalized.slice(0, maxText), truncated = normalized.length > text.length;
    publish("context_consumed", session, { characterCount: text.length, truncated });
    return Object.freeze({ sessionId: id, source: session.source, surface: session.surface, text, truncated, capturedAt: now() });
  }
  function revoke(id) { const session = sessions.get(id); if (!session) return false; sessions.delete(id); publish("session_revoked", session); return true; }
  function clear() { for (const session of sessions.values()) publish("session_revoked", session); sessions.clear(); }
  function status() { return Object.freeze({ activeSessions: sessions.size, sources: [...new Set([...sessions.values()].map(x => x.source))], persistent: false }); }
  return Object.freeze({ begin, consume, revoke, clear, status });
}
export { createAuroraContextSessions };
