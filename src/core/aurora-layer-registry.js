/**
 * Whole-system layer registry for AURORA's progressive implementation stages.
 * Stage completion records an architecture checkpoint, not production readiness.
 * A layer leaves the active queue only when its final acceptance criteria pass.
 */
const FAMILIES = Object.freeze([
  { id: "android_device", label: "Android and device interaction", owner: "capability-runtime/native bridge", dependsOn: ["shared-runtime", "permission-policy", "action-contracts"] },
  { id: "voice_multimodal", label: "Voice and multimodal interaction", owner: "conversation gateway/native bridge", dependsOn: ["shared-runtime", "provider-routing", "permission-policy"] },
  { id: "screen_accessibility", label: "Screen, accessibility, and notifications", owner: "native accessibility/notification services", dependsOn: ["shared-runtime", "consent-policy", "permission-policy", "data-inventory"] },
  { id: "communication_people", label: "Communication and people", owner: "capability-runtime/connectors", dependsOn: ["shared-runtime", "permission-policy", "approval-policy"] },
  { id: "location_travel", label: "Location, maps, and travel", owner: "native location/maps adapters", dependsOn: ["shared-runtime", "permission-policy", "consent-policy"] },
  { id: "calendar_productivity", label: "Calendar, tasks, and productivity", owner: "task orchestrator/workflow registry", dependsOn: ["shared-runtime", "action-contracts", "approval-policy", "task-journal"] },
  { id: "files_knowledge", label: "Files, documents, and knowledge", owner: "file adapters/knowledge graph", dependsOn: ["shared-runtime", "consent-policy", "data-inventory", "secure-storage"] },
  { id: "media_creative", label: "Media and creative tools", owner: "media adapters/provider router", dependsOn: ["shared-runtime", "provider-routing", "permission-policy"] },
  { id: "intelligence_personalisation", label: "Intelligence and personalisation", owner: "memory/specialist coordinator", dependsOn: ["shared-runtime", "secure-storage", "consent-policy", "provider-routing"] },
  { id: "extensions_interoperability", label: "Extensions and interoperability", owner: "extension registry/action engine", dependsOn: ["shared-runtime", "action-contracts", "permission-policy", "approval-policy"] },
  { id: "safety_privacy_security", label: "Safety, privacy, and security", owner: "policy/consent/secure storage", dependsOn: ["shared-runtime", "action-contracts", "data-inventory"] },
  { id: "reliability_operations", label: "Reliability and operations", owner: "event bus/journal/diagnostics", dependsOn: ["shared-runtime", "action-contracts", "task-journal", "data-inventory"] }
]);

const STAGE_TWO_LAYER_AUDIT = Object.freeze({
  android_device: Object.freeze(["shared Action Engine", "Android permission gate", "native plugin bridge", "bounded execution"]),
  voice_multimodal: Object.freeze(["shared runtime entry point", "typed speech bridge", "observable speech lifecycle", "bounded action contract"]),
  screen_accessibility: Object.freeze(["accessibility permission gate", "notification-access permission gate", "explicit approval", "local notification boundary"]),
  communication_people: Object.freeze(["Contacts permission gate", "dialler handoff", "no silent call placement", "shared approval policy"]),
  location_travel: Object.freeze(["maps search handoff", "directions handoff", "travel-mode validation", "no background location collection"]),
  calendar_productivity: Object.freeze(["calendar review-before-save handoff", "task plan confirmation", "sequential shared-engine execution", "request idempotency"]),
  files_knowledge: Object.freeze(["Android system document picker", "user-selected URI boundary", "bounded text preview", "local knowledge boundary"]),
  media_creative: Object.freeze(["system media search handoff", "user-controlled playback", "shared runtime capability registry"]),
  intelligence_personalisation: Object.freeze(["default-deny consent registry", "local-first memory", "opt-in per-record cloud sync", "shared runtime context"]),
  extensions_interoperability: Object.freeze(["metadata-only extension manifests", "capability allow-list", "shared Action Engine execution", "approval policy"]),
  safety_privacy_security: Object.freeze(["fail-closed authorization", "revocable source-scoped consent", "approval broker", "verified completion receipts"]),
  reliability_operations: Object.freeze(["request-id idempotency", "bounded execution deadlines", "cooperative cancellation signal", "execution receipts and task journal"])
});

const STAGE_TWO_CHECKPOINT = Object.freeze({
  id: 2,
  name: "Shared contracts and enforcement",
  status: "complete",
  scope: "The shared execution, authorization, approval, consent, timeout, cancellation, idempotency, and verification contracts are implemented; all 12 code-level adapter audits are recorded; the full core/architecture CI run passed on commit cfefd036e3d05e2bdd78ac74e354f47a7af6a8fc. This is not physical-device certification or final product readiness.",
  validationBoundary: "Automated code and contract tests; Android device behavior, platform-specific permissions, and end-to-end surface QA remain separate validation work.",
  deliverables: Object.freeze([
    "Capability descriptors expose validated permission, consent, timeout, idempotency, and verification contracts.",
    "Missing policy handlers fail closed when a capability declares required permissions or consent.",
    "Android contacts, accessibility, notification access, and camera permission checks run through the shared authorization gate.",
    "Consequential actions retain the shared approval broker.",
    "Timeouts and cancellation are observable through bounded execution receipts and cooperative AbortSignal propagation.",
    "Repeated request IDs reuse the in-flight operation or completed receipt instead of executing twice.",
    "The shared runtime delegates consent checks to the default-deny, revocable consent registry.",
    "All 12 capability families have explicit Stage 2 contract-audit evidence and remain active for later stages."
  ])
});

const STAGE_THREE_LAYER_AUDIT = Object.freeze({
  android_device: Object.freeze(["Android-only Keystore vault boundary", "secure-store availability gate", "no browser fallback", "backup and migration device test pending"]),
  voice_multimodal: Object.freeze(["shared runtime protected-memory service", "no raw vault contents in inventory", "platform-unavailable reporting"]),
  screen_accessibility: Object.freeze(["notification and accessibility data remain separately scoped", "local persistence uses fail-closed readers", "no implicit screen-data migration"]),
  communication_people: Object.freeze(["contacts remain outside memory sync unless explicitly saved", "consent registry is source-scoped", "no bulk contact upload path"]),
  location_travel: Object.freeze(["location context is not auto-indexed", "consent remains default-deny", "no background location persistence introduced"]),
  calendar_productivity: Object.freeze(["task journal, workflow and routine stores fail closed", "routine reminders remain approval-only", "recovery requires fresh confirmation"]),
  files_knowledge: Object.freeze(["knowledge graph schema validation", "corrupt data preserved", "document contents not auto-migrated"]),
  media_creative: Object.freeze(["media data not auto-collected into memory", "shared storage guard available", "no cloud media upload path introduced"]),
  intelligence_personalisation: Object.freeze(["protected-memory vault contract", "local-first ordinary memory", "per-record sync rechecks revocable consent"]),
  extensions_interoperability: Object.freeze(["extension manifests use fail-closed schema reader", "manifest capability allow-list validated", "arbitrary code remains disabled"]),
  safety_privacy_security: Object.freeze(["malformed persisted consent fails closed", "protected record schema validation", "privacy inventory excludes record contents"]),
  reliability_operations: Object.freeze(["six local stores fail closed on corruption", "extension and protected vault corruption tests", "sync revocation disables further uploads"])
});

const STAGE_FOUR_LAYER_AUDIT = Object.freeze({
 android_device:Object.freeze(["lifecycle events observed","device actions cancel cooperatively","no automatic replay"]),
 voice_multimodal:Object.freeze(["shared lifecycle events","interrupted voice tasks review-only"]),
 screen_accessibility:Object.freeze(["accessibility lifecycle observable","diagnostics exclude screen contents"]),
 communication_people:Object.freeze(["communication cancellation propagated","fresh confirmation for recovery"]),
 location_travel:Object.freeze(["route interruption observable","no background route replay"]),
 calendar_productivity:Object.freeze(["task cancellation journaled","recovery requires fresh confirmation"]),
 files_knowledge:Object.freeze(["file failures observable without document contents","recovery uses task summaries"]),
 media_creative:Object.freeze(["media cancellation propagated","diagnostics exclude media payloads"]),
 intelligence_personalisation:Object.freeze(["shared reliability service","bounded metadata-only diagnostics"]),
 extensions_interoperability:Object.freeze(["extension cancellation signal","extension failures isolated"]),
 safety_privacy_security:Object.freeze(["recovery preserves approval gates","no automatic consequential retry"]),
 reliability_operations:Object.freeze(["unified lifecycle/connectivity","bounded failure diagnostics","metadata-only execution receipts","review-only recovery"])
});
const STAGE_FOUR_CHECKPOINT = Object.freeze({
 id:4,name:"Reliability and recovery",status:"complete",
 scope:"Stage 4 reliability and recovery implementation and automated code-level verification are complete across all 12 active capability families. The latest feature-branch CI run 42591318770 passed dependency installation, blocking dependency audit, core/architecture tests, and web production build. APK compilation and physical-device validation remain deferred to release preparation; they are not Stage 4 blockers.",
 validationBoundary:"Verified code-level implementation and automated CI on commit 5c646116d4341b4ff62c30a34183bc02dcbd717c (run 42591318770). Physical Android lifecycle/interruption checks and APK compilation remain deferred, unverified release-preparation gates.",
 deliverables:Object.freeze(["Unify visibility, foreground/background, online/offline, pagehide and pageshow events.","Capture bounded metadata-only failure diagnostics; never copy sensitive payloads.","Propagate task cancellation to active Action Engine work and stop later steps.","Persist bounded execution receipt metadata without task inputs, action outputs, or sensitive error details.", "Keep failed/interrupted tasks review-only; never replay automatically.","Require fresh confirmation and normal policy gates before resumed work.","Audit all 12 active capability families."])
});

const STAGE_THREE_DEFERRED_RELEASE_VALIDATION = Object.freeze({
  status: "deferred",
  reason: "The user has chosen to complete the full app before physical-device release validation. These checks do not block progression to Stage 4, but must pass before release sign-off.",
  checks: Object.freeze([
    "Verify Android Keystore AES-GCM key creation, availability, invalidation, and protected-memory read/write on supported physical Android devices.",
    "Verify protected-memory files and key material are excluded from Android backup as intended.",
    "Verify restore and app-upgrade behavior without silently resetting, exposing, or migrating protected records.",
    "Verify device migration behavior and document the expected protected-memory portability boundary.",
    "Run end-to-end privacy and recovery UX checks on supported Android versions and lower-memory devices."
  ])
});

const STAGE_THREE_CHECKPOINT = Object.freeze({
  id: 3,
  name: "Secure state and context",
  status: "complete",
  scope: "Stage 3 code-level secure-state and context hardening, including Android encrypted protected memory, is implemented and the full CI pipeline passed on commit 68b9b6df623503209276751fecd78872f82be3b0 (run 42583043179). Shared fail-closed JSON/schema validation protects memory, consent, knowledge graph, task journal, workflow, routine, and extension stores. Browser localStorage remains explicitly unencrypted; no automatic migration or bulk upload is permitted.",
  validationBoundary: "All 12 family code audits and automated core/architecture tests passed, including dependency installation and web build. Physical-device validation of Android Keystore behavior, backup exclusion, restore/upgrade, device migration, and end-to-end privacy UX is explicitly deferred to release hardening, not blockers for Stage 4. They remain unverified and must pass before release sign-off.",
  deliverables: Object.freeze([
    "Add an Android-only protected-memory vault backed by the existing Keystore AES-GCM secure-store facade; refuse operation when unavailable and never fall back to browser storage.",
    "Bound protected records, validate identifiers and content, isolate record keys, and fail safely on corrupt indexes or records.",
    "Expose protected memory through the shared AURORA runtime so Main, Pulse, and voice can use the same service.",
    "Report protected-memory storage location and encryption availability in the privacy inventory without exposing record contents.",
    "Keep ordinary local-first memory separate from protected memory; do not silently migrate existing records or enable cloud sync.",
    "Use a shared fail-closed persistence reader across memory, consent, knowledge graph, task journal, workflow, routine, and extension stores; malformed data is preserved and reported rather than silently reset.",
    "Validate protected-memory index entries and decrypted record schemas; reject malformed records without filtering or overwriting them.",
    "Re-check source-scoped cloud-sync consent before every selected-record upload and disable sync immediately when consent is revoked.",
    "Record Stage 3 code-level evidence for all 12 capability families while keeping Android device certification explicitly pending.",
    "Add regression tests proving corrupt JSON and invalid schemas do not overwrite existing local records.",
    "Keep all 12 capability families active while remaining Stage 3 storage, consent, and context boundaries are audited.",
    "Pass the full CI pipeline: dependency installation, AURORA core and architecture tests, and web build (run 42583043179)."
  ]),
  deferredReleaseValidation: STAGE_THREE_DEFERRED_RELEASE_VALIDATION
});

const STAGE_FIVE_LAYER_AUDIT = Object.freeze({
  android_device: Object.freeze(["Android app launch and device status adapters", "flashlight control behind camera permission", "Pulse overlay native show/hide/status bridge", "one-shot location read with explicit freshness metadata"]),
  voice_multimodal: Object.freeze(["native speech recognition start/stop", "native speech synthesis start/stop", "shared speech lifecycle events", "foreground assistant service approval gate"]),
  screen_accessibility: Object.freeze(["accessibility-gated screen text read", "notification-access-gated local preview read/search/clear", "fresh approval for sensitive reads"]),
  communication_people: Object.freeze(["Contacts permission-gated search", "approval-gated SMS composer handoff", "approval-gated dialler and system share handoffs"]),
  location_travel: Object.freeze(["one-shot location permission and current-location adapter", "timestamp, age, freshness, accuracy and precision metadata", "map place search and validated travel-mode directions", "no background location collection"]),
  calendar_productivity: Object.freeze(["calendar permission-gated local event search", "review-before-save event editor", "shared task planner/orchestrator and review-only recovery"]),
  files_knowledge: Object.freeze(["user-initiated system document picker", "bounded plain-text preview", "approval-gated in-memory selected-text search", "no implicit document persistence"]),
  media_creative: Object.freeze(["system media search handoff", "user-controlled playback", "no automatic media collection or upload"]),
  intelligence_personalisation: Object.freeze(["shared runtime memory and specialist coordinator", "source-scoped consent and protected-memory boundaries", "shared universal search and capability intelligence"]),
  extensions_interoperability: Object.freeze(["metadata-only extension registry", "capability allow-list", "all extension actions routed through shared Action Engine"]),
  safety_privacy_security: Object.freeze(["shared permission, consent and approval enforcement", "sensitive location, screen, calendar and notification reads require approval", "no background location tracking"]),
  reliability_operations: Object.freeze(["bounded Action Engine execution receipts", "lifecycle and cancellation/recovery coordination", "native Pulse overlay lifecycle regression coverage"])
});
const STAGE_FIVE_CHECKPOINT = Object.freeze({
  id: 5,
  name: "Capability adapter expansion",
  status: "complete",
  completedAt: "2026-11-09",
  scope: "All 12 capability families have coordinated code-level adapters/audit evidence, shared Action Engine contracts, explicit permission/consent/approval gates, native bridge contracts, and passing automated core/architecture regression checks. Stage 5 closes at the capability-adapter layer; multi-surface UX wiring and physical-device validation are explicitly Stage 6 deliverables.",
  validationBoundary: "GitHub Actions core/architecture tests and web production build passed for commit a42da3eb4f889ac1dc4e335fe5faae292bcf648b. No APK build, physical Android test, or release certification is claimed.",
  deliverables: Object.freeze([
    "Provide permission-gated one-shot location reads with explicit freshness metadata and no background collection.",
    "Keep maps search and directions in the shared Action Engine with validated travel modes.",
    "Maintain all 12 capability families as one coordinated capability catalogue with audit evidence.",
    "Require explicit approval and source-scoped consent for sensitive location reads.",
    "Pass the full core/architecture test chain, Stage 5 capability regression suite, and web production build."
  ])
});

const STAGE_ONE_CHECKPOINT = Object.freeze({
  id: 1,
  name: "Whole-system baseline",
  status: "complete",
  scope: "Architecture mapping only; no claim of production readiness.",
  completedAt: "2026-11-09",
  deliverables: Object.freeze([
    "All 12 capability families have stable IDs and accountable owners.",
    "Cross-family dependencies are explicit.",
    "Shared runtime, action contracts, permissions, approvals, consent, storage, and recovery are identified as cross-cutting foundations.",
    "Existing code is distinguished from planned or partially implemented adapters.",
    "App identity, signing identity, existing features, and user data boundaries are protected."
  ])
});

function createAuroraLayerRegistry() {
  const families = FAMILIES.map((item) => Object.freeze({
    ...item,
    dependsOn: Object.freeze([...item.dependsOn]),
    checkpoint: "stage-1-mapped",
    stageTwoStatus: "contract-audited",
    adapterContractAudit: "passed",
    stageTwoEvidence: [...(STAGE_TWO_LAYER_AUDIT[item.id] || [])],
    stageThreeEvidence: [...(STAGE_THREE_LAYER_AUDIT[item.id] || [])],
    stageFiveEvidence: [...(STAGE_FIVE_LAYER_AUDIT[item.id] || [])],
    implementationStatus: "contract-audited",
    finalStatus: "active"
  }));
  return Object.freeze({
    stages: Object.freeze([STAGE_ONE_CHECKPOINT, STAGE_TWO_CHECKPOINT, STAGE_THREE_CHECKPOINT, STAGE_FOUR_CHECKPOINT, STAGE_FIVE_CHECKPOINT]),
    stageTwoAudit: STAGE_TWO_LAYER_AUDIT,
    stageThreeAudit: STAGE_THREE_LAYER_AUDIT,
    stageFourAudit: STAGE_FOUR_LAYER_AUDIT,
    stageFiveAudit: STAGE_FIVE_LAYER_AUDIT,
    stageThreeDeferredReleaseValidation: STAGE_THREE_DEFERRED_RELEASE_VALIDATION,
    list: () => families.map((item) => ({ ...item, dependsOn: [...item.dependsOn] })),
    get: (id) => {
      const item = families.find((family) => family.id === id);
      return item ? { ...item, dependsOn: [...item.dependsOn] } : null;
    },
    summary: () => Object.freeze({
      totalLayers: families.length,
      stageOneMapped: families.filter((item) => item.checkpoint === "stage-1-mapped").length,
      finalLayers: families.filter((item) => item.finalStatus === "complete").length,
      activeLayers: families.filter((item) => item.finalStatus !== "complete").length,
      nextStage: 6,
      stageFiveStatus: STAGE_FIVE_CHECKPOINT.status,
      stageFiveCodeComplete: STAGE_FIVE_CHECKPOINT.status === "complete",
      stageFiveAuditedLayers: families.filter((item) => (STAGE_FIVE_LAYER_AUDIT[item.id] || []).length >= 2).length,
      stageFourStatus: STAGE_FOUR_CHECKPOINT.status,
      stageOneStatus: STAGE_ONE_CHECKPOINT.status,
      stageTwoStatus: STAGE_TWO_CHECKPOINT.status,
      stageThreeStatus: STAGE_THREE_CHECKPOINT.status,
      stageTwoContractReady: families.filter((item) => item.adapterContractAudit === "passed").length
    })
  });
}

const auroraLayerRegistry = createAuroraLayerRegistry();

export { FAMILIES as AURORA_LAYER_FAMILIES, STAGE_ONE_CHECKPOINT, STAGE_TWO_CHECKPOINT, STAGE_THREE_CHECKPOINT, STAGE_THREE_LAYER_AUDIT, STAGE_THREE_DEFERRED_RELEASE_VALIDATION, STAGE_FOUR_LAYER_AUDIT, STAGE_FOUR_CHECKPOINT, STAGE_FIVE_LAYER_AUDIT, STAGE_FIVE_CHECKPOINT, createAuroraLayerRegistry, auroraLayerRegistry };
