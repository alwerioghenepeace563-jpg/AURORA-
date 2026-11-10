import assert from "node:assert/strict";
import { buildAuroraRoutineInsights } from "../src/core/aurora-routine-insights.js";
const now = Date.parse("2026-11-10T09:00:00.000Z");
const insights = buildAuroraRoutineInsights({
  now,
  tasks: [{ title: "Study chemistry", done: false }, { title: "Finish lab report", done: false }, { title: "Completed", done: true }],
  events: [{ title: "Practical class", at: "2026-11-10T10:30:00.000Z" }],
  reminders: [{ title: "Take notebook", at: "2026-11-10T09:45:00.000Z", done: false }]
});
assert.equal(insights.length, 3);
assert.equal(insights[0].kind, "task_focus");
assert.equal(insights[1].kind, "event_preparation");
assert.equal(insights[2].kind, "reminder_review");
assert.match(insights[0].reason, /2 unfinished tasks/);
assert.match(insights[1].reason, /Practical class/);
assert.match(insights[2].reason, /Take notebook/);
assert.equal(buildAuroraRoutineInsights({ now, tasks: [], reminders: [], events: [] }).length, 0);
assert.equal(buildAuroraRoutineInsights({ now, tasks: [{title:"Old",done:false}], events:[{title:"Past",at:"2026-11-10T08:00:00Z"}] }).length, 1);
assert.equal(buildAuroraRoutineInsights({ now, tasks: [{title:"A",done:false}], events:[{title:"Far",at:"2026-11-12T09:00:00Z"}] }).length, 1);
const bounded = buildAuroraRoutineInsights({ now, tasks: [{title:"A".repeat(1000),done:false}], events:[] });
assert.ok(bounded[0].reason.length <= 240);
console.log("AURORA routine insight tests passed.");
