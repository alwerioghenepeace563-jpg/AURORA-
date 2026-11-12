const assert = require("node:assert/strict");
(async () => {
  const corrupt = "{not-json";
  const makeStorage = () => {
    const values = new Map();
    return { values, getItem: key => values.has(key) ? values.get(key) : null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) };
  };
  const cases = [
    ["memory", "../src/core/aurora-memory.js", "createAuroraMemory", "aurora-memory-v1", service => service.list()],
    ["consent", "../src/core/aurora-consent-registry.js", "createAuroraConsentRegistry", "aurora-consents-v1", service => service.list()],
    ["knowledge graph", "../src/core/aurora-knowledge-graph.js", "createAuroraKnowledgeGraph", "aurora-knowledge-graph-v1", service => service.list()],
    ["task journal", "../src/core/aurora-task-journal.js", "createAuroraTaskJournal", "aurora-task-journal-v1", service => service.list()],
    ["workflow registry", "../src/core/aurora-workflow-registry.js", "createAuroraWorkflowRegistry", "aurora-workflows-v1", service => service.list()],
    ["routine scheduler", "../src/core/aurora-routine-scheduler.js", "createAuroraRoutineScheduler", "aurora-scheduled-routines-v1", service => service.list()]
  ];
  for (const [label, modulePath, factory, key, inspect] of cases) {
    const storage = makeStorage();
    storage.setItem(key, corrupt);
    const module = await import(modulePath);
    const service = module[factory]({ storage, reminder: { schedule: async()=>{}, cancel: async()=>{} }, workflows: { get:()=>({id:"wf",title:"Workflow"}) } });
    assert.throws(() => inspect(service), /corrupt|invalid structure/i, label + " must fail closed on corrupt storage");
    assert.equal(storage.getItem(key), corrupt, label + " must preserve the original bytes rather than overwrite them");
  }
  const { readStoredJson } = await import("../src/core/aurora-storage-guard.js");
  const storage = makeStorage();
  storage.setItem("shape", JSON.stringify({ unexpected: true }));
  assert.throws(() => readStoredJson(storage, "shape", [], Array.isArray, "test store"), /invalid structure/i);
  assert.deepEqual(readStoredJson(storage, "missing", [], Array.isArray), []);
  console.log("AURORA persistence guard tests passed: corrupt JSON and invalid schemas fail closed across six local stores without overwriting original data.");
})().catch(error => { console.error(error); process.exitCode = 1; });
