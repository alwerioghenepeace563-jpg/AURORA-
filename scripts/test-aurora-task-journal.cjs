const assert = require("node:assert/strict");

(async () => {
  const { createAuroraTaskJournal } = await import("../src/core/aurora-task-journal.js");
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const journal = createAuroraTaskJournal({ storage, now: () => "2026-11-09T00:00:00.000Z" });
  const plan = {
    id: "task-private",
    title: "Review a document",
    summary: "Read and summarise",
    steps: [{ id: "read", capabilityId: "files.read", label: "Read file", risk: "medium", approvalRequired: true, input: { documentText: "PRIVATE DOCUMENT BODY" }, dependsOn: [] }]
  };
  journal.record({ type: "task.plan_created", at: "2026-11-09T00:00:00.000Z", plan });
  journal.record({ type: "task.started", taskId: plan.id, at: "2026-11-09T00:00:01.000Z" });
  journal.record({ type: "task.finished", result: {
    taskId: plan.id,
    title: plan.title,
    status: "failed",
    startedAt: "2026-11-09T00:00:01.000Z",
    finishedAt: "2026-11-09T00:00:02.000Z",
    steps: [{
      stepId: "read",
      capabilityId: "files.read",
      status: "failed",
      receipt: {
        requestId: "task-private:read",
        capabilityId: "files.read",
        status: "failed",
        at: "2026-11-09T00:00:02.000Z",
        result: { documentText: "PRIVATE DOCUMENT BODY" },
        error: { code: "READ_FAILED", message: "PRIVATE ERROR DETAILS", details: { path: "/private/document" } }
      }
    }]
  } });
  const raw = [...values.values()].join("\n");
  assert.doesNotMatch(raw, /PRIVATE DOCUMENT BODY|PRIVATE ERROR DETAILS|private\/document/);
  const item = journal.get(plan.id);
  assert.equal(item.result.status, "failed");
  assert.equal(item.result.steps[0].receipt.error.code, "READ_FAILED");
  assert.equal("result" in item.result.steps[0].receipt, false);
  assert.equal("input" in item.plan.steps[0], false);
  const recovery = journal.recoverable();
  assert.equal(recovery.length, 1);
  assert.equal(recovery[0].requiresFreshConfirmation, true);
  assert.equal(journal.forget(plan.id), true);
  assert.equal(journal.recoverable().length, 0);
  console.log("AURORA task journal tests passed: metadata-only receipts, no persisted task inputs or payloads, and fresh-confirmation recovery.");
})().catch(error => { console.error(error); process.exitCode = 1; });
