const assert = require("node:assert/strict");

(async () => {
  const { createAuroraDataInventory } = await import("../src/core/aurora-data-inventory.js");
  const inventory = createAuroraDataInventory({
    memories: () => ({ label: "Saved memories", location: "local browser storage", count: 3, encrypted: false }),
    auth: () => ({ label: "Sign-in session", location: "Android Keystore-backed encrypted storage", count: 1, encrypted: true }),
    sync: () => ({ label: "Cloud memory sync", location: "Supabase", count: 0, syncEnabled: true }),
    broken: () => { throw new Error("provider unavailable"); }
  });
  const report = inventory.inspect();
  assert.equal(report.contentsIncluded, false);
  assert.equal(report.stores.length, 4);
  assert.equal(report.totals.knownRecords, 4);
  assert.equal(report.totals.cloudSyncEnabled, true);
  assert.equal(report.stores.find(item => item.id === "auth").encrypted, true);
  assert.equal(report.stores.find(item => item.id === "memories").encrypted, false);
  assert.equal(report.stores.find(item => item.id === "broken").count, null);
  assert.match(report.stores.find(item => item.id === "broken").note, /could not be inspected/i);
  assert.deepEqual(inventory.listSources(), ["memories", "auth", "sync", "broken"]);
  console.log("AURORA data inventory tests passed: count-only reporting, encrypted-storage labels, cloud-sync status and isolated provider failures.");
})().catch(error => { console.error(error); process.exitCode = 1; });
