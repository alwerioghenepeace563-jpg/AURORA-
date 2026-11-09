/**
 * Cross-surface request gateway.
 * Main chat, Pulse and voice transcripts enter the same capability runtime.
 * Events contain metadata only; message text and tool results are never emitted.
 */
const ALLOWED_SURFACES = new Set(["main_chat", "pulse", "voice"]);

function createAuroraSurfaceGateway({ routeMessage, events } = {}) {
  if (typeof routeMessage !== "function") throw new TypeError("A surface gateway requires the shared routeMessage function.");
  if (!events || typeof events.publish !== "function") throw new TypeError("A surface gateway requires the shared event bus.");

  async function route(text, options = {}) {
    const message = String(text || "").trim();
    const surface = String(options.surface || "main_chat");
    if (!ALLOWED_SURFACES.has(surface)) {
      return { error: "This AURORA surface is not registered.", code: "UNKNOWN_SURFACE" };
    }
    if (!message) return { error: "Enter a message for AURORA.", code: "EMPTY_MESSAGE" };
    if (message.length > 12000) return { error: "That message is too long. Please shorten it and try again.", code: "MESSAGE_TOO_LONG" };

    const requestId = typeof options.requestId === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(options.requestId)
      ? options.requestId
      : (globalThis.crypto?.randomUUID?.() || "surface-" + Date.now().toString(36));
    const startedAt = Date.now();
    events.publish("surface.request.started", { surface, requestId, characterCount: message.length }, { source: "surface_gateway" });
    try {
      const result = await routeMessage(message);
      const safeResult = result && typeof result === "object" ? result : null;
      events.publish("surface.request.completed", {
        surface, requestId, durationMs: Math.max(0, Date.now() - startedAt),
        outcome: safeResult?.error ? "error" : "routed"
      }, { source: "surface_gateway" });
      return safeResult;
    } catch (error) {
      events.publish("surface.request.failed", {
        surface, requestId, durationMs: Math.max(0, Date.now() - startedAt),
        code: typeof error?.code === "string" ? error.code.slice(0, 80) : "SURFACE_ROUTE_FAILED"
      }, { source: "surface_gateway" });
      return { error: error?.message || "AURORA could not process that request.", code: error?.code || "SURFACE_ROUTE_FAILED" };
    }
  }

  return Object.freeze({ route, supportedSurfaces: () => [...ALLOWED_SURFACES] });
}

export { createAuroraSurfaceGateway };
