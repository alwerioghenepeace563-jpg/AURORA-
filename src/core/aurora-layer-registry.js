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

const STAGE_SIX_LAYER_AUDIT = Object.freeze({
  android_device: Object.freeze(["shared surface gateway for Main, Pulse and voice", "Capacitor foreground/background lifecycle bridge", "adaptive network and memory environment monitor", "no automatic replay after interruption"]),
  voice_multimodal: Object.freeze(["shared voice surface routing", "microphone session interruption on background/hidden state", "spoken output cancellation and stale-response discard", "voice preference cancellation"]),
  screen_accessibility: Object.freeze(["Pulse focus management and keyboard trap", "Escape close and focus restoration", "screen-reader live announcements and orb state", "reduced-motion support"]),
  communication_people: Object.freeze(["shared approval lifecycle across surfaces", "sensitive proposal data excluded from global events", "interrupted communication actions require fresh confirmation"]),
  location_travel: Object.freeze(["shared surface routing and approval lifecycle", "offline and degraded-network state observable", "no automatic route/action replay"]),
  calendar_productivity: Object.freeze(["review-only task recovery on app resume", "interrupted steps marked unverified", "fresh confirmation before any new execution"]),
  files_knowledge: Object.freeze(["metadata-only surface and lifecycle events", "document contents excluded from interruption diagnostics", "offline state observable without content collection"]),
  media_creative: Object.freeze(["spoken/media session interruption coordination", "delayed playback discarded after backgrounding", "adaptive environment state available to surfaces"]),
  intelligence_personalisation: Object.freeze(["shared runtime environment monitor", "same gateway for Main, Pulse and voice", "conservative adaptive mode is advisory only"]),
  extensions_interoperability: Object.freeze(["shared surface gateway and Action Engine path", "approval lifecycle bridged without proposal payloads", "no background extension replay"]),
  safety_privacy_security: Object.freeze(["metadata-only lifecycle and approval events", "microphone and spoken output stop on interruption", "no permission changes or action replay by environment monitor"]),
  reliability_operations: Object.freeze(["native foreground/background lifecycle integration", "cooperative interruption and cancellation", "adaptive offline/network/memory monitoring", "listener cleanup and bounded recovery metadata"])
});
const STAGE_SIX_DEFERRED_DEVICE_VALIDATION = Object.freeze({
  status: "deferred",
  reason: "Stage 6 source integration, automated regression coverage, dependency audit, and web build are complete. Physical Android validation is deferred to the later device-certification/release gate; APK and signing remain excluded by the user's current scope.",
  checks: Object.freeze([
    "Verify native voice service, microphone interruption, and resume behavior on supported Android devices.",
    "Verify Pulse overlay lifecycle, TalkBack announcements, keyboard focus, and reduced-motion behavior on device.",
    "Verify offline/online, data-saver, battery API availability, and memory-pressure transitions on a low-memory Android device.",
    "Verify all native listeners are released after Pulse close, app backgrounding, and component teardown."
  ])
});
const STAGE_SIX_CHECKPOINT = Object.freeze({
  id: 6,
  name: "Surface integration and device validation",
  status: "complete",
  completedAt: "2026-11-09",
  scope: "Stage 6 code-level integration is complete across all 12 active capability families. Main Chat, Pulse and voice share the surface gateway and approval lifecycle; Android lifecycle, interruption cancellation, Pulse accessibility, and adaptive environment monitoring are integrated and covered by the complete automated core/architecture suite and web production build.",
  validationBoundary: "GitHub Actions run 42603081673 passed dependency installation, the blocking dependency audit, the complete core/architecture test chain, and web production build on commit 5216c175f2e36389946db721d6dbb5dd7d9485e8. Physical Android/TalkBack/low-memory validation remains explicitly deferred and unverified; this is a code-and-CI checkpoint, not device certification or release readiness.",
  deliverables: Object.freeze([
    "Route Main Chat, Pulse, and voice through one shared surface gateway and capability runtime.",
    "Bridge approval-created/approved/rejected lifecycle events without publishing sensitive proposal data.",
    "Observe native foreground/background lifecycle and preserve review-only recovery; never replay interrupted actions.",
    "Cancel active microphone and spoken-output sessions on interruption and discard stale delayed voice responses.",
    "Provide Pulse focus management, keyboard controls, screen-reader announcements, and reduced-motion support.",
    "Expose online/offline, coarse network, data-saver, memory-class, supported battery, and memory-pressure state through one shared advisory monitor.",
    "Add all Stage 6 regressions to the core test chain and pass the full GitHub Actions core/architecture and web-build gate.",
    "Keep physical Android device certification as a separate deferred release gate."
  ]),
  deferredDeviceValidation: STAGE_SIX_DEFERRED_DEVICE_VALIDATION
});

const STAGE_SEVEN_LAYER_AUDIT = Object.freeze({
  android_device: Object.freeze(["explicit user-started microphone foreground service", "persistent notification with an immediate Stop action", "no sticky service restart after process death", "native app launch and one-shot device handoffs"]),
  voice_multimodal: Object.freeze(["Hey AURORA phrase detection through Android speech recognition", "shared Main/Pulse/voice gateway and runtime", "foreground/background interruption and spoken-output cancellation", "visible permission and listening state"]),
  screen_accessibility: Object.freeze(["user-invoked one-shot screen context sessions", "foreground-only external-window capture with no background text caching", "bounded review-before-send screen text", "Pulse keyboard, focus, live-region and reduced-motion safeguards"]),
  communication_people: Object.freeze(["safe installed-app launch and system handoffs", "SMS/share/dialler actions retain approval and user confirmation", "contacts access remains permission-gated and bounded"]),
  location_travel: Object.freeze(["one-shot permission-gated current-location adapter", "timestamp, age, accuracy and freshness disclosure", "map search and validated directions handoffs", "no always-on location tracking"]),
  calendar_productivity: Object.freeze(["shared task planner and orchestrator", "user-controlled reminder and routine scheduling", "calendar reads remain permission/approval-gated", "interrupted tasks require fresh confirmation"]),
  files_knowledge: Object.freeze(["user-selected document picker", "short-lived one-shot bounded document context", "surface-scoped delivery with metadata-only events", "no silent file upload or automatic persistence"]),
  media_creative: Object.freeze(["user-controlled media search and handoff", "bounded context-session source contract", "no automatic media collection or upload"]),
  intelligence_personalisation: Object.freeze(["shared memory and knowledge services across assistant surfaces", "universal search and capability intelligence", "source-scoped opt-in memory sync and protected-memory boundaries"]),
  extensions_interoperability: Object.freeze(["extension manifests remain declarative and metadata-only", "extension actions route through the shared Action Engine", "shared permission, consent and approval policy"]),
  safety_privacy_security: Object.freeze(["explicit microphone and notification permission before wake listening", "foreground notification exposes active microphone state and Stop control", "screen/document context is opt-in, bounded and one-shot", "consequential actions retain approval and cancellation"]),
  reliability_operations: Object.freeze(["wake listener stops on explicit Stop or after wake detection", "no sticky auto-restart and stale listening state is cleared", "shared interruption coordinator and review-only recovery", "focused and cross-layer regressions run in core CI"])
});
const STAGE_SEVEN_DEFERRED_DEVICE_VALIDATION = Object.freeze({
  status: "deferred",
  reason: "Stage 7 code and automated CI checkpoint is complete. The current workflow does not build APKs or certify physical-device behavior; those checks remain a separate device/release gate.",
  checks: Object.freeze([
    "Verify Hey AURORA phrase detection, microphone indicator, notification Stop action, and background/foreground lifecycle on the target Android devices.",
    "Verify Android speech-recognition provider behavior, network use, battery impact, and language/accent recognition; this is not a low-power DSP hotword engine.",
    "Verify Read Screen foreground boundaries, TalkBack, document picker, and selected-context handoff on device.",
    "Verify location freshness, app handoffs, notification permissions, and listener cleanup on supported Android versions."
  ])
});
const STAGE_SEVEN_CHECKPOINT = Object.freeze({
  id: 7,
  name: "Native assistant activation and contextual intelligence",
  status: "complete",
  completedAt: "2026-11-09",
  scope: "All 12 capability families have coordinated Stage 7 code-level integration and automated regression coverage. The native assistant listener is explicit opt-in, foreground-notified, stoppable from its notification, and does not auto-restart after process death. Screen and document context are bounded, one-shot, user-initiated, and surface-scoped. Existing location, app handoff, task, memory, media, permission, approval, cancellation and recovery services remain on the shared runtime.",
  validationBoundary: "This is a code-and-CI checkpoint only. Physical Android behavior, speech-recognition provider privacy/battery characteristics, TalkBack, and low-memory/device-specific behavior remain unverified until tested on real devices. APK compilation, signing, keystore changes, and deployment remain deferred.",
  deliverables: Object.freeze([
    "Coordinate Stage 7 improvements and regression evidence across all 12 active capability families.",
    "Provide explicit user-started wake-phrase listening with microphone and notification permission gates, visible persistent status, notification Stop control, and no sticky auto-restart.",
    "Keep screen and selected-document context user-invoked, bounded, one-shot, surface-scoped, and excluded from global content events.",
    "Preserve shared Main Chat, Pulse and voice routing, memory, task planning, location, app handoffs, and Action Engine safety policy.",
    "Pass focused Stage 7 tests, the complete core/architecture CI suite, dependency audit, and web production build.",
    "Keep physical Android certification as a separate deferred release gate; do not build APKs or change signing material in this stage."
  ]),
  deferredDeviceValidation: STAGE_SEVEN_DEFERRED_DEVICE_VALIDATION
});

const STAGE_EIGHT_LAYER_AUDIT = Object.freeze({
  android_device: Object.freeze(["read-only workflow inspection checks live Android capability availability", "task status and recovery review exposed through the shared runtime", "recent task history and local record deletion are user-accessible", "device handoffs remain sequenced and approval-gated", "no task recovery replays device actions automatically", "active coordinated tasks can receive an explicit cancellation request", "failed-step retry is previewed only when idempotency is proven and requires fresh user confirmation", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
  voice_multimodal: Object.freeze(["workflow inspection returns ordered step labels for voice review", "task activity can be queried through the shared assistant runtime", "recent task history and forget controls are shared across surfaces", "task and workflow previews remain surface-independent", "active coordinated tasks can receive an explicit cancellation request", "voice confirmation is required before a prepared plan executes", "failed-step retry is previewed only when idempotency is proven and requires fresh user confirmation", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
  screen_accessibility: Object.freeze(["workflow inspection is metadata-only and performs no screen capture", "review commands expose task metadata without capturing screen content", "task history deletion does not imply undoing external actions", "selected screen context remains opt-in and scoped to the requesting task", "recovery views do not replay accessibility reads", "active coordinated tasks can receive an explicit cancellation request", "failed-step retry is previewed only when idempotency is proven and requires fresh user confirmation", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
  communication_people: Object.freeze(["workflow inspection surfaces communication steps for review before preparation", "workflow inventory exposes only saved workflow metadata", "task history can be removed without affecting sent communications", "message, call and share steps retain native approval gates", "workflow removal never sends or repeats communication actions", "active coordinated tasks can receive an explicit cancellation request", "failed-step retry is previewed only when idempotency is proven and requires fresh user confirmation", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
  location_travel: Object.freeze(["workflow inspection does not request or refresh device location", "task status reports map handoff state without refreshing location", "task journal removal does not alter external map or travel actions", "location and directions actions remain fresh-request and permission gated", "recovery requires a newly reviewed plan", "active coordinated tasks can receive an explicit cancellation request", "failed-step retry is previewed only when idempotency is proven and requires fresh user confirmation", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
  calendar_productivity: Object.freeze(["workflow inspection displays ordered productivity steps without scheduling or execution", "saved workflows can be listed and removed by exact title", "recent tasks can be inspected and forgotten locally", "task status and event history are available across assistant surfaces", "scheduled routines remain reminders rather than unattended workflow execution", "active coordinated tasks can receive an explicit cancellation request", "failed-step retry is previewed only when idempotency is proven and requires fresh user confirmation", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
  files_knowledge: Object.freeze(["workflow inspection reveals step metadata but not stored document contents", "task journal persists bounded metadata only", "file and document contents are excluded from recovery history", "reviewed recovery requires a fresh context selection", "active coordinated tasks can receive an explicit cancellation request", "failed-step retry is previewed only when idempotency is proven and requires fresh user confirmation", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
  media_creative: Object.freeze(["workflow inspection reveals media capability availability without importing media", "workflow inventory includes media workflow metadata only", "task history deletion leaves original media assets untouched", "media handoffs are not repeated during recovery", "task history excludes raw media payloads", "active coordinated tasks can receive an explicit cancellation request", "failed-step retry is previewed only when idempotency is proven and requires fresh user confirmation", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
  intelligence_personalisation: Object.freeze(["workflow inspection resolves current capabilities through the shared runtime", "task status and recovery inspection share one runtime", "recent-task listing and forget operations are exposed through shared runtime", "saved workflows remain local and user-managed", "memory and private task inputs are excluded from activity summaries", "active coordinated tasks can receive an explicit cancellation request", "failed-step retry is previewed only when idempotency is proven and requires fresh user confirmation", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
  extensions_interoperability: Object.freeze(["workflow inspection flags missing capabilities before plan preparation", "workflow plans resolve current registered capabilities before preparation", "removed or unavailable capabilities fail closed during instantiation", "extension actions retain Action Engine authorization", "task-history removal is local metadata management only", "active coordinated tasks can receive an explicit cancellation request", "failed-step retry is previewed only when idempotency is proven and requires fresh user confirmation", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
  safety_privacy_security: Object.freeze(["workflow inspection is read-only and never executes capability actions", "status and recovery commands are read-only", "recovery never auto-resumes or replays external actions", "fresh confirmation is required for every new plan", "task-history deletion never claims to reverse an executed action", "journal stores metadata only and excludes task text and action inputs", "active coordinated tasks can receive an explicit cancellation request", "failed-step retry is previewed only when idempotency is proven and requires fresh user confirmation", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
  reliability_operations: Object.freeze(["workflow inspection exposes unavailable steps before execution and fails closed", "task status exposes bounded recent journal events", "interrupted task inspection distinguishes completed from unverified steps", "workflow removal and task cancellation remain separate", "new Stage 8 command regressions are required in core CI", "active coordinated tasks can receive an explicit cancellation request", "task outcomes distinguish verified, partially verified, and unverified steps", "retry adapters receive the same stable provider idempotency key across attempts"]),
});
const STAGE_EIGHT_CHECKPOINT = Object.freeze({
  id: 8,
  name: "Proactive intelligence and coordinated workflows",
  status: "complete",
  startedAt: "2026-11-09",
  completedAt: "2026-11-09",
  scope: "Stage 8 coordinated cross-surface task activity/status inspection, explicit recovery review, user-managed workflow inventory/removal, read-only workflow preflight, idempotency-gated recovery retries, stable provider idempotency keys, and truthful per-step verification across all 12 capability families. Existing workflow preparation remains preview-first and every execution requires fresh confirmation.",
  validationBoundary: "Stage 8 code and CI acceptance passed on commit 8f12f8766ffbb0e15f9ce110baae8ca787745cdc: dependency audit, complete core/architecture test chain, Stage 8 regressions, and web production build. Physical Android behavior and release certification remain separate deferred gates; this is not device certification.",
  deliverables: Object.freeze([
    "Expose task status and bounded activity history from Main Chat, Pulse, and voice through the shared runtime.",
    "Allow explicit review of interrupted task progress without automatic resumption or replay.",
    "Allow users to list and remove saved workflows by exact title.",
    "Allow read-only inspection of a saved workflow, including ordered steps, dependencies, risk labels, and currently unavailable capabilities.",
    "Allow users to inspect bounded recent task history and forget an individual local journal record.",
    "Inspect failed steps for safe retry eligibility and retry only when the adapter proves idempotency and the user confirms.",
    "Propagate a stable provider idempotency key across original execution and explicitly approved retry attempts.",
    "Expose verified, partially verified, and unverified outcomes without treating an unverified receipt as proof of success.",
    "Keep workflow storage local, metadata-only task journaling, fresh execution confirmation, and existing capability approval gates.",
    "Complete coordinated workflow regressions across all 12 capability families; future capability expansion continues in Stage 9 and later stages."
  ])
});

const STAGE_NINE_LAYER_AUDIT = Object.freeze({
  android_device: Object.freeze(["user-selected documents can be added as bounded local text sources", "no background file scanning or automatic indexing", "source deletion is explicit and local"]),
  voice_multimodal: Object.freeze(["voice and chat share one knowledge search API", "recording transcripts enter only after explicit user selection", "source provenance is retained"]),
  screen_accessibility: Object.freeze(["screen content is never automatically indexed", "user-invoked summaries require explicit save approval", "source deletion is available through the shared runtime"]),
  communication_people: Object.freeze(["conversation records require explicit user selection before indexing", "no automatic contact or message harvesting", "provenance identifies the selected source"]),
  location_travel: Object.freeze(["events and travel notes are user-added only", "no background location history enters the knowledge index", "project-scoped search is supported"]),
  calendar_productivity: Object.freeze(["tasks and events can be indexed as approved sources", "timeline filters support project and source type", "corrections retain bounded prior versions"]),
  files_knowledge: Object.freeze(["notes, documents, projects, tasks, conversations, websites, recordings, image descriptions and events are supported", "source provenance and relationships are retained", "duplicate detection and scoped search are available"]),
  media_creative: Object.freeze(["recordings and image descriptions use text/metadata only", "binary media is not uploaded or copied into the index", "source URI provenance is validated"]),
  intelligence_personalisation: Object.freeze(["federated search includes the personal knowledge universe", "relationships and timeline are queryable", "cloud sync remains disabled in this service"]),
  extensions_interoperability: Object.freeze(["knowledge APIs are exposed through the shared runtime", "search remains read-only", "no extension receives private source contents by default"]),
  safety_privacy_security: Object.freeze(["adding a source requires explicit user approval", "correction and deletion require separate confirmation", "local-only storage and no automatic capture"]),
  reliability_operations: Object.freeze(["bounded local store fails closed on corrupt data", "exact duplicate sources are detected", "record count and content length are bounded"])
});

const STAGE_TEN_SCOPE = Object.freeze({
  android_device: Object.freeze(["inventory and verify app search/launch, media, flashlight, volume, brightness, settings handoffs, device status and hardware detection", "distinguish implemented native adapters from planned or OEM-restricted controls", "require explicit user intent and truthful native execution receipts"]),
  voice_multimodal: Object.freeze(["preserve one shared voice/action runtime across Main, Pulse and voice", "make voice-driven device and communication actions cancellable and observable", "keep microphone use permissioned and user-controlled"]),
  screen_accessibility: Object.freeze(["review notification summaries and screen-context access for freshness, privacy and explicit invocation", "keep accessibility and notification permissions separately revocable", "avoid background screen capture or hidden notification forwarding"]),
  communication_people: Object.freeze(["inventory contact lookup, message drafting, translation, email, attachments, call preparation, dictation and meeting notes", "require user review and final confirmation before sending, calling or sharing", "retain recipient and destination confirmation in handoff receipts"]),
  location_travel: Object.freeze(["preserve one-shot location and map handoffs", "expose location freshness and provider limits", "do not introduce background tracking as a prerequisite for device mastery"]),
  calendar_productivity: Object.freeze(["connect follow-ups and meeting notes to approved calendar/task workflows", "keep event creation review-before-save", "avoid duplicate reminders and consequential unattended changes"]),
  files_knowledge: Object.freeze(["allow user-selected communication attachments and document context", "record provenance without silently copying private files", "keep Stage 9 knowledge browsing and picker backlog visible"]),
  media_creative: Object.freeze(["complete media transport controls only where Android APIs and device support permit", "report unsupported media sessions instead of simulating playback", "preserve user control in the source media application"]),
  intelligence_personalisation: Object.freeze(["route device and communication requests through shared intent, context and capability intelligence", "use approved knowledge/context only when relevant", "explain why a capability is unavailable or needs permission"]),
  extensions_interoperability: Object.freeze(["expose only allow-listed device and communication capabilities to extensions", "apply the same permission, consent and approval contracts to every adapter", "prevent extensions from bypassing Android confirmation"]),
  safety_privacy_security: Object.freeze(["separate runtime permission, source consent and action approval", "never silently send messages, place calls, share attachments or alter consequential settings", "minimise and bound notification and communication content"]),
  reliability_operations: Object.freeze(["verify native handoff outcomes and report unverified results honestly", "add regression coverage for unavailable hardware, denied permissions and cancelled handoffs", "preserve cancellation, idempotency and recovery guarantees"])
});

const STAGE_TEN_CHECKPOINT = Object.freeze({
  id: 10,
  name: "Universal Android and Communication Mastery",
  status: "in_progress",
  startedAt: "2026-11-09",
  scope: "Stage 10 coordinates Android device controls and communication workflows across all 12 capability families, using supported platform APIs, explicit permissions, user confirmation and verified outcomes.",
  validationBoundary: "Wave 1 code checkpoint: read-only Android hardware, runtime-permission and special-access inventory is implemented and covered by the Stage 10 regression. Stage 10 remains in progress; device controls, communication adapters, full cross-family evidence and physical Android validation are still outstanding. Stage 9's remaining knowledge UI and picker-boundary checks remain tracked.",
  deliverables: Object.freeze(["Expose a read-only Android hardware, runtime-permission and special-access inventory through the shared capability engine.", "Complete the supported device-control catalogue and hardware capability detection.", "Complete user-reviewed communication workflows for notifications, messages, email, attachments, contacts, calls, dictation, follow-ups and meeting notes.", "Keep consequential sends, calls, sharing and settings changes behind fresh user confirmation.", "Distinguish supported APIs, unavailable features, permission denial and OEM restrictions.", "Add capability-specific automated tests and all-12-family audit evidence.", "Retain Stage 9 knowledge browsing and picker validation as explicit carried backlog."])
});

const STAGE_NINE_CHECKPOINT = Object.freeze({
  id: 9,
  name: "Personal Knowledge Universe",
  status: "complete",
  startedAt: "2026-11-09",
  completedAt: "2026-11-09",
  scope: "Stage 9 builds an explicit-consent, local-first knowledge universe for user-selected notes, documents, projects, tasks, conversations, websites, recordings, image descriptions and events, with provenance, relationships, duplicate detection, scoped search, timeline, correction and confirmed deletion.",
  validationBoundary: "Stage 9 code checkpoint complete: the shared local-first service, Main/Pulse/voice runtime APIs, Knowledge Universe browse/search/edit/delete UI, explicit Android picker review/cancellation/provenance boundary, all-12-family audit, focused regression tests, full core/architecture CI, and web production build are implemented and passed on the current feature branch. Physical Android picker behavior and device-level extraction remain deferred and unverified; they are not implied by web CI.",
  deliverables: Object.freeze(["Index only explicitly user-approved sources; never scan private stores automatically.", "Preserve source type, label, URI, capture time and method as provenance.", "Detect exact duplicate sources before creating another record.", "Search by source type, project and tags; expose related records and timelines.", "Allow confirmed corrections with a bounded revision trail and confirmed deletion.", "Keep source text local by default with cloud sync disabled in this service.", "Expose APIs and federated search through the shared Main/Pulse/voice runtime.", "Audit Stage 9 behavior across all 12 capability families."])
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
    stageSixEvidence: [...(STAGE_SIX_LAYER_AUDIT[item.id] || [])],
    stageSevenEvidence: [...(STAGE_SEVEN_LAYER_AUDIT[item.id] || [])],
    stageEightEvidence: [...(STAGE_EIGHT_LAYER_AUDIT[item.id] || [])],
    stageNineEvidence: [...(STAGE_NINE_LAYER_AUDIT[item.id] || [])],
    stageTenScope: [...(STAGE_TEN_SCOPE[item.id] || [])],
    implementationStatus: "contract-audited",
    finalStatus: "active"
  }));
  return Object.freeze({
    stages: Object.freeze([STAGE_ONE_CHECKPOINT, STAGE_TWO_CHECKPOINT, STAGE_THREE_CHECKPOINT, STAGE_FOUR_CHECKPOINT, STAGE_FIVE_CHECKPOINT, STAGE_SIX_CHECKPOINT, STAGE_SEVEN_CHECKPOINT, STAGE_EIGHT_CHECKPOINT, STAGE_NINE_CHECKPOINT, STAGE_TEN_CHECKPOINT]),
    stageTwoAudit: STAGE_TWO_LAYER_AUDIT,
    stageThreeAudit: STAGE_THREE_LAYER_AUDIT,
    stageFourAudit: STAGE_FOUR_LAYER_AUDIT,
    stageFiveAudit: STAGE_FIVE_LAYER_AUDIT,
    stageSixAudit: STAGE_SIX_LAYER_AUDIT,
    stageSixDeferredDeviceValidation: STAGE_SIX_DEFERRED_DEVICE_VALIDATION,
    stageSevenAudit: STAGE_SEVEN_LAYER_AUDIT,
    stageSevenDeferredDeviceValidation: STAGE_SEVEN_DEFERRED_DEVICE_VALIDATION,
    stageEightAudit: STAGE_EIGHT_LAYER_AUDIT,
    stageEightCheckpoint: STAGE_EIGHT_CHECKPOINT,
    stageNineAudit: STAGE_NINE_LAYER_AUDIT,
    stageNineCheckpoint: STAGE_NINE_CHECKPOINT,
    stageTenScope: STAGE_TEN_SCOPE,
    stageTenCheckpoint: STAGE_TEN_CHECKPOINT,
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
      nextStage: 10,
      activeStage: 10,
      stageTenStatus: STAGE_TEN_CHECKPOINT.status,
      stageTenScopedLayers: families.filter(item => (STAGE_TEN_SCOPE[item.id] || []).length >= 3).length,
      stageNineStatus: STAGE_NINE_CHECKPOINT.status,
      stageNineCodeComplete: STAGE_NINE_CHECKPOINT.status === "complete",
      stageNineAuditedLayers: families.filter(item => (STAGE_NINE_LAYER_AUDIT[item.id] || []).length >= 3).length,
      stageSevenStatus: STAGE_SEVEN_CHECKPOINT.status,
      stageSevenCodeComplete: STAGE_SEVEN_CHECKPOINT.status === "complete",
      stageSevenAuditedLayers: families.filter((item) => (STAGE_SEVEN_LAYER_AUDIT[item.id] || []).length >= 3).length,
      stageEightStatus: STAGE_EIGHT_CHECKPOINT.status,
      stageEightCodeComplete: STAGE_EIGHT_CHECKPOINT.status === "complete",
      stageEightAuditedLayers: families.filter((item) => (STAGE_EIGHT_LAYER_AUDIT[item.id] || []).length >= 3).length,
      stageSixStatus: STAGE_SIX_CHECKPOINT.status,
      stageSixCodeComplete: STAGE_SIX_CHECKPOINT.status === "complete",
      stageSixAuditedLayers: families.filter((item) => (STAGE_SIX_LAYER_AUDIT[item.id] || []).length >= 2).length,
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

export { FAMILIES as AURORA_LAYER_FAMILIES, STAGE_ONE_CHECKPOINT, STAGE_TWO_CHECKPOINT, STAGE_THREE_CHECKPOINT, STAGE_THREE_LAYER_AUDIT, STAGE_THREE_DEFERRED_RELEASE_VALIDATION, STAGE_FOUR_LAYER_AUDIT, STAGE_FOUR_CHECKPOINT, STAGE_FIVE_LAYER_AUDIT, STAGE_FIVE_CHECKPOINT, STAGE_SIX_LAYER_AUDIT, STAGE_SIX_CHECKPOINT, STAGE_SIX_DEFERRED_DEVICE_VALIDATION, STAGE_SEVEN_LAYER_AUDIT, STAGE_SEVEN_CHECKPOINT, STAGE_SEVEN_DEFERRED_DEVICE_VALIDATION, STAGE_EIGHT_LAYER_AUDIT, STAGE_EIGHT_CHECKPOINT, STAGE_NINE_LAYER_AUDIT, STAGE_NINE_CHECKPOINT, STAGE_TEN_SCOPE, STAGE_TEN_CHECKPOINT, createAuroraLayerRegistry, auroraLayerRegistry };
