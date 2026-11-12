/**
 * Read-only privacy inventory for AURORA's registered data stores.
 * Reports counts and storage classes only; never returns record contents,
 * credentials, access tokens, or arbitrary localStorage keys.
 */
function createAuroraDataInventory(sources = {}) {
  const providers = new Map();
  for (const [id, provider] of Object.entries(sources)) {
    if (!/^[a-z][a-z0-9_.-]{1,60}$/.test(id) || typeof provider !== "function") {
      throw new TypeError("Each inventory source needs a safe ID and provider.");
    }
    providers.set(id, provider);
  }

  function inspect() {
    const stores = [];
    for (const [id, provider] of providers) {
      try {
        const value = provider() || {};
        const count = value.count == null ? null : Number(value.count);
        stores.push(Object.freeze({
          id,
          label: String(value.label || id).slice(0, 100),
          location: String(value.location || "local").slice(0, 80),
          count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : null,
          encrypted: value.encrypted === true,
          syncEnabled: value.syncEnabled === true,
          note: String(value.note || "").slice(0, 240)
        }));
      } catch {
        stores.push(Object.freeze({
          id, label: id, location: "unknown", count: null,
          encrypted: false, syncEnabled: false,
          note: "This store could not be inspected."
        }));
      }
    }
    return Object.freeze({
      generatedAt: new Date().toISOString(),
      stores: Object.freeze(stores),
      totals: Object.freeze({
        stores: stores.length,
        knownRecords: stores.reduce((sum, item) => sum + (item.count ?? 0), 0),
        cloudSyncEnabled: stores.some(item => item.syncEnabled)
      }),
      contentsIncluded: false
    });
  }

  return Object.freeze({ inspect, listSources: () => [...providers.keys()] });
}

export { createAuroraDataInventory };
