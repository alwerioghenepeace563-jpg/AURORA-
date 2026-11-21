import assert from "node:assert/strict";
import { createAuroraWatchtower, AURORA_WATCHTOWER_KEY } from "../src/core/aurora-watchtower.js";
class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}
const storage = new MemoryStorage();
let now = 1_800_000_000_000, searched = [];
const watchtower = createAuroraWatchtower({
  storage, now: () => now, createId: () => "watch-test",
  searcher: async query => { searched.push(query); return { source:"AURORA Search", results:[
    {title:"First result",url:"https://example.com/one",snippet:"A useful update"},
    {title:"Second result",url:"https://example.com/two",snippet:"Another update"}
  ]}; }
});
assert.throws(() => watchtower.create({ title:"", query:"results", intervalHours:6 }), /approval/i);
const created = watchtower.create({ approved:true, title:"Anything tracker", query:"new developments about renewable energy", intervalHours:1 });
assert.equal(created.id,"watch-test");
assert.equal(watchtower.list().length,1);
assert.equal(watchtower.list()[0].due,false);
assert.equal(created.lastSearch,null);
const first=await watchtower.check("watch-test");
assert.equal(searched[0],"new developments about renewable energy");
assert.equal(first.results.length,2);
assert.equal(first.newResults.length,2);
assert.equal(watchtower.list()[0].lastSearch.results.length,2);
const second=await watchtower.check("watch-test");
assert.equal(second.newResults.length,0);
now += 60*60*1000+1;
assert.equal(watchtower.list()[0].due,true);
watchtower.update("watch-test",{status:"paused"});
assert.equal(watchtower.list()[0].status,"paused");
await assert.rejects(()=>watchtower.check("watch-test"),/resume/i);
watchtower.update("watch-test",{status:"active"});
assert.equal(watchtower.list()[0].status,"active");
assert.equal(watchtower.remove("watch-test"),true);
assert.equal(watchtower.list().length,0);
storage.setItem(AURORA_WATCHTOWER_KEY,"{broken");
assert.throws(()=>watchtower.list(),/corrupt/i);
console.log("AURORA universal Search Watchtower tests passed.");
