/**
 * Stops live interaction sessions when the app leaves the foreground.
 * It never resumes a microphone automatically; the user must tap to restart.
 */
function createAuroraInteractionInterruptionCoordinator({ events, initiallyBackground = false } = {}) {
  if (!events || typeof events.subscribe !== "function" || typeof events.publish !== "function") throw new TypeError("Shared AURORA event bus required.");
  const sessions = new Map();
  let sequence = 0, background = initiallyBackground === true, disposed = false;
  const unsubscribe = events.subscribe("*", (event) => {
    if (disposed) return;
    const type = String(event?.type || "");
    if (type === "app.lifecycle.background" || (type === "app.lifecycle.visibility" && event.payload?.visibility === "background")) {
      background = true;
      for (const [id, session] of [...sessions]) {
        sessions.delete(id);
        try { session.stop(); } catch {}
        events.publish("interaction.interrupted", { sessionId: id, surface: session.surface, reason: "background" }, { source: "interaction_interruption" });
      }
    } else if (type === "app.lifecycle.foreground" || type === "app.lifecycle.resume" || (type === "app.lifecycle.visibility" && event.payload?.visibility === "foreground")) background = false;
  });
  return Object.freeze({
    register(surface, stop) {
      if (disposed) return () => false;
      if (typeof stop !== "function") throw new TypeError("An interaction stop callback is required.");
      const id = "interaction-" + (++sequence), safeSurface = ["main_chat", "pulse", "voice"].includes(surface) ? surface : "voice";
      if (background) {
        try { stop(); } catch {}
        events.publish("interaction.interrupted", { sessionId: id, surface: safeSurface, reason: "already_background" }, { source: "interaction_interruption" });
        return () => false;
      }
      sessions.set(id, { surface: safeSurface, stop });
      let active = true;
      return () => { if (!active) return false; active = false; return sessions.delete(id); };
    },
    getActiveCount: () => sessions.size,
    isBackground: () => background,
    dispose() { if (disposed) return false; disposed = true; unsubscribe(); sessions.clear(); return true; }
  });
}
export { createAuroraInteractionInterruptionCoordinator };
