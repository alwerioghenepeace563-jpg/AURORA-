/**
 * Consent-first connected ecosystem registry.
 * Stores connector metadata only; credentials remain with platform adapters.
 * All actions delegate to the shared Action Engine.
 */
const ID = /^[a-z][a-z0-9_.-]{2,64}$/;
const MAX_CONNECTORS = 50;
const MAX_SCOPES = 20;
const MAX_CAPABILITIES = 50;
function createAuroraConnectedEcosystem(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const executeCapability = options.executeCapability;
  const adapters = new Map();
  const now = options.now || (() => new Date().toISOString());
  const key = "aurora-connected-ecosystem-v1";
  function read() {
    try {
      const raw = storage?.getItem?.(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length > MAX_CONNECTORS || !parsed.every(item =>
        item && ID.test(String(item.id || "")) && typeof item.name === "string" &&
        typeof item.version === "string" && Array.isArray(item.scopes) &&
        item.scopes.length <= MAX_SCOPES && item.scopes.every(x => typeof x === "string" && x.length <= 100) &&
        Array.isArray(item.capabilities) && item.capabilities.length <= MAX_CAPABILITIES &&
        item.capabilities.every(x => typeof x === "string" && ID.test(x)) &&
        ["connected", "disconnected", "error"].includes(item.status) &&
        typeof item.credentialsStored === "boolean" && item.credentialsStored === false
      )) return [];
      return parsed;
    } catch { return []; }
  }
  function write(items) {
    if (!storage?.setItem) throw new Error("Connected ecosystem storage is unavailable.");
    storage.setItem(key, JSON.stringify(items.slice(-MAX_CONNECTORS)));
  }
  function adapterFailure(id, operation) {
    const code = "CONNECTOR_" + String(operation).toUpperCase() + "_FAILED";
    options.events?.publish?.("ecosystem.connector_error", { connectorId: String(id), operation: String(operation), code }, { source: "connected_ecosystem" });
    return Object.assign(new Error("The connected service could not complete this request."), { code });
  }
  function validate(manifest) {
    if (!manifest || !ID.test(String(manifest.id || ""))) throw new Error("Connector ID is invalid.");
    const name = String(manifest.name || "").trim();
    const version = String(manifest.version || "").trim();
    if (!name || !version) throw new Error("Connector name and version are required.");
    const scopes = Array.isArray(manifest.scopes) ? [...new Set(manifest.scopes.map(x => String(x).trim()).filter(Boolean))] : [];
    if (!scopes.length || scopes.length > MAX_SCOPES || scopes.some(x => x.length > 100)) throw new Error("Connector scopes are invalid.");
    const capabilities = Array.isArray(manifest.capabilities) ? [...new Set(manifest.capabilities.map(String))] : [];
    if (capabilities.length > MAX_CAPABILITIES || capabilities.some(id => !ID.test(id))) throw new Error("Connector capabilities are invalid.");
    const known = new Set((options.getCapabilities?.() || []).map(x => x.id));
    const unknown = capabilities.filter(id => !known.has(id));
    if (unknown.length) throw new Error("Connector requests unknown AURORA capabilities: " + unknown.join(", "));
    return { id: manifest.id, name: name.slice(0,100), version: version.slice(0,40), description: String(manifest.description || "").slice(0,500), scopes, capabilities };
  }
  function registerAdapter(id, adapter) {
    if (!ID.test(String(id)) || !adapter || typeof adapter.connect !== "function" || typeof adapter.disconnect !== "function") throw new Error("A connector adapter must provide connect and disconnect methods.");
    adapters.set(String(id), adapter);
    return true;
  }
  function preview(manifest) {
    const item = validate(manifest);
    return Object.freeze({ ...item, status: "approval_required", credentialsStored: false, note: "Review every requested scope. Credentials are handled by the connector adapter and are never stored in this registry." });
  }
  async function connect(manifest, decision = {}) {
    const item = validate(manifest);
    if (decision.approved !== true || decision.consent !== true) throw Object.assign(new Error("Explicit approval and scope consent are required."), { code: "CONSENT_REQUIRED" });
    const adapter = adapters.get(item.id);
    if (!adapter) throw new Error("No supported connector adapter is registered for " + item.id + ".");
    let result;
    try {
      result = await adapter.connect({ scopes: [...item.scopes] });
    } catch {
      throw adapterFailure(item.id, "connect");
    }
    if (result?.connected !== true) throw adapterFailure(item.id, "connect");
    const record = { ...item, connectedAt: now(), status: "connected", credentialsStored: false, accountLabel: String(result.accountLabel || "").slice(0,120) };
    write([...read().filter(x => x.id !== item.id), record]);
    options.events?.publish?.("ecosystem.connector_connected", { connectorId: item.id, scopes: item.scopes }, { source: "connected_ecosystem" });
    return Object.freeze({ ...record });
  }
  async function disconnect(id) {
    const item = read().find(x => x.id === String(id));
    if (!item) return false;
    const adapter = adapters.get(item.id);
    if (!adapter) throw new Error("Cannot safely disconnect this service until its connector adapter is available.");
    try {
      await adapter.disconnect();
    } catch {
      // Keep the record so the user can retry revocation; never claim it disconnected.
      throw adapterFailure(item.id, "disconnect");
    }
    write(read().filter(x => x.id !== item.id));
    options.events?.publish?.("ecosystem.connector_disconnected", { connectorId: item.id }, { source: "connected_ecosystem" });
    return true;
  }
  async function execute(connectorId, capabilityId, input = {}) {
    const item = read().find(x => x.id === String(connectorId) && x.status === "connected");
    if (!item) throw new Error("Connected service was not found.");
    if (!item.capabilities.includes(String(capabilityId))) throw new Error("This connector did not request that capability.");
    if (typeof executeCapability !== "function") throw new Error("The shared AURORA Action Engine is unavailable.");
    return executeCapability({ capabilityId: String(capabilityId), input: input && typeof input === "object" ? input : {} });
  }
  function list() { return read().map(x => Object.freeze({ ...x, scopes: [...x.scopes], capabilities: [...x.capabilities], credentialsStored: false })); }
  function status() { const items = read(); return Object.freeze({ total: items.length, connected: items.filter(x => x.status === "connected").length, availableAdapters: adapters.size, credentialsStored: false }); }
  return Object.freeze({ preview, registerAdapter, connect, disconnect, execute, list, status });
}
export { createAuroraConnectedEcosystem };
