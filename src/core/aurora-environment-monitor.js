/**
 * Shared, capability-detected device conditions for every AURORA surface.
 * Unsupported browser/native APIs remain "unknown"; no polling or private
 * content collection is used. Events contain coarse operational metadata only.
 */
function createAuroraEnvironmentMonitor({ events, navigator: nav = globalThis.navigator, window: win = globalThis.window } = {}) {
  if (!events || typeof events.publish !== "function") throw new TypeError("Shared AURORA event bus required.");
  const removers = [];
  let disposed = false, battery = null, memoryPressure = false;
  const connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection || null;
  const state = {
    connectivity: nav?.onLine === false ? "offline" : nav?.onLine === true ? "online" : "unknown",
    networkType: "unknown", saveData: false, batteryPercent: null, charging: null,
    deviceMemoryGb: Number.isFinite(nav?.deviceMemory) ? Math.max(0, nav.deviceMemory) : null,
    memoryPressure: false, adaptiveMode: "balanced"
  };
  const snapshot = () => Object.freeze({ ...state });
  function deriveMode() {
    const slowNetwork = ["slow-2g", "2g"].includes(state.networkType);
    const lowBattery = state.batteryPercent !== null && state.batteryPercent <= 15 && state.charging !== true;
    const lowMemory = state.deviceMemoryGb !== null && state.deviceMemoryGb <= 2;
    state.adaptiveMode = state.memoryPressure || lowMemory || state.saveData || slowNetwork || lowBattery ? "conserve" : "balanced";
  }
  function publish(reason) {
    deriveMode();
    events.publish("app.environment.changed", { ...snapshot(), reason: String(reason || "update").slice(0, 32) }, { source: "environment_monitor" });
  }
  function listen(target, type, handler) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler);
    removers.push(() => target.removeEventListener(type, handler));
  }
  function syncConnection(reason = "network_change") {
    state.connectivity = nav?.onLine === false ? "offline" : nav?.onLine === true ? "online" : "unknown";
    state.networkType = typeof connection?.effectiveType === "string" ? connection.effectiveType.slice(0, 16) : "unknown";
    state.saveData = connection?.saveData === true;
    publish(reason);
  }
  listen(win, "online", () => syncConnection("online"));
  listen(win, "offline", () => syncConnection("offline"));
  listen(connection, "change", () => syncConnection("connection_change"));
  listen(win, "memorypressure", () => { state.memoryPressure = true; publish("memory_pressure"); });
  listen(win, "memorypressurechange", (event) => { state.memoryPressure = event?.pressure === "critical" || event?.level === "critical"; publish("memory_pressure_change"); });
  syncConnection("initial");
  if (typeof nav?.getBattery === "function") {
    Promise.resolve().then(() => nav.getBattery()).then((manager) => {
      if (disposed || !manager) return;
      battery = manager;
      const syncBattery = () => {
        state.batteryPercent = Number.isFinite(manager.level) ? Math.round(Math.max(0, Math.min(1, manager.level)) * 100) : null;
        state.charging = typeof manager.charging === "boolean" ? manager.charging : null;
        publish("battery_change");
      };
      for (const type of ["levelchange", "chargingchange"]) listen(manager, type, syncBattery);
      syncBattery();
    }).catch(() => { /* Battery API unavailable or denied: remain unknown. */ });
  }
  return Object.freeze({
    getStatus: snapshot,
    dispose() {
      if (disposed) return false;
      disposed = true;
      for (const remove of removers.splice(0)) { try { remove(); } catch {} }
      battery = null;
      return true;
    }
  });
}
export { createAuroraEnvironmentMonitor };
