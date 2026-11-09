const assert = require("node:assert/strict");
(async () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) || null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) };
  const { createAuroraEventBus } = await import("../src/core/aurora-event-bus.js");
  const { createAuroraKnowledgeGraph } = await import("../src/core/aurora-knowledge-graph.js");
  const { createAuroraSpecialistCoordinator } = await import("../src/core/aurora-specialist-coordinator.js");
  const { createAuroraWorkflowRegistry } = await import("../src/core/aurora-workflow-registry.js");

  const bus = createAuroraEventBus({ maxHistory: 10, now: () => "2026-11-09T00:00:00Z" });
  let received = 0;
  const off = bus.subscribe("task.*", () => received++);
  bus.publish("task.started", { id: "t1" });
  bus.publish("memory.saved", { id: "m1" });
  assert.equal(received, 1);
  assert.equal(bus.recent().length, 2);
  off();
  assert.equal(bus.listenerCount(), 0);

  let id = 0;
  const graph = createAuroraKnowledgeGraph({ storage, createId: () => "node-" + (++id) });
  const project = graph.addNode({ label: "AURORA", type: "project", description: "Personal assistant architecture", tags: ["assistant"] });
  const feature = graph.addNode({ label: "Knowledge Graph", type: "feature" });
  graph.relate({ from: project.id, to: feature.id, relation: "includes" });
  assert.equal(graph.search("assistant architecture")[0].id, project.id);
  assert.equal(graph.neighborhood(project.id).related[0].id, feature.id);
  assert.equal(graph.status().edgeCount, 1);
  assert.equal(graph.removeNode(feature.id), true);
  assert.equal(graph.status().edgeCount, 0);

  const coordinator = createAuroraSpecialistCoordinator({ maxParallel: 2 });
  coordinator.register({ id: "weather_specialist", label: "Weather", matches: text => /weather/i.test(text), run: async () => ({ forecast: "sunny" }) });
  assert.deepEqual(coordinator.select("weather please").map(x => x.id), ["weather_specialist"]);
  const coordinated = await coordinator.coordinate("weather please");
  assert.equal(coordinated.status, "completed");
  assert.equal(coordinated.results[0].result.forecast, "sunny");

  const workflows = createAuroraWorkflowRegistry({ storage, createId: () => "wf-1" });
  const capabilities = [{ id: "device.get_status" }, { id: "android.open_app" }];
  const workflow = workflows.save({ title: "Morning setup", steps: [
    { id: "status", capabilityId: "device.get_status" },
    { id: "open", capabilityId: "android.open_app", input: { packageName: "com.android.settings" }, dependsOn: ["status"] }
  ] }, capabilities);
  assert.equal(workflow.id, "wf-1");
  const calls = [];
  const orchestrator = { createPlan: input => { calls.push(input); return { id: "prepared-plan" }; } };
  assert.equal(workflows.instantiate("wf-1", capabilities, orchestrator).id, "prepared-plan");
  assert.equal(calls[0].steps.length, 2);
  assert.throws(() => workflows.save({ title: "Bad", steps: [{ id: "x", capabilityId: "unknown" }] }, capabilities), /unavailable/);
  assert.equal(workflows.remove("wf-1"), true);
  console.log("AURORA ecosystem tests passed: event bus, local knowledge graph, specialist coordination and approval-ready reusable workflows.");
})().catch(error => { console.error(error); process.exitCode = 1; });
