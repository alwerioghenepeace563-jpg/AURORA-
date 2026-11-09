# AURORA Master Technical Architecture & Implementation Specification

**Status:** Architecture baseline / implementation plan  
**Target:** Existing AURORA Android application  
**Primary branch:** `feature/aurora-pulse-profile-overlay`  
**Architecture decisions:** Hybrid memory; approval-based execution; built-in and third-party extensions.

## 1. Mission and non-negotiable principles

AURORA is a personal intelligence and Android interaction layer. It is not a replacement operating system and must not claim unrestricted access to Android or other apps. It coordinates capabilities exposed by Android, approved app integrations, and AURORA's own services through one consistent interface.

The existing Main app and AURORA Pulse must use the same capability registry, policy engine, memory services, action planner, execution runtime, and event history. They may have different user interfaces, but they must not implement separate versions of the same action.

Principles:

1. Preserve existing working features and provider integrations.
2. Android-first, with graceful feature detection by OS version, hardware, app availability, and permission state.
3. Local-first for essential operations; cloud services are optional enhancements.
4. Approval before consequential execution. A model response is never itself authorization.
5. Least privilege: request permissions only when a user invokes a feature that needs them.
6. Every action is typed, validated, attributable, auditable, cancellable where possible, and verified.
7. External extensions are sandboxed by declared capabilities and policy.
8. Offline fallback for essential local functions.
9. No hidden collection, covert recording, permission bypass, or access to protected data.
10. Feature availability must be reported honestly; unsupported means unsupported, not simulated success.

## 2. Existing project baseline and preservation map

The inspected feature branch contains a Vite/React application packaged for Android with Capacitor 7.4.3. The package scripts include web build, Android sync, Android feature checks, and core tests. React is the current UI framework.

### Existing files and responsibilities

| Existing path | Current responsibility | Required treatment |
|---|---|---|
| `src/App.jsx` | Main React application and major user-facing flows | Preserve and progressively extract modules; do not rewrite wholesale |
| `src/lib/aurora-native` | Native bridge wrapper imported by App | Keep as compatibility facade while moving to typed capability clients |
| `src/lib/aurora-tool-tree` | Existing tool execution/tree integration | Preserve behavior; adapt to action-plan interface |
| `android/app/src/main/java/com/aurora/assistant/MainActivity.java` | Capacitor BridgeActivity and plugin registration | Keep plugin registration; add new plugins incrementally |
| `AuroraAssistantPlugin.java` | Existing Capacitor native methods including speech and other native operations | Preserve method names and add versioned methods or adapters |
| `AuroraAssistantService.java` | Existing foreground microphone/assistant service | Preserve wake/voice behavior; review Android foreground-service restrictions |
| `AuroraAccessibilityService.java` | Screen text/accessibility support | Preserve opt-in behavior; minimize collection and never retain screen content by default |
| `AuroraVoiceInteractionService.java` and session service | Android voice-assistant integration | Preserve and test role/assistant selection flows |
| `AuroraOverlayService.java` | AURORA Pulse floating orb and panel | Preserve two separate glass surfaces and existing overlay behavior |
| `android/app/src/main/AndroidManifest.xml` | Native permissions, services, activities, package visibility | Audit every declaration; add permissions only alongside implemented features |
| `scripts/check-android-feature-parity.mjs` | Android feature parity check | Expand into capability/manifest parity validation |
| `scripts/test-aurora-core.cjs`, `test-aurora-tools.cjs`, `test-aurora-runtime.cjs` | Existing core tests | Keep and extend |
| `package.json` | Vite, React, Capacitor scripts/dependencies | Preserve current build path and scripts |

The project currently declares microphone, contacts, notifications, camera, overlay, internet, foreground-service permissions, and Android assistant/accessibility services. These declarations are not proof that every related feature is complete. Permission declarations must be checked against runtime flows and Google Play policy.

Existing product behavior to preserve includes AI chat/provider routing (Groq, OpenRouter, Gemini where configured), ElevenLabs speech with device TTS fallback, speech recognition, wake/background assistant foundations, app launching, Pulse, screen assistance, contacts/dialler, calendar, email, tasks, weather/search, account/guest behavior, Supabase/backend integration, and APK signing/update safeguards.

## 3. Target system architecture

Use a modular monolith for the Android client initially. Avoid premature microservices. Keep well-defined interfaces so services can later move to separate processes or cloud services when there is a measured need.

### Logical layers

1. **Experience layer**
   - Main app: chat, workspace, settings, capability centre, memory, workflows, history.
   - Pulse: Dynamic-Island-inspired orb, independent transparent chat surface, Tools icon opening capability cards directly, user-controlled opacity.
   - Shared UI state is synchronized through the event bus; Pulse is not a second assistant implementation.

2. **Conversation and intent layer**
   - Conversation manager.
   - Intent and entity extraction.
   - Context assembler.
   - Model/provider router.
   - Specialist-agent coordinator.
   - Response formatter and speech output.

3. **Intelligence and planning layer**
   - Memory retrieval and write proposals.
   - Context engine.
   - Plan builder.
   - Risk/policy evaluator.
   - Approval manager.
   - Workflow scheduler.
   - Recovery and verification planner.

4. **Universal Action Engine**
   - Capability registry.
   - Typed action contracts.
   - Permission/role checks.
   - Precondition checks.
   - Approval token validation.
   - Execution dispatcher.
   - Result normalization.
   - Postcondition verification.
   - Audit/event recording.

5. **Capability adapters**
   - Android native capabilities.
   - App intents and deep links.
   - Approved third-party connectors.
   - AURORA internal capabilities.
   - Optional cloud APIs.

6. **Data and infrastructure**
   - Local database and encrypted preferences.
   - Optional Supabase synchronization.
   - Secure credential storage.
   - Background work scheduler.
   - Diagnostics, telemetry with consent, and crash reporting.

### Shared runtime invariant

Every user-requested action, whether started from Main, Pulse, voice, notification action, or workflow, must enter the same pipeline:

`Input -> Context -> Intent -> Plan -> Policy -> Approval -> Execute -> Verify -> Report`

No UI component may call sensitive native functionality directly. UI components submit typed action requests to the shared runtime.

## 4. Recommended repository structure

Create new modules alongside existing code; migrate incrementally.

```text
src/
  app/
    AppShell/
    navigation/
    state/
  features/
    chat/
    pulse/
    capabilities/
    memory/
    workflows/
    device/
    communication/
    media/
    files/
    calendar/
    learning/
    creative/
    settings/
  core/
    contracts/
    action-engine/
    policy/
    approvals/
    planner/
    context/
    events/
    diagnostics/
    provider-router/
  services/
    memory/
    sync/
    notifications/
    scheduler/
  integrations/
    android/
    email/
    maps/
    media/
    extensions/
  lib/
    aurora-native/        # compatibility facade retained during migration
    aurora-tool-tree/     # compatibility adapter retained during migration
android/app/src/main/java/com/aurora/assistant/
  MainActivity.java
  AuroraAssistantPlugin.java
  services/
  capabilities/
  permissions/
  storage/
  media/
  notifications/
  automation/
  accessibility/
  pulse/
docs/architecture/
scripts/
```

Java is consistent with the existing native implementation. New native modules can remain Java unless a specific library or Android API makes Kotlin materially better. Do not convert the whole Android project merely for stylistic reasons.

## 5. Universal Action Engine contracts

Define stable, serializable TypeScript contracts in `src/core/contracts`. Native bridge methods should use equivalent JSON schemas and return structured results.

### Capability descriptor

```ts
type CapabilityAvailability =
  | "available"
  | "permission_required"
  | "role_required"
  | "app_required"
  | "offline_only"
  | "unsupported"
  | "temporarily_unavailable";

type RiskLevel = "low" | "moderate" | "high" | "critical";

interface CapabilityDescriptor {
  id: string;
  version: number;
  name: string;
  description: string;
  category: string;
  availability: CapabilityAvailability;
  risk: RiskLevel;
  requiredPermissions: string[];
  requiredRoles?: string[];
  supportedAndroid: { min: number; max?: number };
  inputSchema: object;
  outputSchema: object;
  supportsOffline: boolean;
  source: "builtin" | "extension";
}
```

### Action request and result

```ts
interface AuroraActionRequest {
  actionId: string;
  capabilityId: string;
  capabilityVersion: number;
  input: unknown;
  source: "main" | "pulse" | "voice" | "workflow" | "notification";
  conversationId?: string;
  requestedAt: number;
  userVisibleSummary: string;
}

interface AuroraActionResult {
  actionId: string;
  status: "succeeded" | "failed" | "cancelled" | "needs_approval" | "needs_permission" | "unsupported";
  output?: unknown;
  errorCode?: string;
  message: string;
  verification: "verified" | "unverified" | "failed" | "not_applicable";
  completedAt: number;
}
```

### Required execution sequence

1. Validate capability ID, version, input schema and source.
2. Confirm capability is installed and available on this device.
3. Check permission, Android role, app availability and service state.
4. Evaluate risk and data sensitivity.
5. Produce a human-readable action preview.
6. Obtain an explicit, scoped approval for actions requiring it.
7. Re-check permission and preconditions immediately before execution.
8. Execute through the adapter, not through model-generated arbitrary code.
9. Verify a postcondition where possible.
10. Store a minimal action receipt and show the real result.

Approval tokens must be short-lived, bound to the exact action, input hash, capability version and requesting surface. Editing an approved action invalidates the token. A model cannot issue or forge approval tokens.

## 6. Approval and autonomy policy

The selected default is approval-based execution.

| Action class | Default policy |
|---|---|
| Answering questions, summarising user-provided content | No execution approval |
| Reading a selected file or screen after permission is granted | User-initiated access; clear indication |
| Creating a local draft or note | Preview/approval before persistent write |
| Changing tasks, calendar or local records | Confirm before write |
| Sending email/SMS/message, posting content | Explicit confirmation immediately before send |
| Making calls or sharing location | Explicit confirmation |
| Purchases, payments, account/security changes | Do not automate; hand off to the provider/system's secure confirmation |
| Installing APKs, granting permissions, changing protected settings | Android system-mediated user action |
| Deleting or bulk-modifying data | Explicit confirmation with affected-item summary |

Never use accessibility to bypass an app's authentication, payment safeguards, CAPTCHA, protected workflows, or user confirmation.

## 7. Android native capability architecture

Keep the Capacitor bridge as the web-to-native boundary. Split the current large `AuroraAssistantPlugin.java` gradually into focused native components and register them from MainActivity. Retain the existing `AuroraNative` plugin as a backward-compatible facade until all callers have migrated.

### Native modules

| Module | Android mechanism | Notes |
|---|---|---|
| App launcher | PackageManager, launch intents, package visibility | Declare only necessary package queries |
| Speech input | SpeechRecognizer / existing service | Preserve current recognition events and permission callback |
| Speech output | Android TextToSpeech plus existing ElevenLabs provider | Provider fallback must not lose selected voice preference |
| Pulse overlay | WindowManager application overlay | Requires special overlay grant; preserve separate orb and panel |
| Accessibility | AccessibilityService | Explicit opt-in; disclose purpose; avoid broad event/text retention |
| Voice assistant | VoiceInteractionService/session | User must select AURORA as system assistant where supported |
| Contacts | Contacts Provider | Runtime permission; return only requested fields |
| Dialler | ACTION_DIAL | Prefer dialler handoff; do not place calls silently |
| Calendar | Calendar Provider or calendar intents | Request read/write separately; intent fallback |
| Email | ACTION_SENDTO/ACTION_SEND and approved providers | Draft by default; user sends from mail app |
| Notifications | NotificationListenerService | Special access screen; minimize content storage |
| Media | MediaSessionManager / MediaController / intents | Requires notification-listener access for broad session discovery; app-specific support varies |
| Files | Storage Access Framework / MediaStore | User-selected URI grants; avoid broad storage access |
| Camera | CameraX or system camera intent | Runtime permission and visible user action |
| Screen capture | MediaProjection | Per-session user consent; foreground service rules |
| Location | Fused Location Provider or platform location | Ask only when invoked; foreground/background distinctions |
| Device settings | Public Settings actions and supported APIs | Most protected settings require system UI |
| Background work | WorkManager | Deferrable jobs; foreground service only for user-noticeable ongoing work |

### Android version strategy

- Establish a tested minimum SDK from the existing Gradle configuration before changing it.
- Android 13 target: runtime notification permission, foreground-service type requirements, notification listener special access, overlay grant, and microphone background restrictions.
- Android 14/15+: validate foreground-service type/permission declarations, background activity launch restrictions, exact alarm policy, media projection consent, and notification behavior.
- Detect unsupported APIs at runtime and expose capability availability instead of crashing.
- Test on Infinix Smart 8 / Android 13 Go and Redmi A5 / Android 15 as named target devices.

Do not add all conceivable permissions to the manifest. Each permission needs a feature owner, rationale, runtime request path, denial state, and test.

## 8. Capability catalogue and implementation contracts

### 8.1 Media and entertainment
- Play/pause/skip/previous for active supported sessions.
- Read active session metadata when permitted.
- Launch installed music/video apps.
- Play user-selected local media.
- Search music catalog only through an authorized provider.
- Queue and playlist management only where the provider supports it.
- TTS reading and audiobook/podcast controls where supported.

### 8.2 Notifications and communication
- Notification listener with per-app filtering and opt-in.
- Summaries and importance grouping.
- Notification action replies only where the notification exposes a reply action.
- SMS only with the correct default role and policy compliance.
- WhatsApp and other messaging apps: use share/deep-link/app handoff or officially supported APIs; do not scrape private databases.
- Email draft creation via intents or authorized provider connectors.
- Contacts lookup with field minimization.
- Call preparation through ACTION_DIAL and confirmation.

### 8.3 Calendar, tasks and personal organisation
- Existing task system remains available.
- Local task repository and optional sync.
- Calendar event create/read through permissions or calendar intents.
- Alarm/timer handoff to system Clock; exact alarms only when justified and allowed.
- Reminders and recurring workflow scheduler.
- Daily briefing assembled from authorized data sources.

### 8.4 Files and knowledge
- User-selected documents, photos, audio and video.
- PDF/text extraction and supported office-document parsing.
- Search index with source URI, access grant, modification time and content hash.
- Local OCR and speech transcription where feasible.
- Summaries must link back to source documents.
- Deleting an indexed record must not delete the source file unless separately approved.

### 8.5 Camera and perception
- Camera capture via system camera or CameraX.
- OCR, QR/barcode, image understanding and document scan.
- Explicit visible capture state; no hidden recording.
- MediaProjection only after Android's consent prompt and while permitted.

### 8.6 Navigation and location
- Maps/search through supported map intents or configured APIs.
- Route handoff to the selected navigation app.
- Location permission only when a user-requested feature needs it.
- Avoid persistent background location unless a clearly justified feature and policy approval exist.

### 8.7 Device controls and diagnostics
- Device information, battery, storage and network diagnostics using public APIs.
- Open relevant Settings pages for Wi-Fi, Bluetooth, display, app permissions and accessibility.
- Flashlight via CameraManager where hardware/API allows.
- Brightness and volume only through permitted APIs or system controls.
- No claims of changing protected settings where Android requires user interaction.

### 8.8 Learning, creative and productivity
- Study tutor, flashcards, quizzes, revision planning.
- Writing, document and presentation assistance.
- Creative workflows and media editing handoff.
- User-controlled project spaces and timelines.
- Keep generation providers behind a provider router.

### 8.9 Specialist agents
Start with bounded internal specialists: Research, Writer, Study Tutor, Device Guide, Media, Calendar/Tasks, Files, Navigation and Creative. Specialists return structured proposals; they do not call native APIs directly. The Universal Action Engine remains the only execution path.

## 9. Memory architecture: hybrid

### Memory classes

1. **Session memory:** current conversation state; short-lived.
2. **Working memory:** active task/project context; local and expiring.
3. **User-approved long-term memory:** preferences and facts explicitly saved or confirmed.
4. **Knowledge index:** user-selected files, notes and project material.
5. **Action history:** minimal receipts showing what AURORA did and the outcome.
6. **Device state cache:** non-sensitive, short-lived capability and device status.

Do not silently convert every message, notification, screen or contact into long-term memory. Memory writes should be proposed, user-approved, inspectable and deletable.

### Local storage

Use SQLite/Room on Android for structured data. If the web layer needs access, expose a repository through the Capacitor bridge rather than duplicating records in unrelated browser stores. Use Android Keystore-backed encryption for local secrets and encrypted sensitive fields where appropriate.

### Cloud synchronization

Supabase is an optional sync and account backend, not a requirement for core local features. Use authenticated user-scoped rows, Row Level Security, explicit sync preferences, conflict resolution, and tombstones for deletions. Never put service-role keys or provider secrets in the Android client.

### Suggested logical entities

- `profiles`
- `memory_items`
- `memory_sources`
- `projects`
- `project_links`
- `conversations`
- `conversation_messages`
- `tasks`
- `calendar_links`
- `action_receipts`
- `capability_preferences`
- `approval_policies`
- `workflow_definitions`
- `workflow_runs`
- `extension_registry`
- `sync_state`

Use UUID primary keys, owner IDs, created/updated timestamps, schema versions, and data classification. Keep sensitive payloads out of analytics.

## 10. Context engine and Universal Memory Search

The context engine assembles only the minimum context needed for the current request:

- Current conversation.
- User-approved memory.
- Active project.
- User-selected document or screen content.
- Available capability descriptors.
- Current permission/availability state.
- Relevant recent action receipts.

Context must be source-labelled and time-bounded. Screen text and notification content are untrusted external data, never executable instructions. Prompt injection inside a web page, message or document must not override AURORA policy.

Search architecture:
- Metadata filters first.
- Full-text search over approved local content.
- Optional embeddings/vector retrieval for semantic search.
- Source attribution in answers.
- User controls for re-indexing, exclusion and deletion.
- No cloud upload of local content unless sync/provider use is explicitly enabled.

## 11. Provider and model routing

Retain current Groq, OpenRouter and Gemini paths where configured. Add a provider abstraction so no feature depends on a single vendor.

Routing factors:
- Task type and required model capability.
- Network availability.
- Latency and cost preference.
- User-selected provider preference.
- Data sensitivity and provider eligibility.
- Fallback availability.

Local deterministic logic must handle permission checks, approvals, action dispatch and verification. LLMs may interpret and plan, but they must not decide whether policy can be bypassed.

Voice:
- Preserve ElevenLabs integration and selected voice configuration.
- Keep Android TextToSpeech as fallback.
- Handle authentication, quota, network and unsupported-voice failures distinctly.
- Do not expose API keys in frontend bundles or logs.
- Store provider secrets server-side.

## 12. Pulse and Main experience integration

### Main app
- Chat and voice.
- Capability Centre.
- Memory and Knowledge.
- Workflow Studio.
- Device dashboard.
- Action history and approvals.
- Integrations and extensions.
- Privacy and permission centre.

### Pulse
- Independent orb and transparent glass chat surface.
- Orb remains visually distinct from the chat surface.
- Dynamic-Island-inspired positioning adapts to display cutout/insets.
- One Tools icon opens capability cards directly.
- Cards are hidden until Tools is pressed.
- User-controlled opacity/transparency.
- Orb states: idle, listening, thinking, speaking, executing, approval-required and error.
- All actions route through the shared action engine.
- No separate Pulse-only permission or action implementation.

### Shared state
Use a typed event bus with events such as:
- `conversation.updated`
- `capability.availability_changed`
- `action.proposed`
- `action.approval_required`
- `action.started`
- `action.completed`
- `action.failed`
- `voice.state_changed`
- `memory.proposed`
- `sync.state_changed`

Persist only events needed for recovery/audit; do not treat the event bus as a raw content logging system.

## 13. Workflow and automation engine

Workflow definitions must be declarative, versioned and constrained. No arbitrary generated JavaScript, shell commands, or unrestricted code execution.

A workflow consists of:
- Trigger: manual, user-approved schedule, or supported event.
- Input schema.
- Ordered steps.
- Preconditions.
- Required permissions.
- Approval checkpoints.
- Retry policy.
- Cancellation behavior.
- Verification conditions.
- Output summary.

Every workflow run receives a unique run ID and records each step's state. A failure stops dependent steps and explains what was completed. Destructive or external communication steps require fresh approval at execution time, not only when the workflow was created.

Use WorkManager for deferrable background work. Use foreground services only for user-visible ongoing work allowed by Android. Respect Doze, battery optimization, app standby and OS scheduling; never promise exact execution time where Android cannot guarantee it.

## 14. Extension platform

Support two extension types:

### Built-in capabilities
- Shipped with AURORA.
- Versioned and tested with the app.
- Can use approved native adapters.
- Must declare permissions and risk.

### External extensions
- Manifest with ID, publisher, version, description, requested capability scopes, input/output schemas and privacy disclosure.
- Signed package or trusted hosted definition.
- Permission review before activation.
- Sandboxed execution through a constrained API.
- No direct access to arbitrary files, native bridge internals, secrets or other extensions.
- Revocation and uninstall support.
- Compatibility checks and extension-specific tests.

Start with declarative integrations and server-side connectors. Do not execute arbitrary third-party code inside the app in the first release.

## 15. Security and privacy model

- Android Keystore for local encryption keys.
- HTTPS/TLS for all network traffic.
- Secrets held server-side or in secure platform storage.
- Supabase RLS for every user-owned table.
- Validate all inputs at both JS and native boundaries.
- Explicit consent for accessibility, notification listener, overlay, microphone, camera, location and media projection.
- Explain why special access is needed and link to the relevant Android settings screen.
- Show microphone/camera/recording status clearly.
- Redact tokens, message bodies, screen text and sensitive file content from logs.
- Rate-limit extension and workflow calls.
- Prevent replay of approval tokens.
- Audit sensitive actions without storing unnecessary content.
- Provide a privacy dashboard and clear-data/export controls.

## 16. Failure handling and reliability

Standard error categories:
- `PERMISSION_REQUIRED`
- `ROLE_REQUIRED`
- `APP_NOT_INSTALLED`
- `UNSUPPORTED_ANDROID_VERSION`
- `CAPABILITY_UNAVAILABLE`
- `NETWORK_UNAVAILABLE`
- `PROVIDER_AUTH_FAILED`
- `PROVIDER_QUOTA_EXCEEDED`
- `APP_HANDOFF_FAILED`
- `APPROVAL_REQUIRED`
- `APPROVAL_EXPIRED`
- `PRECONDITION_FAILED`
- `EXECUTION_FAILED`
- `VERIFICATION_FAILED`
- `CANCELLED`

Never show success until the native adapter reports success and verification is completed or explicitly marked unavailable. Use idempotency keys for repeatable writes. Do not blindly retry calls, messages, emails or purchases.

## 17. Testing and quality gates

### Preserve existing tests
Run:
- `npm run test:core`
- `npm run typecheck`
- `npm run build`
- `npm run android:check`
- Android Gradle debug build and APK signing verification.

### Add unit tests
- Intent parsing and plan validation.
- Capability registry.
- Schema validation.
- Policy and risk evaluation.
- Approval token binding/expiry.
- Provider routing and fallback.
- Memory access controls.
- Workflow state machine.
- Extension manifest validation.
- Event bus behavior.

### Add integration tests
- Main and Pulse invoke the same action.
- Permission denied, granted and revoked.
- App absent and present.
- Offline operation and recovery.
- Provider quota/auth errors.
- Notification listener disabled/enabled.
- Accessibility service disabled/enabled.
- Overlay permission disabled/enabled.
- Approval expiry and action mutation.
- Action failure and verification failure.
- Database migration and sync conflicts.

### Device test matrix
- Infinix Smart 8, Android 13 Go.
- Redmi A5, Android 15.
- At least one emulator for repeatable API-level tests.

Test low RAM, process death, screen rotation, background restrictions, battery saver, network loss and app upgrades.

### Release gates
A feature is not marked complete until:
1. UI and capability registry agree.
2. Permission path is tested.
3. Native implementation is tested on-device.
4. Approval policy is tested.
5. Failure states are visible.
6. Main and Pulse parity is verified.
7. Existing regression tests pass.
8. Signing certificate continuity is verified before publishing an update.

## 18. Incremental implementation roadmap

### Stage 0 — Baseline and protection
- Record current branch and commit.
- Run all existing tests and build.
- Inventory all native bridge methods and UI callers.
- Capture current APK signing certificate fingerprint.
- Add architecture documentation and migration checklist.
- No feature removal or broad refactor.

### Stage 1 — Shared capability foundation
- Add typed capability contracts.
- Implement registry and availability detection.
- Add action request/result model.
- Add policy evaluator and approval UI.
- Add execution receipts and verification.
- Wrap existing native methods in adapters.
- Keep old bridge calls working through compatibility facade.

### Stage 2 — Main/Pulse parity
- Route chat tool calls and Pulse actions through the same engine.
- Add shared event bus.
- Add capability centre and permission status.
- Preserve Pulse glass/orb design.
- Verify same capability IDs and results in both surfaces.

### Stage 3 — Android capability expansion
- Media sessions and playback.
- Notification listener and safe notification summaries.
- File picker and document handling.
- Calendar/task integration.
- Email draft handoff.
- Camera/OCR and location/map handoff.
- Device diagnostics and settings shortcuts.

### Stage 4 — Hybrid memory and context
- Local schema and migrations.
- User-approved memory writes.
- Knowledge indexing and source attribution.
- Optional Supabase sync and conflict handling.
- Privacy dashboard and deletion controls.

### Stage 5 — Workflow and specialist intelligence
- Declarative workflow engine.
- Specialist agents returning structured plans.
- Approval checkpoints and execution verification.
- WorkManager scheduling and recovery.
- Workflow simulation/preview.

### Stage 6 — Extension ecosystem
- Extension manifest and registry.
- Permission scopes and review UI.
- Sandboxed declarative integrations.
- Version compatibility and revocation.
- Developer documentation.

### Stage 7 — Experimental capabilities
- Adaptive task workspaces.
- Project timeline and knowledge graph.
- Cross-device continuity.
- Capability discovery.
- Simulation lab and new interaction models.

Each stage must be independently buildable and reversible. Do not start Stage 2 or later by deleting existing behavior.

## 19. Definition of done

The architecture is successfully established when:

- Main and Pulse share one capability registry and execution engine.
- Existing chat, voice, provider, overlay, screen, contact, calendar, email and task features remain functional.
- Permission and availability status is accurate.
- Sensitive actions cannot execute without valid approval.
- Every action returns a structured, truthful result.
- Hybrid memory works offline and synchronizes only when configured.
- Extensions cannot bypass the policy engine.
- New capabilities can be added without rewriting Main or Pulse.
- Android 13 Go and Android 15 target-device tests pass.
- APK signing continuity and existing release workflow remain intact.

## 20. Immediate next engineering tasks

1. Inventory all methods in `AuroraAssistantPlugin.java`, all JS callers in `src/App.jsx`, `src/lib/aurora-native`, and the existing tool tree.
2. Map each existing action to a capability ID without changing behavior.
3. Add TypeScript contracts, capability registry and action result types.
4. Add a compatibility adapter around existing native methods.
5. Route one low-risk existing action (for example app launch) through the new engine and test it from Main and Pulse.
6. Add approval preview for one write action (task creation) and verify that rejection causes no write.
7. Expand capability-by-capability, preserving regression tests at every step.

**Implementation rule:** Do not perform a mass rewrite of `src/App.jsx`, replace the current native plugin wholesale, change application ID, regenerate signing keys, remove existing provider configuration, or deploy directly to production as part of the architecture migration. Work on the existing feature branch, commit in small units, and use GitHub Actions to validate APK builds.


## 18. Implemented capability adapters (current branch)

The first native capability wave is registered in `src/core/aurora-capability-runtime.js` and exposed through `src/core/aurora-runtime.js`. These are internal services, not new pages.

| Capability ID | Purpose | Android handoff / policy |
|---|---|---|
| `android.open_app` | Launch an installed app | PackageManager launch intent |
| `android.read_screen` | Read visible screen text | Explicit Accessibility opt-in; approval required |
| `contacts.search` | Search saved contacts | Runtime Contacts permission |
| `communication.open_dialer` | Prepare a call | Opens dialler; user presses Call |
| `maps.search_place` | Find a place | Opens installed map app |
| `maps.get_directions` | Request directions | Opens map app with destination and travel mode |
| `calendar.prepare_event` | Prepare a calendar event | Opens Android calendar editor; user reviews and saves |
| `media.search_play` | Find/play media | Hands search to installed media app; no silent playback bypass |

Main chat and Pulse route through the shared runtime. Explicit map/directions and media-search phrases are routed to their native capability adapters; all other requests continue through the existing AURORA tool tree and provider path. The native bridge methods are added to the existing `AuroraAssistantPlugin` and TypeScript facade without replacing either.

### Adding the next tool

A new tool should normally require only:
1. A typed native or service adapter with honest availability checks.
2. A capability registration with stable ID, input validation, risk and approval policy.
3. A deterministic intent/tool schema so the assistant can invoke it with structured arguments.
4. A regression test for success, unavailable state, rejection and permission denial.

Do not create a page by default. Add UI only when the user needs to configure a service, review permissions/approvals, or interact with a result. Never let model-generated text directly invoke arbitrary Android intents or JavaScript; it must resolve to a registered capability.

## 19. User-selected file intelligence and command routing

The Android capability registry now includes `files.pick_document`. It invokes Android's Storage Access Framework document picker (`ACTION_OPEN_DOCUMENT`), so AURORA does not browse the device filesystem or request broad storage permission. The user chooses the exact document in Android's picker. The native adapter returns the display name, MIME type and content URI. It previews only plain-text, JSON and XML content, with a hard 1 MB limit; other file types are identified but not decoded as text. Cancellation is a normal result, not an error. A future document pipeline can add PDF/image extraction behind separate explicit user actions and bounded processing.

The shared runtime also routes explicit app-launch phrases through a fixed package allowlist (WhatsApp, Facebook, Chrome, YouTube and Android Settings). It never accepts arbitrary package identifiers from a model response. Explicit file/document requests open the system picker. Navigation and media phrases continue through their registered adapters. Chat, voice and Pulse should continue to call the same `auroraRuntime.routeMessage` entry point; these remain internal capabilities rather than new app pages.

**Privacy boundary:** the picker is the user's selection boundary. AURORA reads only the selected supported text file and returns its bounded text preview to the caller. No background scan, recursive file enumeration, or silent upload is performed by this adapter.

## 20. Notification intelligence, device status and expanded intent routing

The Android capability registry now includes:
- `notifications.open_access_settings`: opens Android's Notification Access settings; the user explicitly enables or disables access there.
- `notifications.read_recent`: requires Android Notification Access and AURORA's high-risk approval gate. The listener keeps at most 20 recent notification previews in app-local preferences; it excludes AURORA's own and ongoing notifications, limits text length, and does not upload or forward notification content to a server.
- `notifications.clear_recent`: approval-gated deletion of AURORA's local notification preview cache. This does not dismiss notifications from Android's notification shade.
- `device.get_status`: returns basic device model, Android SDK, battery percentage and charging state.
- `device.set_flashlight`: handles explicit on/off commands through CameraManager and requests Android camera permission before changing the torch.

The notification listener is protected by Android's `BIND_NOTIFICATION_LISTENER_SERVICE` permission. AURORA cannot silently grant itself notification access; the user must enable it in Android Settings. Revoking access in Settings stops new notification capture. The local cache can be cleared from AURORA.

The shared runtime also recognizes supported phrases for battery/device status, flashlight on/off, recent notifications, and calendar scheduling. Calendar phrases are accepted only when the date and 12-hour time are explicit (today, tomorrow, weekday, or ISO date); events are opened in Android's calendar editor and still require the user to review and save. The normal approval broker is used before sensitive notification reads and cache deletion.

These additions remain internal capabilities. They do not create new navigation pages, and they preserve the shared chat/voice/Pulse runtime.
