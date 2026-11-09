# AURORA Staged Whole-System Implementation Roadmap

**Branch:** `feature/aurora-pulse-profile-overlay`  
**Current checkpoint:** Stage 11 — Creative and Learning Universe (active; Stage 10 code/CI checkpoint complete; physical Android validation deferred)  
**Rule:** Every stage advances every active layer to the same stage standard. A stage is not closed while any layer is missing its required checkpoint evidence.

## How progression works

AURORA is upgraded in coordinated stages, not by taking one feature to completion while the rest of the system is forgotten.

1. Every active layer receives the current stage's improvements.
2. Shared foundations are improved once and consumed by all dependent layers.
3. Each layer must pass its stage-specific checks before the stage can close.
4. A layer that reaches its **final** acceptance criteria is saved as complete and removed from the active upgrade queue. It remains supported and receives compatibility/regression checks.
5. A layer that has only passed an intermediate stage remains active for the next stage.
6. No stage may claim completion based only on documentation: code, tests, and device evidence are labelled separately.

A stage checkpoint is not the same as final feature completion.

## Stage 1 — Whole-system baseline

<badge>Checkpoint recorded</badge>

**Purpose:** Give every part of AURORA a stable place, owner, dependency map, and honest implementation status before deeper upgrades begin.

Stage 1 deliverables:

- Catalogue all 12 capability families with stable IDs.
- Assign each family an accountable architectural owner.
- Record cross-layer dependencies so shared changes cannot strand dependent features.
- Establish the shared runtime, action contract, permission, approval, consent, storage, event, journal, and recovery foundations as cross-cutting concerns.
- Separate architecture mapped, code present, adapter wired, automated-tested, and physical-device-tested states.
- Protect existing app identity, signing identity, routes, features, and user-data boundaries.
- Add automated checks that prevent a layer from silently disappearing or being marked final merely because it is catalogued.

**Stage 1 result:** All 12 families are mapped and remain active. This is an architecture checkpoint, not a claim that all 12 are implemented or production-ready.

## The 12 layers tracked at every stage

| ID | Layer | Primary owner |
|---|---|---|
| `android_device` | Android and device interaction | Capability runtime / native bridge |
| `voice_multimodal` | Voice and multimodal interaction | Conversation gateway / native bridge |
| `screen_accessibility` | Screen, accessibility, and notifications | Native accessibility / notification services |
| `communication_people` | Communication and people | Capability runtime / connectors |
| `location_travel` | Location, maps, and travel | Native location / maps adapters |
| `calendar_productivity` | Calendar, tasks, and productivity | Task orchestrator / workflow registry |
| `files_knowledge` | Files, documents, and knowledge | File adapters / knowledge graph |
| `media_creative` | Media and creative tools | Media adapters / provider router |
| `intelligence_personalisation` | Intelligence and personalisation | Memory / specialist coordinator |
| `extensions_interoperability` | Extensions and interoperability | Extension registry / Action Engine |
| `safety_privacy_security` | Safety, privacy, and security | Policy / consent / secure storage |
| `reliability_operations` | Reliability and operations | Event bus / journal / diagnostics |

The machine-readable source of truth is `src/core/aurora-layer-registry.js`. Tests live in `scripts/test-aurora-layer-registry.cjs`.

## Completed and next stages

### Stage 2 — Shared contracts and enforcement

<badge>Checkpoint complete — CI passed</badge>

Completed in the shared engine and adapter contract audit:
- Capability descriptors expose validated permission and consent requirements, bounded timeout settings, request-ID idempotency, and optional mandatory verification.
- Missing permission/consent policy handlers fail closed; declared consents are checked through the default-deny, revocable consent registry.
- Android Contacts, Accessibility, Notification Access, and Camera permission checks run through the common authorization gate.
- Consequential actions retain the shared approval broker; task plans and extensions continue to execute through the same Action Engine.
- Execution adapters receive an AbortSignal. Callers can cancel by request ID, deadlines produce an explicit `ACTION_TIMEOUT` receipt, and duplicate request IDs reuse an in-flight operation or stored receipt.
- Verifier-required capabilities cannot register without a verifier, and verified completion is reported separately from unverified completion.
- All 12 capability families now carry explicit Stage 2 contract-audit evidence in the machine-readable registry.

Automated coverage includes fail-closed permission/consent checks, authorization success, verifier success/failure, malformed contracts, timeout, cancellation, request-ID idempotency, shared runtime wiring, and all 12 layer records.

**Stage 2 result:** The shared-contract foundation and all 12 code-level adapter audit records are committed. The full core/architecture CI run passed on commit `cfefd036e3d05e2bdd78ac74e354f47a7af6a8fc` (run `42581638246`), including dependency installation, core/architecture tests, and web build. Stage 2 is complete as an automated code checkpoint, not physical Android certification or final feature readiness. All 12 layers remain active.

### Stage 3 — Secure state and context

<badge>Code checkpoint complete — CI passed</badge>

Implemented code-level hardening: Android-only protected-memory vault; shared runtime and privacy inventory; fail-closed JSON/schema validation across memory, consent, knowledge graph, task journal, workflow, routine, and extension stores; strict protected-vault index and decrypted-record schema validation; and per-record cloud sync that rechecks consent before each upload and disables itself after revocation. Added Stage 3 audit evidence for all 12 capability families and regression tests for corrupt extension data, invalid protected-vault indexes/records, and consent revocation. Browser localStorage remains explicitly unencrypted.

**Stage 3 result:** The full CI run passed on commit `68b9b6df623503209276751fecd78872f82be3b0` (run `42583043179`): dependency installation, AURORA core/architecture tests, and web build all succeeded. Stage 3 is complete as a code-and-CI checkpoint. This does **not** certify physical Android behavior.

**Deferred release-validation checklist — not a Stage 4 blocker:**
- [ ] Verify Android Keystore key creation, availability, invalidation, and protected-memory read/write on supported physical devices.
- [ ] Verify Android backup exclusion for protected-memory files and key material.
- [ ] Verify app restore and upgrade behavior without silent reset, exposure, or unintended migration.
- [ ] Verify device migration and document the protected-memory portability boundary.
- [ ] Run end-to-end privacy and recovery UX checks on supported Android versions and lower-memory devices.

These checks remain **deferred and unverified** by the user’s direction to finish the app first. They are mandatory before release sign-off, but do not prevent Stage 4 from beginning after the Stage 3 CI pass. Preserve local-first behavior; do not perform automatic migration or bulk upload.

### Stage 4 — Reliability and recovery (complete — code and CI checkpoint)

**Stage 4 is complete as a code-level reliability and recovery checkpoint.**

The coordinated reliability foundation adds a shared lifecycle coordinator for visibility, foreground/background, online/offline, pagehide and pageshow events; bounded metadata-only failure diagnostics; cooperative cancellation for multi-step tasks; and a review-only recovery queue. The task journal now stores bounded execution receipt metadata only: it excludes task inputs, action result payloads, error messages and sensitive document/screen/media contents. Cancellation stops active Action Engine work and prevents later steps. Existing authorization, consent, approval, timeout and idempotency gates remain authoritative. A regression test verifies that private action payloads are not persisted in recovery records.

Specialist coordination now isolates each specialist with a bounded execution deadline and cooperative AbortSignal. Repeated failures open a per-specialist circuit; after a cooldown, only one half-open probe is allowed. An unavailable specialist is skipped with a stable error code while other selected specialists continue. Error messages are not returned to callers, preventing provider exceptions from leaking private request or response details. Specialist health is inspectable through the shared runtime. This does not grant specialists permission to execute device actions; all actions still pass through the Action Engine.

Task execution now contains adapter exceptions at the individual step boundary: it records a bounded error code, emits a fault event, marks the step failed and finalizes the task receipt instead of leaving an in-memory task promise rejected. Manual retry adapter exceptions are contained the same way. Journal persistence failures are isolated from event publication so a storage quota or unavailable-storage error cannot suppress lifecycle/task events; the journal failure is surfaced as a metadata-only diagnostic event. This is best-effort journaling, not a claim that storage is durable when the platform denies writes.

Interrupted-task inspection now distinguishes a task that was still marked running when the app stopped. It reports only step IDs, capability IDs, risk/approval metadata and whether a step was previously recorded as completed; an in-flight step is explicitly marked `not_verified_completed` because an external side effect may have happened before the interruption. The shared runtime exposes review and dismissal operations. Inspection never restores inputs, recreates executable plans, resumes a step, or assumes an uncertain action failed. A new plan and fresh confirmation are required.

Recovery is **not automatic**. A recovered task is review-only and requires fresh explicit confirmation; every action passes normal permission, consent and approval checks. No unattended retries are introduced, particularly for consequential or potentially non-idempotent actions. The Action Engine now exposes retry eligibility per capability. Retry defaults to `never`; opting into `idempotent` requires documented adapter evidence. Eligibility is advisory only: it does not trigger automatic retry, and consequential actions still require fresh approval. The engine reports unknown or unproven adapters as ineligible.

All 12 active families receive Stage 4 audit evidence. The task-orchestrator cancellation test syntax has been corrected, and the task journal has dedicated metadata-only persistence coverage. The Action Engine requires explicit adapter idempotency evidence before a retry can be considered eligible. A manual failed-step retry API now requires fresh user confirmation, checks completed dependencies, refuses unproven adapters, and caps retries at two per step; no automatic retry or whole-plan replay occurs. Physical Android lifecycle/interruption validation remains later device work; Stage 3 Keystore/backup/restore/migration checks remain deferred to final release hardening.

The final implementation pass extends reliability into persistent and scheduled services:
- Memory sync deduplicates concurrent uploads for the same record, rechecks consent after remote conflict reads and immediately before upload, disables cloud sync on revocation, and records bounded failure codes without exposing provider messages. Local memory remains authoritative.
- Workflow storage now validates the complete stored shape, unique ordered dependencies, capability identifiers, bounded step inputs, workflow limits and planner availability again at instantiation. Corrupt or stale workflow data fails closed rather than being silently replaced or executed.
- Routine scheduling validates stored records and bounds, compensates if persistence fails after an Android alarm is created, and makes cancellation transactional: the saved record is restored if Android cannot cancel the reminder. Routines remain reminders only and never execute workflow steps in the background.
- Existing extension execution remains metadata-only and routes every requested capability through the shared Action Engine; no downloaded code or autonomous extension execution is introduced.

**Stage 4 implementation result:** The planned code changes now cover task execution, task journaling, specialist isolation, lifecycle diagnostics, recovery review, storage-backed workflows, memory sync, extension execution boundaries and scheduled background reminders. No Stage 5 work has started. The user previously asked to defer testing, but has now authorized completion work. The latest feature-branch CI run (GitHub Actions run 42591318770) passed dependency installation, the blocking dependency audit, all core/architecture tests, and the web production build on commit `5c646116d4341b4ff62c30a34183bc02dcbd717c`. The dedicated feature-branch CI gate is verified. Per the project decision, Android APK compilation is deferred until the later release-preparation phase: its workflow is now manual-only and will not consume build time on every source push. The earlier Android run was cancelled during Gradle compilation when later pushes superseded it; this was not a confirmed Gradle build failure. APK compilation, archive validation, artifact upload, and physical-device lifecycle/interruption checks remain explicitly deferred and unverified. Stage 4 is closed on its active code-level reliability, security, recovery, tests, and web CI gates. APK/device certification is a later release gate. Stage 5 is now the active checkpoint; all 12 capability families remain in the active upgrade queue.

### Stage 5 — Capability adapter expansion (active)

**Implementation wave 1 completed:** Shared Action Engine adapters for Android speech output, stop speaking, foreground assistant service start/stop, accessibility settings handoff, and installed build information. Starting the background service requires microphone permission and explicit approval.

**Implementation wave 2 completed:** Native Android speech recognition start/stop, explicit microphone permission, transcript/error/status event delivery, notification permission request, and assistant service status reporting. Starting microphone capture requires fresh approval and microphone permission.

**Implementation wave 3 completed:** Approval-gated local search across recent Android notification previews, requiring Notification Access, and in-memory search over user-selected document text, bounded to 1 MB and 20 excerpts. Document content is not persisted.

**Implementation wave 4 completed:** Approval-gated SMS draft handoff opens Android's composer without sending; text sharing opens the system chooser so the user selects a destination and confirms the action.

**Implementation wave 5 completed:** Native contacts permission and search are implemented against Android's contacts provider with a 20-result cap and minimal returned fields. Phone-call preparation now opens Android ACTION_DIAL; AURORA never places a call silently.

**Implementation wave 6 completed:** Automated source-contract coverage checks that Android plugin methods, TypeScript bridge methods, service actions, independent window attachment state, and lifecycle status reporting stay in parity; the focused check is included in the core test chain.  Removed duplicate SMS capability registration and consolidated text sharing under one canonical communication capability. Added a CI regression guard that checks the production capability catalogue for unique IDs and protects required calendar, file, media, notification, maps and voice adapters from accidental removal.

**Implementation wave 7 completed:** Added a native, read-only calendar search adapter for upcoming events (next 90 days, maximum 20 results, optional title filter). It requests Android Calendar permission through the shared authorization gate, requires explicit Action Engine approval, returns only bounded event metadata, and keeps results local without persisting or uploading calendar contents.

**Implementation wave 8 completed:** Added Android coarse/fine location permission handling and a one-shot last-known-location adapter. Results include coordinates, accuracy, provider, timestamp, age, precision, and a freshness flag; no background location listener or location persistence is introduced. The shared Action Engine registers `location.get_current` as high-risk, approval-gated, and source-consent-gated. The machine-readable layer registry now records Stage 5 evidence for all 12 capability families, and a whole-stage regression test is included in the core test chain. Stage 5 remains active until cross-surface and all-family acceptance checks pass. APK and device testing remain deferred.

**Implementation wave 9 completed:** Wired the location capability into the shared chat runtime with a two-step consent flow (`prepare location access` then `confirm location access`) before Android permission is requested. A direct `where am I` request then executes through the shared Action Engine and its fresh approval broker, returning timestamp and freshness-aware results. The Stage 5 regression test now checks the consent path and chat routing as well as native bridge parity and all 12 family audit entries.

**Stage 5 COMPLETE — 2026-11-09 (code-level checkpoint):** All 12 capability families have coordinated audit coverage; the native Pulse bridge, calendar search, permission-gated one-shot location adapter, shared Action Engine approval/consent contracts, and chat-runtime location consent flow are implemented. The full GitHub Actions core/architecture test chain and web production build passed on commit `a42da3eb4f889ac1dc4e335fe5faae292bcf648b` (run 42597055150). Existing document/media actions remain deliberately user-selected and provider/platform bounded. This closes Stage 5 at the capability-adapter layer. **Not claimed:** APK compilation, physical-device behavior, or release readiness.

### Stage 6 — Surface integration and device validation

**Wave 4 — Safe interaction interruption and spoken-output cancellation (code committed; device validation pending):**
- A shared interaction-interruption coordinator observes foreground/background lifecycle events and stops registered live sessions.
- Main Chat and Pulse microphone sessions register with the coordinator. Interrupted sessions are cleared and never silently restarted on resume.
- Spoken output (cloud audio, Android TTS, and browser speech synthesis) now registers as a voice session. Backgrounding cancels active playback and speech; delayed voice API responses are discarded instead of starting playback after resume.
- Turning voice responses off also cancels current spoken output. Completion/error paths release their interruption registrations.
- Metadata-only interruption events identify the affected surface without carrying transcripts, audio, or message content.
- Added coordinator behavior tests and spoken-output source regression checks to the core test chain.

**Still pending in Stage 6:** native voice service validation, Pulse overlay lifecycle verification, accessibility and reduced-motion checks, battery/offline behavior, low-memory device tests, and full physical Android validation. No APK, signing, or keystore work is part of this stage.

### Stage 6 — Surface integration and device validation (active)

**Implementation wave 1:** Added a shared surface gateway consumed by Main chat and AURORA Pulse. Main chat, Pulse, and voice transcript submissions are registered as supported surface identities and route through the same existing capability runtime. The gateway bounds input, rejects unknown surfaces, normalizes failures, and emits metadata-only lifecycle events; it never publishes message text or tool results. Voice transcripts enter through the existing Main/Pulse send paths and therefore inherit the same gateway and approval broker.

**Implementation wave 2:** Connected the shared approval broker to the event bus through a privacy-filtering bridge. Main chat, Pulse, and voice can now observe the same approval lifecycle without copying proposal inputs, descriptions, contact details, or message content into global event history. Approval remains in-memory and expires by timeout; the bridge does not approve or reject anything on a user's behalf.

**Automated coverage:** Dedicated tests verify all three surface identities, shared routing, bounded input, failure normalization, metadata-only surface events, approval-created/approved/rejected lifecycle propagation, absence of sensitive proposal data in the global event stream, and listener cleanup. The new approval bridge test is included in the core CI chain. CI must pass the complete core suite and web build before this wave is considered validated.

**Implementation wave 3:** Connected Capacitor Android app foreground/background changes to the shared reliability coordinator. Returning to the foreground publishes a bounded resume event with the count of recoverable tasks; it never restarts or repeats an interrupted action. The listener is removed on component teardown and browser-only sessions are unaffected. A focused regression test covers background/resume ordering, review-only recovery metadata, and listener cleanup.\n\n**Implementation wave 4:** Added a shared interaction-interruption coordinator for live microphone sessions. Main Chat and Pulse register their active native/browser speech-recognition sessions; when Android reports background or the browser reports hidden visibility, the coordinator stops those sessions, removes them from its active registry, and publishes metadata-only interruption events. Foreground/resume only clears the background state: microphones never restart automatically. Manual stop, recognition result/error, and startup failure release registrations to prevent stale sessions.

**Automated coverage:** Added a regression test for simultaneous Pulse/voice sessions, background interruption, already-background registration, metadata-only interruption events, no automatic restart, and disposal. Included in the core test chain.

**Still outstanding:** Native Android voice service, Pulse overlay, accessibility, battery/offline behavior, and low-memory behavior require physical-device testing. APK compilation and signing remain deferred by the project decision. Stage 6 is active until all 12 layer acceptance checks and device validation evidence are complete.

These stages may be refined as repository audits reveal dependencies, but no layer may be silently skipped. A stage can be split into smaller checkpoints; it cannot be declared complete until every active layer meets its acceptance criteria.

## Completion and drop rule

A layer is dropped from the **active upgrade queue** only after its final acceptance criteria are met:

- Contract and implementation are complete.
- Permission, consent, safety, and approval behavior are enforced.
- Automated tests pass, including relevant cross-layer regression tests.
- Required native/device tests pass on supported configurations.
- Failure, offline, cancellation, and recovery behavior are verified.
- Documentation and diagnostics report the real state.

Then mark it final, preserve it in the completed-layer register, and continue regression checks whenever shared foundations change. “Dropped” never means deleted or unsupported.


**Wave 5 — Pulse lifecycle and accessibility integration (code committed; device validation pending):**
- Closing Pulse, pressing Escape, hiding the document, or backgrounding the app stops Pulse speech recognition and removes native listeners.
- Pulse dialog now receives initial focus, traps keyboard focus while open, and restores prior focus on close.
- Added Escape-to-close and keyboard Tab handling.
- Pulse conversation announces newly added content to assistive technology; the status orb has an accessible state label.
- Added reduced-motion styling for users who request less motion.
- Added Pulse lifecycle/accessibility regression source checks to the core test chain.
- Physical TalkBack, keyboard, reduced-motion, and Android background/resume verification remain pending.


**Wave 6 — Adaptive device conditions and offline resilience (code committed; physical-device validation pending):**
- Added one shared environment monitor to the runtime, available to Main Chat, Pulse, and voice through the same runtime singleton.
- Tracks online/offline state, coarse effective network class, data-saver preference, and device memory class when supported. Battery percentage/charging is detected only when the platform exposes the Battery Status API.
- Unsupported or denied APIs remain explicitly unknown; no battery polling, precise network telemetry, or content collection is introduced.
- Emits bounded operational metadata through the shared event bus. Low-memory, slow-network, data-saver, or critically low-battery conditions select a conservative adaptive mode for future surface consumers.
- Handles supported memory-pressure events and cleans up every listener on disposal.
- Added a focused regression test for offline/online changes, low-memory adaptation, unsupported API fallbacks, metadata-only events, and listener cleanup; included it in the core test chain.
- The monitor is observational/advisory: it does not disable user actions, replay interrupted tasks, or silently change permissions. Existing review-only recovery and fresh-confirmation rules remain authoritative.
- Still pending: confirm real Battery API support on target Android builds, validate memory pressure/network transitions on low-memory devices, and run physical TalkBack/voice/Pulse lifecycle checks. APK builds, signing, and keystore work remain deferred.


### Stage 6 COMPLETE — Surface integration and device validation (code-and-CI checkpoint)

**Stage 6 is closed at the code-integration and automated-CI level across all 12 capability families.** Main Chat, Pulse, and voice share the surface gateway and approval lifecycle; Android foreground/background lifecycle is connected to review-only recovery; microphone and spoken-output sessions are interrupted safely; Pulse has keyboard, focus, screen-reader, and reduced-motion safeguards; and the shared runtime exposes adaptive offline/network/data-saver/memory/battery conditions.

The machine-readable layer registry records explicit Stage 6 evidence for all 12 families. GitHub Actions run **42603081673** passed dependency installation, the blocking dependency audit, the complete core/architecture test chain, and the web production build on commit **5216c175f2e36389946db721d6dbb5dd7d9485e8**.

**Deferred device-certification gate (not a blocker for Stage 7 implementation):**
- [ ] Verify native voice service and microphone interruption/resume on supported Android devices.
- [ ] Verify Pulse overlay, TalkBack, keyboard focus, and reduced-motion behavior on device.
- [ ] Verify offline/online, data-saver, supported battery API, and memory-pressure behavior on a low-memory Android device.
- [ ] Verify listener cleanup after Pulse close, backgrounding, and component teardown.

These checks remain unverified and mandatory before release sign-off. APK compilation, signing, keystore changes, and release work remain deferred by the project decision.

### Stage 7 — Native assistant activation and contextual intelligence (code checkpoint complete; CI confirmation pending)

**Whole-system objective:** Move AURORA from a capable shared chat/action runtime toward a genuinely usable Android assistant while improving every affected layer together. Stage 7 coordinates:
- Voice and Android device: explicit opt-in wake-word/foreground listening architecture, visible listening state, clear stop controls, microphone permission handling, and battery-conscious lifecycle.
- Screen and accessibility: user-invoked screen context and Q&A, accessibility-service state, strict foreground/session boundaries, and no covert screen capture.
- Device and communication: safe installed-app launch and app handoff, with user confirmation for consequential communication.
- Location and travel: current-location and map handoff integration with freshness disclosure; no always-on tracking.
- Productivity and intelligence: contextual task planning, user-controlled reminders, and shared memory/context across Main, Pulse, and voice.
- Files and media: user-selected file/media context with bounded processing and no silent uploads.
- Safety and reliability: every new action continues through shared permission, consent, approval, cancellation, diagnostics, and review-only recovery; unsupported platform features fail closed with clear availability states.

**Implementation wave 1 — Explicit contextual capture and privacy boundary (code committed; device validation pending):**
- Added a shared context-session service to the AURORA runtime for Main Chat, Pulse, and voice. Capture sessions require an explicit user-initiated action, a supported source/surface pair, and a short expiry (capped at 60 seconds).
- Context is one-shot: consuming or revoking a session removes it. Captured text is bounded, returned only to the requesting surface, and never copied into the global event stream; events contain only source, surface, session ID, character count, and truncation metadata.
- Main Chat's Read Screen action now opens and consumes a one-shot context session before displaying captured text for user review.
- Android accessibility no longer reads or caches screen text from background accessibility events. It reads only the current external app window when the foreground AURORA UI explicitly invokes Read Screen. AURORA's own window is excluded.
- The generated native bridge template rejects screen reads when AURORA is not open in the foreground.
- Added regression coverage for opt-in, source/surface validation, TTL bounds, one-shot use, revocation, truncation, metadata-only events, and native non-caching/foreground guards.
- Still pending: run the full core CI/web build for this wave and verify screen capture behavior with TalkBack and supported Android accessibility services on-device.

**Implementation wave 2 — Cross-surface selected-document context (code committed; device validation pending):**
- The shared surface gateway now forwards the validated surface identity into the same capability router, so Main Chat, Pulse, and voice retain their identity through routing.
- A user-invoked document picker now creates a short-lived, one-shot document context session for the requesting surface. Text previews are bounded by the shared context limit; binary/non-text selections remain metadata-only handoffs with a clear note.
- The context session is consumed immediately, and its content is returned only to the requesting assistant turn. Event metadata exposes only source, surface, character count, and truncation state.
- Added a cross-layer regression for gateway surface propagation and selected-document context boundaries.
- Still pending: verify document picker behavior and surface-specific assistant follow-through on physical Android devices; CI/build must pass before calling this wave validated.

**Implementation wave 3 — Explicit wake-listener lifecycle and whole-system checkpoint (code committed; CI confirmation pending):**
- Hardened the Android wake listener as an explicit user-started microphone foreground service. It now requires microphone permission and, on Android 13+, notification permission before it starts.
- Added a persistent notification action that immediately stops listening, clears the active state, destroys the recognizer, and stops the foreground service.
- Wake phrase detection now clears the listening state and stops the microphone service before opening AURORA, avoiding a stale "listening" indicator after activation.
- Changed the service to non-sticky startup so Android process death cannot silently restart microphone listening. It is not automatically re-enabled on boot.
- Native status now checks both the running Android service and its active-state flag rather than trusting a stale preference alone.
- Added wake-listener lifecycle tests and a machine-readable Stage 7 audit/checkpoint covering all 12 capability families.

**Stage 7 code-and-CI checkpoint (2026-11-09; physical-device validation deferred):**
- All 12 active capability families have Stage 7 evidence in `src/core/aurora-layer-registry.js`.
- Screen and selected-document context remain explicit, bounded, one-shot, and scoped to the requesting surface.
- Main Chat, Pulse, and voice continue to share the runtime, approvals, memory, task planning, location, and safe device handoffs.
- Hey AURORA listening is explicitly enabled by the user, visibly foreground-notified, stoppable from the notification, and does not auto-restart after process death.
- The AURORA Build Check passed on commit `a57b4287`, including the core/architecture test chain and web production build. Physical Android behavior remains unverified.
- Device-specific checks remain unverified and are recorded in `STAGE_SEVEN_DEFERRED_DEVICE_VALIDATION`. This is not APK certification or release readiness.

**Stage 7 acceptance rule:** implement coordinated capability changes across all 12 families, add focused and cross-layer regression tests, pass the full core/architecture CI and web build, and label native/device-dependent behavior as unverified until physical Android checks are actually performed. Do not build APKs, change signing material, or deploy during this stage unless the user explicitly asks.

### Stage 8 — Proactive intelligence and coordinated workflows (code and CI complete; device validation deferred)

**Whole-system objective:** Make AURORA consistently useful across Main Chat, Pulse, voice, and Android by turning the existing context, memory, task planner, specialist coordinator, workflow registry, reminders, and capability catalogue into coherent user-controlled end-to-end workflows.

**Implementation wave 1 — Cross-surface workflow observability and user controls (code committed; core CI and web build passed):**
- Main Chat, Pulse, and voice share new read-only task status and bounded activity-history commands through the same runtime.
- Users can explicitly inspect an interrupted task by ID. Recovery inspection distinguishes completed steps from steps whose external outcome cannot be verified; it never resumes or repeats actions.
- Users can list saved workflows and remove a workflow by its exact title. Ambiguous or missing titles fail closed.
- Runtime exports `taskActivity` and `reviewTaskRecovery` for shared surface integrations.
- Added a Stage 8 regression to core CI and registry evidence across all 12 capability families.
- The task journal continues to persist metadata only; user-authored task titles, summaries, inputs, private file contents, and action result payloads are not stored in recovery history.

Stage 8 advanced all 12 capability families together:
- Voice and surfaces: carry intent and task state across Main Chat, Pulse, and voice without losing the user's chosen context.
- Device and communication: sequence safe app handoffs while preserving explicit confirmation for calls, messages, sharing, and other consequential actions.
- Screen, files, and media: let users attach selected context to a task, show what AURORA used, and keep content bounded and local unless the user explicitly approves sharing.
- Location and productivity: combine fresh location/map context, calendar, reminders, and task planning into reviewable plans.
- Intelligence and memory: improve retrieval and personalization while keeping local-first memory and per-record cloud-sync consent.
- Extensions and reliability: make workflows observable, cancellable, resumable only after fresh user confirmation, and diagnosable without exposing private content.
- Safety and privacy: no unattended consequential actions, hidden microphone/screen/location collection, or silent uploads.


**Implementation wave 2 — Task history completeness and user data controls (code committed; Stage 8 core CI and web build passed):**
- Added a recent-task command that exposes only bounded metadata: task ID, status, last-updated time, event count, and whether review may be available.
- Added an explicit forget/delete task command to remove one local task-journal record. It does not claim to undo any external action already completed.
- Exposed bounded recent activity and explicit forget operations through the shared runtime so Main Chat, Pulse, and voice can use the same controls.
- Extended the Stage 8 regression to cover these new commands and runtime exports.

**Implementation wave 3 — Saved workflow inspection and preflight visibility (code committed; Stage 8 core CI and web build passed):**
- Added a read-only “show workflow [exact title]” command.
- It displays ordered steps, capability labels, dependency relationships, risk metadata where available, and whether each capability is currently registered.
- Missing or ambiguous workflow titles return a clear result; unavailable capabilities are disclosed before preparation.
- Inspection does not request permissions, access screen/location/files, or execute any step. Preparing still creates a fresh preview and requires confirmation.
- Added focused regression coverage and updated Stage 8 evidence across all 12 capability families.

**Implementation wave 3 — Read-only workflow inspection and preflight (code committed; Stage 8 core CI and web build passed):**
- Users can say “inspect workflow [name]”, “review workflow [name]”, or “explain workflow [name]” to see ordered steps, dependencies, current capability availability, risk labels and approval requirements.
- Inspection is read-only: it does not run steps, grant permissions, read screen contents, or expose stored step-input payloads.
- If a capability is unavailable or the workflow name is ambiguous, AURORA reports that state and fails closed.
- The shared runtime exposes the same inspection data for Main Chat, Pulse and voice.
- Added a focused Stage 8 regression and 12-family architecture evidence.

**Implementation wave 4 — Active task cancellation (code committed; Stage 8 core CI and web build passed):**
- “Cancel task [ID]” and “stop task [ID]” now reach the shared orchestrator's cancellation controller for an active run.
- A pending, unexecuted plan can still be discarded without running actions.
- AURORA reports a cancellation *request*, not a guaranteed rollback. It explains that already completed external actions are not undone.
- If the task is not active, AURORA reports that no cancellation action was taken.
- Added Stage 8 regression coverage and architecture evidence across all 12 capability families.

**Implementation wave 6 — Verified outcomes and stable retry identity (code committed; core CI and web build passed):**
- The Action Engine now passes a stable provider idempotency key into each capability adapter. A permitted retry uses the same key as the original task step, allowing adapters to deduplicate the same logical operation instead of treating every attempt as a new operation.
- This is not permission to retry arbitrary actions: only explicitly declared idempotent adapters remain eligible, the user must confirm, and retries remain capped.
- Each task step now reports one of three truthful states: verified, unverified, or not applicable. The task summary reports verified, partially verified, unverified, or not applicable.
- A capability is marked verified only when its registered verification adapter returns a positive result. A completed execution receipt without a verifier is explicitly unverified.
- The metadata-only task journal preserves verification status without storing user content, file contents, raw action results or private error messages. Task status review exposes the verification summary.
- Added orchestrator and journal regressions for verification status and stable idempotency keys.

**Implementation wave 5 — Safe self-recovery retry preflight (code committed; Stage 8 core CI and web build passed):**
- Added a read-only retry inspection API for failed task steps.
- AURORA checks that the task actually failed, the selected step is the failed step, dependencies completed, retry limits are not exceeded, and the capability adapter explicitly proves idempotency.
- AURORA now offers a retry preview only when all checks pass. The user must issue a separate confirmation command before one retry is attempted.
- Unknown or non-idempotent actions fail closed; AURORA does not guess that repeating a message, payment, setting change, or other external action is safe.
- Retry results are reported from the action receipt, and any further action requires fresh confirmation.
- Added orchestrator tests and shared-runtime command regression coverage; Stage 8 evidence updated across all 12 capability families.

**Stage 8 completion checkpoint (2026-11-09):** all 12 capability families have coordinated workflow evidence. Commit `8f12f8766ffbb0e15f9ce110baae8ca787745cdc` passed dependency installation, enforcing dependency audit, the complete core/architecture test chain (including Stage 8 regressions), and the web production build in GitHub Actions run `42612785412`. User confirmation, permission, consent, cancellation, stable idempotency, truthful verification and review-only recovery are covered by the passing code/test checkpoint. Physical Android behavior, microphone/device integration and release certification remain explicitly deferred; no APK or release readiness is claimed.

## Complete vision roadmap and remaining stages

The original AURORA vision has **7 broad phases**. Those are the long-term product pillars, not seven small coding steps. To make delivery measurable, the project now uses **14 implementation stages** distributed across those seven phases. Stages 1–7 form the foundation already worked through; Stage 8 is active. That leaves **6 implementation stages after Stage 8**, or **7 including the current Stage 8**.

| Original vision phase | Implementation stages | Intended outcome |
|---|---:|---|
| 1. Universal foundation | 1–2 | Shared identity, runtime, capability catalogue, memory/context and safety contracts |
| 2. Android mastery | 3–4 | Native device adapters, voice, screen context, accessibility and approved phone control |
| 3. Personal intelligence | 5, 9 | Personal knowledge universe, linked information graph, project/conversation/document retrieval |
| 4. Autonomous workflows | 6–8, 10 | Cross-surface planning, safe execution, recovery, verification and communication workflows |
| 5. Creative and learning universe | 11 | Media creation, study support, transcription, summarisation and personal learning workflows |
| 6. Connected ecosystem | 12–13 | Opt-in predictive/sensor intelligence, connected devices and interoperable extensions |
| 7. Experimental intelligence | 14 | Extensible research capabilities, evaluation, controlled experiments and safe rollout |

### Stage 9 — Personal Knowledge Universe (complete — code and CI checkpoint)

**Implementation wave 1 — Local-first knowledge universe core (code committed; CI pending):**
- Added an explicit-approval index for notes, documents, projects, tasks, conversations, saved websites, recording transcripts, image descriptions and events.
- Records retain provenance (source label, URI, capture time and method), project association, tags and bounded summaries.
- Exact duplicate sources are detected before a new record is created.
- Search supports source-type, project and tag scoping; related-source links and chronological timeline views are available.
- Corrections require separate confirmation and retain a bounded revision trail; deletion requires separate confirmation and removes attached relationships.
- The service is local-only, bounded to 500 records and 12,000 characters per source, and performs no background capture or cloud sync.
- Shared runtime exposes add/search/relate/related/timeline/correct/delete APIs; federated search and privacy inventory include the new universe.
- Added Stage 9 service and architecture regressions; Stage 9 evidence is recorded across all 12 capability families.

**Stage 9 acceptance rule:** the latest core CI and web production build must pass; all 12 families must have evidence; selected-source provenance, duplicate handling, scoped search, relationships, timeline, correction, deletion and local-first privacy must remain covered. Android document picker UX and physical-device integration remain separate validation.
- Build a durable relationship graph connecting user-approved notes, documents, projects, tasks, conversations, saved websites, recordings, images and events.
- Support questions such as “find everything related to this project”, “what decisions did I make?” and “compare the original idea with the latest version”.
- Add source citations/provenance, duplicate detection, timeline views, scoped search, user correction and deletion.
- Keep private content local by default; cloud indexing and cross-device sync require explicit per-source consent.

### Stage 10 — Universal Android and Communication Mastery (complete — code/CI checkpoint)

**Stage opening (2026-11-09):** Stage 10 became the active coordinated implementation stage after Stage 9's local-first knowledge service, Main/Pulse/voice runtime APIs, Knowledge Universe workspace and explicit picker boundaries reached their code/CI checkpoint. Stage 9 is closed at that boundary; physical Android picker and extraction validation remain release/device checks, not an open Stage 9 coding backlog.

**Implementation wave 1 — Read-only Android capability inventory (code committed; automated regression added):**
- Added native `getDeviceCapabilityInventory` to inspect camera, flash, microphone, telephony, Bluetooth, Wi-Fi, GPS and NFC hardware feature declarations.
- Reports camera, microphone, contacts, calendar, location and notification runtime-permission state without requesting any permission.
- Reports AURORA overlay, notification-listener and accessibility special-access state without opening settings or changing configuration.
- Exposes manufacturer/model/Android SDK metadata and a capture timestamp through the Capacitor bridge.
- Registers the shared `android.inspect_capabilities` action. It is read-only, requires no approval, does not prompt for permissions and does not change settings.
- Added `test:aurora-stage10` to the full core test chain. Hardware feature presence is reported separately from permission and special-access grants; this inventory does not claim that every control works on every OEM.

**Stage 10 opening scope audit:** the machine-readable registry now records targets across all 12 capability families. This is a scope map, not evidence that every listed capability is implemented. Device and communication features must be checked against the actual Android adapter, permission contract, approval behavior and device support before being marked available.

**Expanded Android utility scope:** Stage 10 is broader than email. Alongside existing app launch, SMS, email, sharing, dialler, maps, location, calendar, media, file picker, notifications, flashlight and device inventory adapters, this wave adds user-reviewed contact creation, alarm and timer handoffs, and NFC, sound, battery and AURORA app-details settings shortcuts. Android retains final control: contacts are not written directly, alarms/timers require user confirmation, and settings changes remain user-applied.

**Implementation waves:**
1. Audit the existing native capability catalogue and expose a truthful support/permission/approval matrix.
2. Complete device status and supported device-control adapters, including explicit unsupported/OEM-restricted outcomes.
3. Complete communication workflows with user-reviewed drafts, attachment selection, contact resolution, call preparation and notification summaries. The email composer handoff is implemented with recipient validation, bounded subject/body, Action Engine approval and explicit user-controlled sending. Expanded Android utilities add contact creation, alarm/timer preparation and additional settings handoffs. The next device-control wave adds approval-gated media/ring/alarm volume with visible Android volume UI, read-only storage capacity, and location, notification, security, date/time and storage settings shortcuts.
4. Add capability-level tests for permission denial, user cancellation, unsupported hardware, handoff failure and positive verification.
5. Verify the shared Main/Pulse/voice routes and all 12 family audits before closing the stage.

**Implementation wave 5 — App discovery and connectivity diagnostics (code committed; automated regression added):**
- Added a launcher-only installed-app inventory, bounded to 200 entries and deduplicated by package. It reports display name, package identifier and system-app flag; it does not inspect app data, launch apps or uninstall anything.
- Added read-only network diagnostics for connection state, validated internet capability, metered status and transport type.
- Explicitly excludes Wi-Fi SSID collection and traffic inspection; no connectivity settings are changed.
- Added shared native bridge methods, Action Engine capabilities and Stage 10 regression assertions.
- Android 11+ package visibility is constrained to launcher activities and the declared launcher intent query; the inventory is not a complete package-management catalogue.

**Implementation wave 6 — User-selected media and file sharing (code committed; regression coverage added):**
- Added an Android system document picker filtered to images, videos or audio, one selection at a time.
- The picker returns metadata and a content URI only. It does not automatically load, index, upload or store media bytes.
- Added an approval-gated share-sheet handoff for a selected content URI. The user chooses the destination and confirms; AURORA does not transmit the file itself.
- Added bridge and Action Engine capabilities plus source-level regression assertions.


**Implementation wave 6 — User-invoked camera preview capture (code committed; automated regression added):**
- Added an explicit Android system-camera handoff. The user must open the camera and take the photo; cancellation is reported without creating an image.
- Returns only the thumbnail preview supplied by Android's camera intent, JPEG encoded and bounded to 2 MB. It does not claim to save or return a full-resolution photo.
- Registered the operation in the shared Action Engine as high-risk and approval-gated. No silent capture, background camera use, broad media access or upload is introduced.
- Added bridge and regression coverage for the intent handoff, preview-only contract, size bound and approval requirement.
- Full-resolution capture/storage and physical camera behavior remain separate device-validation work; OEM camera apps may return no thumbnail and are reported as unsupported rather than treated as success.


**Implementation wave 9 — User-controlled audio recording handoff (code committed; automated regression added):**
- Added a handoff to Android's compatible system recorder. The user starts, stops and saves the recording in that recorder.
- AURORA receives only the returned content URI and MIME type; it does not capture audio in the background, read the audio bytes, or upload the recording.
- Cancellation is represented explicitly. The shared Action Engine marks the action high-risk and approval-gated.
- Added native bridge, capability and regression coverage. Recorder availability and returned URI behavior remain OEM/app-dependent and require physical-device validation.


**Implementation wave 10 — Open a selected active notification (code committed; regression added):**
- Added a notification-listener action that opens only the Android content intent for a still-active notification selected from AURORA's recent local cache.
- The shared Action Engine validates that the notification key exists in the cached list, checks Notification Access, and requires high-risk action approval.
- This operation only opens the originating app screen. It does not reply, dismiss, send, alter notification content, or act on an arbitrary notification key.
- Stale notifications and notifications without a content action return an explicit not-opened result. Android/OEM app behavior still requires physical-device validation.
- Added native listener, plugin bridge, Action Engine and regression coverage.


**Implementation wave 11 — Dismiss one selected active notification (code committed; regression added):**
- Added a single-item dismissal operation for an active notification selected from AURORA's recent local cache.
- The Action Engine checks Notification Access, validates the selected key against the local cache, and requires high-risk approval before calling Android.
- Only the selected active notification is dismissed; no other notifications are cleared and no reply or message is sent.
- Stale or unsupported notification keys return an explicit unsuccessful result. Physical Android/OEM behavior remains to be verified.


**Implementation wave 12 — Expanded read-only device health diagnostics (code committed; regression added):**
- Extended the existing device-status adapter with battery temperature and voltage when Android reports them, charging source, battery status and a timestamp.
- Added system-wide available/total memory and low-memory pressure indicators through Android's memory summary API. This reports aggregate system memory only; it does not inspect application memory contents.
- Added Android thermal status on API 29+ devices, with the field omitted on older versions.
- The shared Action Engine verifies that the result is marked read-only and timestamped. The operation requests no new permissions and changes no device settings.
- Added bridge typing and regression checks. Sensor availability and OEM reporting differences remain device-validation items.

**Implementation wave 13 — Active Android media-session controls (code committed; regression added):**
- Added play/pause, next and previous controls for a currently active media session exposed by an Android media notification.
- The adapter checks the session's advertised playback actions before issuing a transport command; it does not start arbitrary apps or claim success when no compatible session is active.
- Notification Access is required and the shared Action Engine marks the control high-risk and approval-gated.
- The result reports the active media app and available session context. Android/OEM media-notification behavior still requires physical-device validation.

**Implementation wave 14 — Save As document export (code committed; regression added):**
- Added TXT, Markdown, CSV and JSON export through Android's system Create Document picker.
- Export payloads are bounded to 1,000,000 characters and written as UTF-8 only after the user selects a destination.
- The shared Action Engine requires explicit high-risk approval; cancellation is reported distinctly and no directory scanning or arbitrary file overwrite is introduced.
- Added native bridge and regression coverage. Destination-provider behavior remains subject to Android/OEM device validation.

**Non-negotiable boundaries:** no silent calls, messages, email sends, attachment sharing or consequential settings changes; no hidden screen/notification collection; no simulated success; no assumption that every Android OEM exposes the same controls.

- Complete the supported device-control catalogue: app search/launch, media, flashlight, volume, brightness, supported settings handoffs, battery/storage/connectivity dashboard and hardware capability detection.
- Complete communication workflows: notification summaries, draft replies, translation, email composition, attachments, contact lookup, call preparation, dictation, follow-ups and meeting notes.
- Preserve Android permission boundaries and explicit confirmation for sending, calling, sharing or changing consequential settings.
- Distinguish supported Android APIs from unavailable or OEM-restricted controls; never simulate success.

### Stage 11 — Creative and Learning Universe (active; opened 2026-11-09)

**Implementation wave 1 — Local-first learner-controlled study plans (code committed; CI pending):**
- Added a shared Learning Universe service for creating bounded study plans across supported subjects, with learner-selected level, goal and topic list.
- Added explicit approval before saving a plan or a study session; topic progress changes and plan deletion require confirmation.
- Added practice-session logging with validated topic, bounded notes and a 1–600 minute duration. Progress summaries derive only from recorded sessions and explicitly updated topic states; AURORA does not invent study completion or grades.
- Exposed create/list/update/log/progress/delete APIs through the single shared Main/Pulse/voice runtime and registered study plans in federated search.
- Learning records remain local-only in this service; cloud sync and automatic capture are disabled. Corrupt persisted data fails closed.
- Added focused regression coverage and included it in the core CI test chain.

**Remaining Stage 11 scope:** creative media import/transcription/subtitle/summarisation integration, source-aware writing and project assets, learning explanations/practice content, voice-driven workflows, accessible media/study surfaces, and all-12-family acceptance evidence remain active work. The first wave is a foundation, not Stage 11 completion.

**Stage 10 COMPLETE — 2026-11-09 (code/CI checkpoint):** all 12 capability families have Stage 10 audit evidence. Implemented scope includes read-only device capability/health/connectivity/storage diagnostics; launcher app discovery; supported flashlight, volume and settings handoffs; one-shot location and maps; calendar, alarm and timer preparation; user-reviewed SMS/email/contact/call workflows; local notification search/open/dismiss; user-selected document/media import and sharing; active media play/pause/next/previous where a media notification exposes supported transport actions; and bounded TXT/Markdown/CSV/JSON Save As export. All sensitive actions preserve Android permissions, Action Engine approval and final user confirmation. The core/architecture test chain, blocking dependency audit and web production build passed on commit `e711cee0774cc5d26da9f1d26860958940d6a57e` (run `42642861145`). Physical Android behavior, native Java compilation/device execution, OEM-specific capabilities and release certification remain deferred; APK and release readiness are not claimed.

Stage 10's device-specific validation remains a release backlog rather than a reason to hold the code roadmap: no unsupported hardware or OEM feature is represented as working, and all unavailable outcomes remain explicit.

- Join media import, transcription, summarisation, subtitle search, writing, image/video workflows and project assets through the shared knowledge system.
- Add user-controlled study plans, explanations, practice, progress summaries and reusable learning projects.
- Keep source attribution, content rights, user review and bounded media processing visible.

### Stage 12 — Predictive and Sensor Intelligence
- Add optional routine-aware suggestions using approved calendar/task patterns and explicitly enabled device signals.
- Build sensor adapters for supported motion, environment and device-state signals with clear permission, sampling, retention and pause controls.
- Suggestions remain suggestions; no silent messaging, purchasing, calls, location tracking or consequential actions.
- Provide explain-why, snooze, disable, data-source review and opt-out controls.

### Stage 13 — Connected Ecosystem
- Add user-approved continuity across the user's Android devices and selected services.
- Introduce secure device pairing, per-device trust, revocation, encrypted transport and least-privilege extension permissions.
- Support handoff of approved tasks and knowledge references without silently copying private content.
- Add extension discovery, compatibility checks, sandboxing, audit trails and safe removal.

### Stage 14 — Experimental Intelligence and Vision Completion
- Add an extensible capability framework for future ideas not yet in the catalogue.
- Evaluate new models, local/cloud routing, specialist agents and adaptive interfaces against privacy, latency, reliability and cost.
- Provide capability simulation, regression/evaluation suites, staged opt-in experiments, rollback and transparent diagnostics.
- Complete security, accessibility, performance, battery, device-compatibility and recovery certification before calling the product release-ready.
- Preserve the original principle: AURORA enhances Android through a unified intelligence and action layer; it does not replace Android itself.

**Definition of vision completion:** all 14 implementation stages have their code, tests, documentation and acceptance evidence; all seven original phases are represented; Main App, Pulse and voice share one intelligence/capability core; Android/device and connected-service actions are permissioned and verifiable; privacy, accessibility, recovery and user control pass release gates. Physical-device certification and release approval are mandatory final gates, not assumed from web CI.

**Stage-count rule:** 14 total implementation stages in this delivery roadmap. Stage 11 is currently active. Stages 12–14 remain after it: **3 stages remaining after Stage 11**. Stages 1–9 have completed their code-level checkpoints; this is not physical-device release certification. The seven broad vision phases remain permanent product pillars; future ideas may extend Stage 14 or add a new roadmap version without pretending the vision is ever closed to expansion.




### Stage 9 — Personal Knowledge Universe (complete — code and CI checkpoint)

The shared local-first knowledge service is implemented and its focused tests, architecture tests, and core CI have passed on the feature branch. It supports explicitly approved notes, documents, projects, tasks, conversations, websites, recording descriptions, image descriptions and events; source provenance; bounded search with project/type/tag filters; source relationships; connected-source traversal (up to five hops); chronological timelines; confirmed corrections and deletion; and collision-safe duplicate detection. Main chat, Pulse and voice share the same service.

**Android source integration:** the system document picker is connected to explicit user commands. Text-readable files can be imported locally with a bounded preview. Images and audio recordings can be indexed as user-provided descriptions after the user selects a matching media type; AURORA clearly reports that it has not analysed or copied the binary media. Cancelled selections, unsupported file types and media-type mismatches do not create records. No background file scanning, broad storage access, automatic import, or cloud upload is introduced.

**Knowledge navigation:** conversational commands can inspect a saved source by ID, traverse its connected relationships, and connect two existing sources with a typed relationship. These operations use the same shared knowledge service. Deletion and correction remain separately confirmed at the service boundary.

**Verification:** Stage 9 knowledge tests, architecture tests and the full core/web build passed on commit `7919e5ea7ca50fce4e97d80b0977fd43e4349491` (GitHub Actions run `42615519584`). Coverage includes approval gates, provenance, collision-safe deduplication, scoped search, relationships and multi-hop traversal, timeline, confirmed correction/deletion, shared runtime routes, local-only storage and architecture wiring.

**Stage 9 COMPLETE — 2026-11-09 (code and CI checkpoint):** the shared local-first knowledge service, shared Main/Pulse/voice runtime APIs, Knowledge Universe browse/search/edit/delete workspace, explicit Android picker review and cancellation handling, source provenance, all-12-family evidence, and focused regression tests are present. The current feature-branch core/architecture workflow passed on commit `2ce8cc4234867b1e226ccb8747a5d36a0f54dabe` (run `42619298502`), including dependency installation, blocking dependency audit, complete core/architecture tests (including both Stage 9 tests), and web production build. Physical Android picker behavior, actual document extraction on target devices, and device-level media analysis remain deferred and unverified. No binary media analysis or cloud upload is claimed.
