const assert = require("node:assert/strict");

(async () => {
  const { createAuroraRoutineScheduler } = await import("../src/core/aurora-routine-scheduler.js");
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const scheduled = new Map();
  let permissionGranted = false;
  const reminder = {
    requestPermission: async () => ({ granted: permissionGranted }),
    schedule: async item => { scheduled.set(item.id, item); return { scheduled: true, id: item.id }; },
    cancel: async id => ({ cancelled: scheduled.delete(id) })
  };
  const workflows = { get: id => id === "study" ? { id: "study", title: "Study session" } : null };
  let now = 100000;
  const routines = createAuroraRoutineScheduler({ storage, reminder, workflows, now: () => now, createId: () => "routine-test-1" });
  await assert.rejects(routines.schedule({ workflowId: "study", at: now + 60000 }), /approval/i);
  await assert.rejects(routines.schedule({ workflowId: "missing", at: now + 60000, approved: true }), /not found/i);
  await assert.rejects(routines.schedule({ workflowId: "study", at: now + 60000, approved: true }), /notification permission/i);
  assert.equal(scheduled.size, 0, "A routine must not create an alarm before notification permission is granted.");
  permissionGranted = true;
  const saved = await routines.schedule({ workflowId: "study", at: now + 60000, approved: true });
  assert.equal(saved.title, "Study session");
  assert.equal(scheduled.has(saved.id), true);
  assert.equal(routines.list()[0].status, "scheduled");
  now += 60001;
  assert.equal(routines.list()[0].status, "due");
  const cancelled = await routines.cancel(saved.id);
  assert.equal(cancelled.cancelled, true);
  assert.equal(routines.list().length, 0);
  console.log("AURORA routine scheduler tests passed: approval-first scheduling, notification permission, saved-workflow validation, reminder-only delivery and cancellation.");
})().catch(error => { console.error(error); process.exitCode = 1; });
