const assert = require("node:assert/strict");

(async () => {
  const { createAuroraLayerRegistry, STAGE_ONE_CHECKPOINT, STAGE_TWO_CHECKPOINT, STAGE_THREE_CHECKPOINT, STAGE_THREE_DEFERRED_RELEASE_VALIDATION, STAGE_FOUR_CHECKPOINT, STAGE_FOUR_LAYER_AUDIT } = await import("../src/core/aurora-layer-registry.js");
  const registry = createAuroraLayerRegistry();
  const layers = registry.list();
  const summary = registry.summary();

  assert.equal(layers.length, 12, "Every capability family must be represented in the whole-system baseline.");
  assert.equal(new Set(layers.map((layer) => layer.id)).size, 12, "Layer IDs must be unique.");
  assert.equal(summary.totalLayers, 12);
  assert.equal(summary.stageOneMapped, 12, "Stage one must map every layer before stage two begins.");
  assert.equal(summary.activeLayers, 12, "Mapped layers remain active until their final acceptance criteria pass.");
  assert.equal(summary.finalLayers, 0, "An architecture map must never be mistaken for final implementation.");
  assert.equal(summary.nextStage, 4);
  assert.equal(summary.stageTwoStatus, "complete");
  assert.equal(summary.stageThreeStatus, "complete");
  assert.equal(summary.stageFourStatus, "in_progress");
  assert.equal(STAGE_FOUR_CHECKPOINT.status, "in_progress");
  assert.equal(Object.keys(STAGE_FOUR_LAYER_AUDIT).length, 12);
  assert.ok(registry.stages.some(stage => stage.id === 4));
  assert.equal(summary.stageTwoContractReady, 12);
  assert.equal(STAGE_TWO_CHECKPOINT.status, "complete");
  assert.equal(STAGE_THREE_CHECKPOINT.status, "complete");
  assert.equal(STAGE_THREE_DEFERRED_RELEASE_VALIDATION.status, "deferred");
  assert.ok(STAGE_THREE_DEFERRED_RELEASE_VALIDATION.checks.length >= 4);
  assert.match(STAGE_THREE_CHECKPOINT.validationBoundary, /not blockers for Stage 4/i);
  assert.match(STAGE_THREE_CHECKPOINT.validationBoundary, /unverified/i);
  assert.equal(Object.keys(registry.stageThreeAudit).length, 12);
  assert.match(STAGE_THREE_CHECKPOINT.validationBoundary, /physical-device validation/i);
  assert.match(STAGE_THREE_CHECKPOINT.scope, /encrypted protected memory/i);
  assert.match(STAGE_TWO_CHECKPOINT.validationBoundary, /not.*device|device.*separate/i);
  assert.ok(registry.stages.some((stage) => stage.id === 2));
  assert.ok(registry.stages.some((stage) => stage.id === 3));
  assert.equal(STAGE_ONE_CHECKPOINT.status, "complete");
  assert.match(STAGE_ONE_CHECKPOINT.scope, /Architecture mapping only/i);

  for (const layer of layers) {
    assert.ok(layer.label && layer.owner, "Every layer needs a clear label and accountable owner.");
    assert.ok(Array.isArray(layer.dependsOn) && layer.dependsOn.length > 0, "Every layer must declare cross-system dependencies.");
    assert.equal(layer.checkpoint, "stage-1-mapped");
    assert.equal(layer.implementationStatus, "contract-audited");
    assert.equal(layer.finalStatus, "active");
    assert.equal(layer.stageTwoStatus, "contract-audited");
    assert.equal(layer.adapterContractAudit, "passed");
    assert.ok(Array.isArray(layer.stageTwoEvidence) && layer.stageTwoEvidence.length >= 3, "Every family needs concrete Stage 2 contract evidence.");
    assert.ok(Array.isArray(layer.stageThreeEvidence) && layer.stageThreeEvidence.length >= 2, "Every family needs Stage 3 storage/context audit evidence.");
  }
  assert.equal(registry.get("unknown-layer"), null);
  assert.ok(Object.isFrozen(STAGE_ONE_CHECKPOINT));
  assert.ok(Object.isFrozen(STAGE_TWO_CHECKPOINT));
  assert.ok(Object.isFrozen(STAGE_THREE_DEFERRED_RELEASE_VALIDATION));
  console.log("AURORA layer registry tests passed: all 12 layers mapped, dependencies owned, and final completion kept distinct from stage checkpoints.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
