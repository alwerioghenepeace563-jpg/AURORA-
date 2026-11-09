const assert = require("node:assert/strict");

(async () => {
  const { planAuroraActions, splitActions } = await import("../src/core/aurora-task-planner.js");
  const capabilities = [
    { id: "android.open_app" }, { id: "device.get_status" },
    { id: "device.set_flashlight" }, { id: "maps.get_directions" },
    { id: "media.search_play" }, { id: "notifications.read_recent" }
  ];
  assert.deepEqual(splitActions("Hey AURORA, open WhatsApp and then check battery."), ["open WhatsApp", "check battery"]);
  const plan = planAuroraActions("Open WhatsApp and then check battery", capabilities);
  assert.ok(plan && Array.isArray(plan.steps), "The planner must produce a supported plan for 'check battery' without requiring the word status. Received: " + JSON.stringify(plan));
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].capabilityId, "android.open_app");
  assert.equal(plan.steps[0].input.packageName, "com.whatsapp");
  assert.equal(plan.steps[1].capabilityId, "device.get_status");
  const statusPlan = planAuroraActions("Open WhatsApp and then check battery status", capabilities);
  assert.ok(statusPlan && Array.isArray(statusPlan.steps), "The planner must also accept the explicit 'check battery status' wording.");
  assert.equal(statusPlan.steps[1].capabilityId, "device.get_status");
  assert.deepEqual(plan.steps[1].dependsOn, ["step-1"]);
  const mixed = planAuroraActions("Open WhatsApp and send a message to someone", capabilities);
  assert.equal(mixed.unsupported, true, "Unknown or unsupported clauses must not be silently dropped.");
  assert.deepEqual(mixed.unsupportedClauses, ["send a message to someone"]);
  assert.equal(planAuroraActions("Open WhatsApp", capabilities), null, "Single actions stay on the existing route.");
  const directions = planAuroraActions("Get directions to the library and turn on flashlight", capabilities);
  assert.equal(directions.steps[0].input.destination, "the library");
  assert.equal(directions.steps[1].input.enabled, true);
  console.log("AURORA planner tests passed: explicit multi-action parsing, typed capability mapping, dependency ordering and fail-closed unknown clauses.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
