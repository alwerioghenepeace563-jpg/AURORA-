/**
 * Thin secure-storage facade. On Android, values are encrypted by AES-GCM
 * using a key held in Android Keystore and stored under noBackupFilesDir.
 * No insecure browser-storage fallback is provided.
 */
function createAuroraSecureStore(options = {}) {
  const adapter = options.adapter || null;
  const available = options.available === true;
  function requireNative() {
    if (!available || !adapter) throw new Error("Android Keystore-backed secure storage is available in the Android app only.");
  }
  return Object.freeze({
    async set(key, value) {
      requireNative();
      if (typeof key !== "string" || !key.trim() || key.length > 128 || typeof value !== "string" || value.length > 32768) throw new Error("Provide a valid key and a string value under 32 KB.");
      return adapter.set(key, value);
    },
    async get(key) {
      requireNative();
      if (typeof key !== "string" || !key.trim() || key.length > 128) throw new Error("Provide a valid key.");
      return adapter.get(key);
    },
    async remove(key) {
      requireNative();
      if (typeof key !== "string" || !key.trim() || key.length > 128) throw new Error("Provide a valid key.");
      return adapter.remove(key);
    },
    status: () => ({ available, encryption: available ? "android-keystore-aes-gcm" : "unavailable", browserFallback: false })
  });
}
export { createAuroraSecureStore };
