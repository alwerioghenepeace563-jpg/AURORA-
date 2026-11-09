const assert = require("node:assert/strict");

(async () => {
  const { createAuroraActionEngine } = await import("../src/core/aurora-action-engine.js");
  const { createAuroraTaskOrchestrator } = await import("../src/core/aurora-task-orchestrator.js");
  let approvals = 0;
  const executed = [];
  const engine = createAuroraActionEngine({
    createId: (() => { let n = 0; return () => "approval-" + (++n); })(),
    approve: async () => { approvals++; return { approved: true }; }
  });
  engine.registerCapability({
    id: "test.lookup",
    label: "Look up information",
    risk: "low",
    execute: async ({ query }) => { executed.push("lookup:" + query); return { found: true }; }
  });
  engine.registerCapability({
    id: "test.prepare",
    label: "Prepare a change",
    risk: "high",
    execute: async () => { executed.push("prepare"); return { prepared: true }; }
  });

  const tasks = createAuroraTaskOrchestrator(engine, { createId: () => "task-1" });
  const events = [];
  tasks.subscribe((event) => events.push(event.type));
  const plan = tasks.createPlan({
    title: "Research and prepare",
    steps: [
      { id: "lookup", capabilityId: "test.lookup", input: { query: "school timetable" } },
      { id: "prepare", capabilityId: "test.prepare", input: {}, dependsOn: ["lookup"] }
    ]
  });
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[1].approvalRequired, true);

  const preview = await tasks.runPlan(plan, { confirmed: false });
  assert.equal(preview.status, "confirmation_required");
  assert.equal(executed.length, 0);

  const result = await tasks.runPlan(plan, { confirmed: true });
  assert.equal(result.status, "completed");
  assert.equal(result.steps.length, 2);
  assert.deepEqual(executed, ["lookup:school timetable", "prepare"]);
  assert.equal(approvals, 1);
  assert.ok(events.includes("task.plan_created"));
  assert.ok(events.includes("task.step_started"));
  assert.ok(events.includes("task.finished"));
  assert.equal(await tasks.runPlan(plan, { confirmed: true }), result);

  assert.throws(() => tasks.createPlan({
    title: "Bad dependency",
    steps: [{ id: "first", capabilityId: "test.lookup", dependsOn: ["later"] }]
  }), /earlier step/i);
  assert.throws(() => tasks.createPlan({
    title: "Unknown capability",
    steps: [{ capabilityId: "not.registered" }]
  }), /unknown capability/i);

  let concurrentExecutions = 0;
  const concurrentEngine = createAuroraActionEngine();
  concurrentEngine.registerCapability({
    id: "test.concurrent",
    risk: "low",
    execute: async () => { concurrentExecutions++; await new Promise((resolve) => setTimeout(resolve, 20)); return { ok: true }; }
  });
  const concurrentTasks = createAuroraTaskOrchestrator(concurrentEngine, { createId: () => "task-concurrent" });
  const concurrentPlan = concurrentTasks.createPlan({ title: "Single execution", steps: [{ capabilityId: "test.concurrent" }] });
  const concurrentResults = await Promise.all([
    concurrentTasks.runPlan(concurrentPlan, { confirmed: true }),
    concurrentTasks.runPlan(concurrentPlan, { confirmed: true })
  ]);
  assert.equal(concurrentExecutions, 1);
  assert.equal(concurrentResults[0], concurrentResults[1]);

  const blockedEngine = createAuroraActionEngine({ approve: async () => ({ approved: false, reason: "Declined" }) });
  blockedEngine.registerCapability({ id: "test.blocked", risk: "high", execute: async () => { throw new Error("Must not run"); } });
  const blockedTasks = createAuroraTaskOrchestrator(blockedEngine, { createId: () => "task-blocked" });
  const blockedPlan = blockedTasks.createPlan({ title: "Approval test", steps: [{ capabilityId: "test.blocked" }] });
  const blocked = await blockedTasks.runPlan(blockedPlan, { confirmed: true });
  assert.equal(blocked.status, "awaiting_user");
  assert.equal(blocked.steps[0].status, "rejected");

  let started=false;
  const ce=createAuroraActionEngine();
  ce.registerCapability({id:"test.longrun",risk:"low",execute:async(_input,context)=>new Promise((_resolve,reject)=>{started=true;context.signal.addEventListener("abort",()=>reject(context.signal.reason),{once:true});})});
  const ct=createAuroraTaskOrchestrator(ce,{createId:()=>"task-cancel"});
  const cp=ct.createPlan({title:"Cancelable work",steps:[{id:"long",capabilityId:"test.longrun"},{id:"later",capabilityId:"test.longrun"}]});
  const pending=ct.runPlan(cp,{confirmed:true}); while(!started) await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(ct.cancelPlan("task-cancel"),true); const cancelled=await pending;
  assert.equal(cancelled.status,"cancelled"); assert.equal(cancelled.steps.length,1); assert.equal(ct.cancelPlan("task-cancel"),false);
  console.log("AURORA task orchestration tests passed: preview-first plans, ordered dependencies, approval gates, denial, idempotency and cooperative cancellation.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
