const assert = require("node:assert/strict");
(async () => {
  const registry = await import("../src/core/aurora-layer-registry.js");
  const summary = registry.auroraLayerRegistry.summary();
  const audit = registry.auroraLayerRegistry.stageSevenAudit;
  assert.equal(summary.totalLayers, 14);
  assert.equal(summary.stageSevenStatus, "complete");
  assert.equal(summary.stageSevenCodeComplete, true);
  assert.equal(summary.stageSevenAuditedLayers, 12);
  assert.equal(summary.nextStage, 12);
  assert.equal(Object.keys(audit).length, 12);
  for (const layer of registry.auroraLayerRegistry.list()) {
    assert.ok(layer.stageSevenEvidence.length >= 3, "Missing Stage 7 evidence for " + layer.id);
  }
  const stage7 = registry.auroraLayerRegistry.stages.find((stage) => stage.id === 7);
  assert.equal(stage7.status, "complete");
  assert.equal(registry.auroraLayerRegistry.stageSevenDeferredDeviceValidation.status, "deferred");
  assert.match(stage7.validationBoundary, /Physical Android behavior/);
  console.log("AURORA Stage 7 checkpoint passed: all 14 layers registered; Stage 7 audit remains scoped to its original 12 capability families; device certification remains deferred.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
