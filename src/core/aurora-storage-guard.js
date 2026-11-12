/**
 * Shared fail-closed reader for AURORA's browser/local persistence.
 * localStorage is NOT encrypted. Corrupt or malformed data is never silently
 * replaced with an empty collection, preventing accidental destructive writes.
 */
function readStoredJson(storage, key, fallback, validate, label = key) {
  if (!storage || typeof storage.getItem !== "function") return fallback;
  const raw = storage.getItem(key);
  if (raw == null || raw === "") return fallback;
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error(label + " is corrupt; no data was changed."); }
  if (!validate(value)) throw new Error(label + " has an invalid structure; no data was changed.");
  return value;
}
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isArrayOf = (value, predicate) => Array.isArray(value) && value.every(predicate);
export { readStoredJson, isRecord, isArrayOf };
