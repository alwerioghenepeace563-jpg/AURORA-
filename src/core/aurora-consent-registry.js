/**
 * AURORA privacy and context consent registry.
 * Default-deny, source-scoped, revocable grants. No data is collected here.
 */
const KEY = "aurora-consents-v1";
const SAFE = /^[a-z][a-z0-9_.:-]{1,100}$/;
function createAuroraConsentRegistry(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const now = options.now || (() => Date.now());
  function read() {
    try { const value = JSON.parse(storage?.getItem(KEY) || "[]"); return Array.isArray(value) ? value.filter(x => x && SAFE.test(x.scope) && SAFE.test(x.source)) : []; }
    catch { return []; }
  }
  function write(items) {
    if (!storage?.setItem) throw new Error("Consent storage is unavailable.");
    storage.setItem(KEY, JSON.stringify(items.slice(-200)));
  }
  function grant(input = {}) {
    const scope = String(input.scope || "").trim(), source = String(input.source || "").trim();
    if (!SAFE.test(scope) || !SAFE.test(source)) throw new Error("A valid scope and source are required.");
    const expiresAt = input.expiresAt == null ? null : Number(input.expiresAt);
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= now())) throw new Error("Consent expiry must be in the future.");
    const items = read().filter(x => !(x.scope === scope && x.source === source));
    const record = { id: String(input.id || scope + ":" + source), scope, source, grantedAt: now(), expiresAt, purpose: String(input.purpose || "").slice(0, 240) };
    items.push(record); write(items); return Object.freeze({ ...record });
  }
  function isGranted(scope, source) {
    return read().some(x => x.scope === scope && x.source === source && (x.expiresAt === null || x.expiresAt > now()));
  }
  function requireGrant(scope, source) {
    if (!isGranted(scope, source)) throw Object.assign(new Error("Explicit consent is required for " + scope + " from " + source + "."), { code: "CONSENT_REQUIRED", scope, source });
    return true;
  }
  function revoke(scope, source) {
    const items = read(), next = items.filter(x => !(x.scope === scope && x.source === source));
    if (next.length === items.length) return false;
    write(next); return true;
  }
  function list() { return read().filter(x => x.expiresAt === null || x.expiresAt > now()).map(x => Object.freeze({ ...x })); }
  return Object.freeze({ grant, isGranted, requireGrant, revoke, list, clear: () => storage?.removeItem?.(KEY) });
}
const auroraConsents = createAuroraConsentRegistry();
export { KEY as AURORA_CONSENT_KEY, createAuroraConsentRegistry, auroraConsents };
