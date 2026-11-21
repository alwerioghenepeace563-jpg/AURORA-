import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
assert.throws(() => watchtower.create({ title:"", query:"results", intervalHours:6 }), /approval|permission/i);
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
const root=process.cwd();
const worker=fs.readFileSync(path.join(root,"android/app/src/main/java/com/aurora/assistant/AuroraWatchtowerWorker.java"),"utf8");
const nativeReminder=fs.readFileSync(path.join(root,"android/app/src/main/java/com/aurora/assistant/AuroraReminderPlugin.java"),"utf8");
const nativeBridge=fs.readFileSync(path.join(root,"src/lib/aurora-native.ts"),"utf8");
const panel=fs.readFileSync(path.join(root,"src/components/WatchtowerPanel.jsx"),"utf8");
const reminderCall=fs.readFileSync(path.join(root,"android/app/src/main/java/com/aurora/assistant/AuroraReminderCallActivity.java"),"utf8");
const reminderReceiver=fs.readFileSync(path.join(root,"android/app/src/main/java/com/aurora/assistant/AuroraReminderReceiver.java"),"utf8");
const manifest=fs.readFileSync(path.join(root,"android/app/src/main/AndroidManifest.xml"),"utf8");
assert.match(reminderReceiver,/IMPORTANCE_HIGH/,"reminders must use high-priority notification channel");
assert.match(reminderReceiver,/AuroraReminderCallActivity/,"reminder notification must open the call-style screen");
assert.match(reminderCall,/SNOOZE · 10 MIN/,"call-style screen must offer a 10-minute snooze");
assert.match(reminderCall,/DISMISS/,"call-style screen must offer dismissal");
assert.match(reminderCall,/setAndAllowWhileIdle/,"snooze must schedule a new Android reminder");
assert.match(manifest,/\.AuroraReminderCallActivity/,"call-style activity must be registered");

assert.match(worker,/PeriodicWorkRequest/,"Android must schedule periodic background checks");
assert.match(worker,/NetworkType\.CONNECTED/,"background checks must wait for network connectivity");
assert.match(worker,/\/api\/search/,"background checks must use AURORA Search");
assert.match(worker,/new search result\(s\)/,"new result notifications must be delivered");
assert.match(nativeReminder,/scheduleWatchtower/,"native reminder plugin must expose Watchtower scheduling");
assert.match(nativeReminder,/cancelWatchtower/,"native reminder plugin must expose Watchtower cancellation");
assert.match(nativeBridge,/AuroraReminderBridge/,"Capacitor bridge must type the Watchtower scheduler");
assert.match(panel,/scheduleWatchtower/,"Watchtower UI must register Android background checks");
assert.match(panel,/cancelWatchtower/,"pause and delete must cancel background work");
console.log("AURORA universal Search Watchtower tests passed.");
