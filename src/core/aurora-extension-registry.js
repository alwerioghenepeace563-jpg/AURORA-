/**
 * Declarative extension catalogue. It stores manifests only: no downloaded
 * JavaScript, dynamic imports, eval, or arbitrary code execution.
 * Installation is metadata approval, not automatic capability execution.
 */
const KEY = "aurora-extensions-v1";
const ID = /^[a-z][a-z0-9_.-]{2,64}$/;
function createAuroraExtensionRegistry(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const getCapabilities = options.getCapabilities || (() => []);
  const now = options.now || (() => new Date().toISOString());
  const executeCapability = options.executeCapability;
  function read() { try { const x = JSON.parse(storage?.getItem(KEY) || "[]"); return Array.isArray(x) ? x : []; } catch { return []; } }
  function write(items) { if (!storage?.setItem) throw new Error("Extension storage is unavailable."); storage.setItem(KEY, JSON.stringify(items.slice(-100))); }
  function validate(manifest) {
    if (!manifest || !ID.test(String(manifest.id || ""))) throw new Error("Extension ID is invalid.");
    if (!String(manifest.name || "").trim() || !String(manifest.version || "").trim()) throw new Error("Extension name and version are required.");
    const requested = Array.isArray(manifest.capabilities) ? [...new Set(manifest.capabilities.map(String))] : [];
    const known = new Set(getCapabilities().map(x => x.id));
    const unknown = requested.filter(id => !known.has(id));
    if (unknown.length) throw new Error("Extension requests unknown capabilities: " + unknown.join(", "));
    return { id: manifest.id, name: String(manifest.name).slice(0,100), version: String(manifest.version).slice(0,40), description: String(manifest.description || "").slice(0,500), capabilities: requested, permissions: Array.isArray(manifest.permissions) ? [...new Set(manifest.permissions.map(String))].slice(0,20) : [] };
  }
  function preview(manifest) {
    const value = validate(manifest);
    return Object.freeze({ ...value, status: "approval_required", executesCode: false, note: "Review the requested capabilities and permissions before installing this metadata-only extension." });
  }
  function install(manifest, decision = {}) {
    const value = validate(manifest);
    if (decision.approved !== true) throw Object.assign(new Error("Explicit approval is required to install this extension."), { code: "APPROVAL_REQUIRED" });
    const items = read().filter(x => x.id !== value.id);
    const record = { ...value, installedAt: now(), status: "installed", executesCode: false };
    items.push(record); write(items); return Object.freeze({ ...record });
  }
  async function execute(extensionId, capabilityId, input = {}) {
    const extension = read().find(item => item.id === String(extensionId) && item.status === "installed");
    if (!extension) throw new Error("Installed extension was not found.");
    if (!extension.capabilities.includes(String(capabilityId))) throw new Error("This extension did not request that capability.");
    if (typeof executeCapability !== "function") throw new Error("The AURORA capability executor is unavailable.");
    // The normal Action Engine still applies its own risk checks and approval gate.
    return executeCapability({ capabilityId: String(capabilityId), input: input && typeof input === "object" ? input : {} });
  }
  function uninstall(id) { const items=read(), next=items.filter(x=>x.id!==String(id)); if(next.length===items.length)return false; write(next); return true; }
  function list() { return read().map(x=>Object.freeze({ ...x, capabilities:[...(x.capabilities||[])], permissions:[...(x.permissions||[])] })); }
  return Object.freeze({ preview, install, execute, uninstall, list });
}
export { createAuroraExtensionRegistry };
