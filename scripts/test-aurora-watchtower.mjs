import assert from "node:assert/strict";
import { createAuroraWatchtower, AURORA_WATCHTOWER_KEY } from "../src/core/aurora-watchtower.js";
class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}
const storage = new MemoryStorage();
let now = 1_800_000_000_000;
const watchtower = createAuroraWatchtower({ storage, now: () => now, createId: () => "watch-test" });
assert.throws(() => watchtower.create({ title: "WAEC", query: "results", intervalHours: 6 }), /approval/i);
const created = watchtower.create({ approved: true, title: "WAEC results", query: "WAEC GCE Second Series", sourceUrl: "https://www.waecnigeria.org", category: "education", intervalHours: 1 });
assert.equal(created.id, "watch-test");
assert.equal(watchtower.list().length, 1);
assert.equal(watchtower.list()[0].due, false);
assert.throws(() => watchtower.create({ approved: true, title: "Unsafe", query: "x", sourceUrl: "http://example.com", intervalHours: 1 }), /HTTPS/i);
now += 60 * 60 * 1000 + 1;
assert.equal(watchtower.list()[0].due, true);
watchtower.markChecked("watch-test");
assert.equal(watchtower.list()[0].due, false);
watchtower.update("watch-test", { status: "paused" });
assert.equal(watchtower.list()[0].status, "paused");
watchtower.update("watch-test", { status: "active" });
assert.equal(watchtower.list()[0].status, "active");
assert.equal(watchtower.remove("watch-test"), true);
assert.equal(watchtower.list().length, 0);
storage.setItem(AURORA_WATCHTOWER_KEY, "{broken");
assert.throws(() => watchtower.list(), /corrupt/i);
console.log("AURORA Watchtower tests passed.");
