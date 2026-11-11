const DB_NAME = "aurora-media-vault";
const STORE_NAME = "generated-media";
function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("This device does not support local media storage."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local media storage."));
  });
}
export async function saveAuroraMediaBlob(id, blob, metadata = {}) {
  if (typeof id !== "string" || !id || !(blob instanceof Blob)) throw new Error("A media ID and Blob are required.");
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ id, blob, metadata, savedAt: new Date().toISOString() });
    transaction.oncomplete = () => { db.close(); resolve({ id, saved: true }); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Could not save generated media.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error("Generated media save was interrupted.")); };
  });
}
export async function getAuroraMediaBlob(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    request.onsuccess = () => { const record = request.result; db.close(); resolve(record || null); };
    request.onerror = () => { db.close(); reject(request.error || new Error("Could not restore generated media.")); };
  });
}
export async function deleteAuroraMediaBlob(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(true); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Could not remove generated media.")); };
  });
}
