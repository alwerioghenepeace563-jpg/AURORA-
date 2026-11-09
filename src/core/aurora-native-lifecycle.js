/**
 * Connects Capacitor's native foreground/background lifecycle to AURORA's
 * reliability coordinator. Resume is observational only: tasks are never replayed.
 */
function connectAuroraNativeLifecycle(appPlugin, reliability) {
  if (!appPlugin || typeof appPlugin.addListener !== "function") throw new TypeError("Capacitor App plugin is required.");
  if (!reliability || typeof reliability.publishLifecycle !== "function" || typeof reliability.getStatus !== "function") throw new TypeError("AURORA reliability coordinator is required.");
  let disposed = false;
  let handle = null;
  const registration = appPlugin.addListener("appStateChange", ({ isActive } = {}) => {
    if (disposed) return;
    const foreground = isActive === true;
    reliability.publishLifecycle(foreground ? "foreground" : "background", { platform: "android", active: foreground });
    if (foreground) {
      const status = reliability.getStatus();
      reliability.publishLifecycle("resume", {
        platform: "android",
        visibility: "foreground",
        recoverableCount: Number(status.recoverableCount) || 0,
        automaticRecovery: false
      });
    }
  });
  Promise.resolve(registration).then((listener) => {
    if (disposed) return listener?.remove?.();
    handle = listener;
  }).catch(() => {});
  return () => {
    if (disposed) return false;
    disposed = true;
    try { if (handle?.remove) void handle.remove(); } catch {}
    return true;
  };
}
export { connectAuroraNativeLifecycle };
