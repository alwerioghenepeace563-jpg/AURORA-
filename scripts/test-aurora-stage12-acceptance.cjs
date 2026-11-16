const assert = require("node:assert/strict");
const fs = require("node:fs");

(async () => {
  const { createAuroraEventBus } = await import("../src/core/aurora-event-bus.js");
  const { createAuroraPredictiveIntelligence } = await import("../src/core/aurora-predictive-intelligence.js");
  const { buildAuroraRoutineInsights } = await import("../src/core/aurora-routine-insights.js");
  const { buildAuroraDeviceInsights } = await import("../src/core/aurora-device-insights.js");

  let now = Date.parse("2026-11-15T09:00:00.000Z");
  const events = createAuroraEventBus({ now: () => new Date(now).toISOString() });
  const predictive = createAuroraPredictiveIntelligence({ events, now: () => now });

  assert.throws(() => predictive.configure({ enabled: true }), /consent/i,
    "predictive intelligence must not enable without explicit consent");
  predictive.configure({ enabled: true, consent: true, retentionHours: 1 });
  predictive.registerSource({
    id: "stage12-motion",
    signal: "motion",
    permissionGranted: true,
    consent: true,
    samplingIntervalMs: 5000
  });
  assert.equal(predictive.recordSignal("stage12-motion", 1).accepted, true);
  assert.equal(predictive.suggest({
    id: "stage12-study",
    title: "Review your study plan",
    reason: "A suitable study window may be available.",
    sourceIds: ["stage12-motion"]
  }).status, "pending");
  assert.equal(predictive.listSuggestions().length, 1,
    "predictive output must remain a suggestion, not an executed action");

  now += 60 * 60 * 1000 + 1;
  assert.equal(predictive.getStatus().sampleCount, 0,
    "sensor samples must expire at the configured retention boundary");
  predictive.unregisterSource("stage12-motion");
  assert.equal(predictive.getStatus().sourceCount, 0);
  predictive.clear();
  assert.equal(predictive.listSuggestions().length, 0);

  const at = Date.parse("2026-11-15T09:00:00.000Z");
  const routine = buildAuroraRoutineInsights({
    now: at,
    tasks: [{ title: "Review notes", done: false }],
    events: [{ title: "Class", at: "2026-11-15T10:00:00.000Z" }],
    reminders: [{ title: "Pack notebook", at: "2026-11-15T09:30:00.000Z", done: false }]
  });
  assert.deepEqual(routine.map(item => item.kind),
    ["task_next_step", "event_preparation", "reminder_review"]);
  assert.ok(buildAuroraDeviceInsights({
    batteryPercent: 18, charging: false, thermalStatus: 3, memoryLow: true
  }).length >= 1, "one-time device health signals should produce bounded insights");
  assert.equal(buildAuroraDeviceInsights({
    batteryPercent: 80, charging: true, thermalStatus: 1, memoryLow: false
  }).length, 0, "healthy device readings should not create unnecessary alerts");

  const dashboard = fs.readFileSync("src/components/PredictiveDashboard.jsx", "utf8");
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(dashboard, /Turn off & clear/);
  assert.match(dashboard, /Suggestions never perform actions/);
  assert.match(dashboard, /Connected data sources/);
  assert.match(app, /clear predictive history/);
  assert.match(app, /pause predictive intelligence/);
  assert.match(app, /resume predictive intelligence/);
  console.log("AURORA Stage 12 acceptance checks passed: consent, bounded retention, suggestion-only behaviour, routine/device insights and privacy controls.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
