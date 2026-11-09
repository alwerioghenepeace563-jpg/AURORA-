const assert = require("node:assert/strict");

(async () => {
  const { parseCalendarIntent } = await import("../src/core/aurora-intent-parser.js");
  const now = new Date(2026, 10, 9, 8, 0, 0, 0);
  const tomorrow = parseCalendarIntent("remind me to study tomorrow at 3 pm", now);
  assert.ok(tomorrow);
  assert.equal(tomorrow.title, "study");
  const start = new Date(tomorrow.beginTime);
  assert.equal(start.getDate(), 10);
  assert.equal(start.getHours(), 15);
  assert.equal(tomorrow.endTime - tomorrow.beginTime, 60 * 60 * 1000);

  const weekday = parseCalendarIntent("schedule biology revision friday at 4:30 pm", now);
  assert.ok(weekday);
  assert.equal(new Date(weekday.beginTime).getDay(), 5);
  assert.equal(new Date(weekday.beginTime).getHours(), 16);
  assert.equal(new Date(weekday.beginTime).getMinutes(), 30);

  assert.equal(parseCalendarIntent("schedule a meeting tomorrow at 15 pm", now), null);
  assert.equal(parseCalendarIntent("remind me to study someday", now), null);
  assert.equal(parseCalendarIntent("remind me to study today at 7 am", now), null);
  console.log("AURORA intent parser tests passed: relative dates, weekdays, time validation and duration.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
