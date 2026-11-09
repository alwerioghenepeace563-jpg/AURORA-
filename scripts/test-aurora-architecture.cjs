const assert = require("node:assert/strict");
const { createAuroraActionEngine } = await import("../src/core/aurora-action-engine.js");

let executions = 0;
let approvals = 0;
const events = [];
const engine = createAuroraActionEngine({
  createId: (() => { let id = 0; return () => "test-" + (++id); })(),
  now: () => "2026-11-09T00:00:00.000Z",
  approve: async () => { approvals++; return { approved: true, approvalId: "approval-test" }; }
});
engine.subscribe((event) => events.push(event.type));

engine.registerCapability({
  id: "test.low_risk",
  label: "Low-risk internal action",
  risk: "low",
  execute: async ({ value }) => { executions++; return { value }; }
});
engine.registerCapability({
  id: "test.approved_action",
  label: "Approval-gated action",
  risk: "high",
  execute: async () => { executions++; return { changed: true }; }
});

const low = await engine.execute({ capabilityId: "test.low_risk", input: { value: 7 }, requestId: "low-1" });
assert.equal(low.status, "completed");
assert.equal(low.result.value, 7);
assert.equal(approvals, 0);

const gated = await engine.execute({ capabilityId: "test.approved_action", input: {}, requestId: "high-1" });
assert.equal(gated.status, "completed");
assert.equal(approvals, 1);

const duplicate = await engine.execute({ capabilityId: "test.approved_action", input: {}, requestId: "high-1" });
assert.equal(duplicate, gated);
assert.equal(executions, 2);
assert.ok(events.includes("action.approval_required"));
assert.ok(events.includes("action.completed"));

const deniedEngine = createAuroraActionEngine({ approve: async () => ({ approved: false }) });
let deniedExecutions = 0;
deniedEngine.registerCapability({ id: "test.denied_action", risk: "high", execute: async () => { deniedExecutions++; } });
const denied = await deniedEngine.execute({ capabilityId: "test.denied_action" });
assert.equal(denied.status, "rejected");
assert.equal(deniedExecutions, 0);

assert.throws(() => engine.registerCapability({ id: "bad id", execute: async () => {} }), /identifiers/i);
console.log("AURORA architecture tests passed: registry, shared events, approval gate, idempotency, and rejection safety.");
