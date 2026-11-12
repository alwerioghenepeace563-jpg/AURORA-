# AURORA Master Technical Blueprint
**Version:** 1.0  
**Date:** 2026-11-09  
**Repository:** `alwerioghenepeace563-jpg/AURORA-`  
**Working branch:** `feature/aurora-pulse-profile-overlay`  
**Status:** Architecture and implementation specification. This document does not claim that proposed modules are already implemented.

---

## 1. Product definition

AURORA is a personal intelligence layer for Android: a shared assistant brain, capability system and adaptive interaction layer exposed through the full AURORA application and AURORA Pulse.

The product has three connected ambitions:

1. **Universal Android assistant:** perform supported actions across the device and installed apps.
2. **Personal intelligence system:** maintain user-controlled memory, understand context, organise knowledge and plan work.
3. **Expandable interaction platform:** support dynamic workspaces, specialist agents, reusable workflows and trusted extensions.

AURORA does not replace Android or bypass app security. It orchestrates capabilities that Android, the user, and connected services explicitly make available.

### Architectural decisions (approved)

| Decision | Selected design |
|---|---|
| Memory | Hybrid: local-first storage plus optional encrypted cloud synchronisation |
| Execution autonomy | Approval-first: present plans and request confirmation before meaningful actions |
| Extensions | Built-in AURORA capabilities plus a secure third-party extension system |
| Interfaces | AURORA Main and Pulse share one capability and intelligence layer |
| Device support | Capability detection; gracefully degrade on phones without specific hardware or APIs |

### Product principles

- One brain, multiple interfaces.
- No fake capabilities: every action reports verified status.
- Least privilege: request permissions only when a feature needs them.
- Approval-first execution; no silent sending, calling, sharing, purchasing, deleting or changing sensitive settings.
- Local functionality remains useful when offline.
- Cloud services are optional where practical.
- Existing features remain available during migration.
- Extensible by registration, not by scattering feature-specific code through the UI.

---

## 2. Existing repository baseline

The following items were inspected on the working branch before writing this specification.

### Existing foundations to preserve

| Existing component | Observed responsibility | Migration requirement |
|---|---|---|
| Capacitor 7 + React/Vite application | Main app shell and web/native boundary | Preserve current routes, auth, chat, voice, profile and existing UI |
| `AuroraAssistantPlugin.java` | Capacitor native bridge | Keep existing method names working while adding versioned capability APIs |
| `AuroraAssistantService.java` | Foreground microphone service and “Hey AURORA” wake phrase | Preserve opt-in wake listener, visible notification and stop control |
| `AuroraAccessibilityService.java` | Reads visible accessibility text from active windows | Preserve screen reading; add only narrow, user-approved actions |
| `AuroraOverlayService.java` | Separate orb and panel WebViews, overlay permission, app launch, calendar/email intents, contact search and dialler | Preserve the orb/panel split, cutout-aware positioning, app launcher, calendar/email launch, contact search and dialler |
| `aurora_pulse_orb.html` | Floating orb presentation and state animation | Keep it as a presentation surface; do not put business logic here |
| `aurora_pulse_panel.html` | Glass chat panel, tools, tasks, app list and API calls | Migrate its actions to the shared capability interface without removing current UI |
| `src/lib/aurora-native.ts` | TypeScript wrapper around Capacitor plugin | Retain backwards-compatible methods and introduce typed capability calls |
| `AndroidManifest.xml` | Current permissions and services | Add permissions only with a feature, disclosure, runtime request and tests |

### Important observed limitations

- The Pulse HTML currently calls the deployed chat/search/weather APIs directly and has its own native app-command handling. It also has a localStorage-backed task list. These are separate from a complete shared engine.
- Pulse weather currently expects a named city; its code explicitly says it does not yet share the main app GPS bridge.
- The overlay calendar and email actions open Android apps; they do not read or modify calendar records or send email in the background.
- Contact search and dialler actions exist in the overlay bridge. Opening the dialler asks the user to confirm the call.
- The accessibility service currently collects visible text; it is not a universal app-control API.
- The wake-word service uses Android SpeechRecognizer in a foreground microphone service. Its current status reports live real-time voice as disabled.
- The manifest currently includes microphone, contacts, notifications, camera, overlay, internet and package-install permissions. It does not currently declare a complete permissions set for SMS, calendar, location, call logs, notification-listener binding, media projection or broad file access.
- The current native updater checks the downloaded APK signing identity against the installed app before opening Android's installer. Preserve this safety check.

These are baseline observations, not test results. Each existing feature must be regression-tested on a physical phone before and after its migration.

---

## 3. Target system architecture

### 3.1 Logical layers

1. **Experience layer**
   - Main app: full assistant, capabilities centre, memory centre, workspaces, settings and history.
   - Pulse: orb, compact chat, quick actions, tools and contextual mini-panels.
   - Future surfaces: Android assistant entry point, shortcuts, widgets, notification actions and companion devices where supported.

2. **Conversation and intent layer**
   - Input normalisation for typed, speech, shared content and accessible screen context.
   - Intent classification and entity extraction.
   - Clarification when the request is ambiguous.
   - Context assembly using only authorised information.
   - Response rendering and spoken output.

3. **Intelligence orchestration layer**
   - Planner: creates explicit, ordered action plans.
   - Router: chooses local, cloud or specialist model based on capability, privacy, availability and cost.
   - Specialist agents: research, writing, media, learning, organisation, navigation and device support.
   - Memory retrieval and knowledge graph query.
   - Policy gate: checks permission, risk, user settings and confirmation.
   - Recovery: handles errors and proposes safe alternatives.
   - Verifier: checks actual outcome before reporting success.

4. **Universal Action Engine**
   - Capability registry.
   - Capability resolver.
   - Permission and availability resolver.
   - Typed action dispatcher.
   - Approval manager.
   - Execution journal.
   - Result verifier.
   - Cancellation and timeout manager.

5. **Capability adapters**
   - Android native APIs.
   - Android intents and system settings.
   - Accessibility service (narrow scope).
   - Notification listener (opt-in).
   - MediaSession and supported app integrations.
   - Files/Storage Access Framework.
   - Calendar and contacts providers.
   - AURORA backend APIs.
   - User-connected external services.
   - Approved extension packages.

6. **Data and infrastructure layer**
   - Encrypted local database.
   - Android Keystore-backed key management.
   - Optional Supabase synchronisation.
   - Backend API and model providers.
   - Diagnostics, consent records and audit events.

### 3.2 Shared request flow

```text
User request (Main / Pulse / voice / share / shortcut)
        |
        v
Input adapter -> Intent + entities + authorised context
        |
        v
Planner -> ordered proposed actions
        |
        v
Policy and permission gate
        |
        +---- needs clarification/permission/approval ---> Ask user
        |
        v
Capability resolver -> supported adapter
        |
        v
Execute one approved step at a time
        |
        v
Verify result -> record action -> continue or recover
        |
        v
Shared response -> Main / Pulse / speech
```

The engine must not equate “API call returned” with “user's requested outcome happened.” For example, launching an email composer means “composer opened,” not “email sent.”

---

## 4. Proposed source-code structure

Keep current paths during the first migration. Add the following modules incrementally; do not move or rename existing files in the first implementation pass.

```text
src/
  aurora/
    contracts/
      capability.ts
      action.ts
      permission.ts
      approval.ts
      memory.ts
      event.ts
    engine/
      AuroraEngine.ts
      IntentResolver.ts
      ContextAssembler.ts
      Planner.ts
      CapabilityRegistry.ts
      CapabilityResolver.ts
      ActionDispatcher.ts
      ApprovalManager.ts
      ActionVerifier.ts
      RecoveryManager.ts
      ExecutionJournal.ts
      ModelRouter.ts
    capabilities/
      apps/
      media/
      notifications/
      contacts/
      calendar/
      files/
      screen/
      location/
      device/
      communication/
      learning/
      creative/
    memory/
      MemoryRepository.ts
      LocalMemoryStore.ts
      CloudMemorySync.ts
      MemoryEncryption.ts
      KnowledgeIndexer.ts
      RetentionManager.ts
    workflows/
      WorkflowDefinition.ts
      WorkflowRunner.ts
      WorkflowValidator.ts
    extensions/
      ExtensionManifest.ts
      ExtensionRegistry.ts
      ExtensionSandbox.ts
      ExtensionPermissionGate.ts
    adapters/
      main/
      pulse/
      voice/
      share/
      shortcut/
    security/
      PolicyEngine.ts
      PermissionCatalog.ts
      ConsentRepository.ts
      Redaction.ts
    observability/
      Diagnostics.ts
      CapabilityHealth.ts
      EventTelemetry.ts
  lib/
    aurora-native.ts        # existing bridge; preserve compatibility
    aurora-api.ts           # proposed shared API client
    aurora-tool-tree.ts     # retain if present under actual repo path

android/app/src/main/java/com/aurora/assistant/
  MainActivity.java
  AuroraAssistantPlugin.java
  AuroraAssistantService.java
  AuroraAccessibilityService.java
  AuroraOverlayService.java
  capabilities/
    CapabilityContract.java
    AndroidCapabilityRegistry.java
    AppLaunchCapability.java
    MediaCapability.java
    NotificationCapability.java
    CalendarCapability.java
    ContactsCapability.java
    FilePickerCapability.java
    DeviceSettingsCapability.java
  security/
    PermissionCoordinator.java
    ApprovalActivity.java
    NativeActionJournal.java
  storage/
    LocalDatabase.java
    SecureKeyManager.java

android/app/src/main/assets/
  aurora_pulse_orb.html
  aurora_pulse_panel.html

docs/
  AURORA_MASTER_TECHNICAL_BLUEPRINT.md
  ADR/
  capability-matrix.md
  permission-matrix.md
  threat-model.md
```

The TypeScript engine owns product logic and shared plans. Native Android adapters own platform APIs and must return structured results. Pulse HTML must become a thin presentation client; it must not maintain a second copy of command routing or security policy.

---

## 5. Core contracts

These are target contracts. Implementations should be added with strict TypeScript settings and unit tests.

### 5.1 Capability contract

```ts
export type CapabilityAvailability =
  | "available"
  | "permission_required"
  | "user_action_required"
  | "unsupported"
  | "offline_only"
  | "temporarily_unavailable";

export type CapabilityRisk = "low" | "medium" | "high" | "critical";

export interface CapabilityDescriptor {
  id: string;
  version: number;
  name: string;
  description: string;
  category: string;
  availability: CapabilityAvailability;
  risk: CapabilityRisk;
  requiredPermissions: string[];
  supportedPlatforms: string[];
  offlineSupported: boolean;
  inputSchema: unknown;
  outputSchema: unknown;
}

export interface CapabilityAdapter<TInput = unknown, TOutput = unknown> {
  describe(): CapabilityDescriptor;
  checkAvailability(): Promise<CapabilityAvailability>;
  validate(input: TInput): Promise<void>;
  execute(input: TInput, context: ActionContext): Promise<CapabilityResult<TOutput>>;
  verify?(result: CapabilityResult<TOutput>, context: ActionContext): Promise<VerificationResult>;
}
```

### 5.2 Structured action result

Every adapter returns a typed result. Never return success merely because no exception was thrown.

```ts
export interface CapabilityResult<T = unknown> {
  status: "succeeded" | "launched" | "needs_user_action" |
          "permission_required" | "unsupported" | "failed" | "cancelled";
  data?: T;
  message: string;
  verification: "verified" | "unverified" | "not_applicable";
  retryable: boolean;
  errorCode?: string;
}
```

### 5.3 Approval-first action model

Every planned action carries:

- Action ID and originating request ID.
- Capability ID and validated input.
- Plain-language explanation.
- Risk category.
- Data to be read or changed.
- Target app/service.
- Whether the action is reversible.
- Required permission and confirmation.
- Expiry time and cancellation state.

Approval must be bound to the exact action payload. If the payload changes after approval, request approval again.

**Default policy:**
- Read-only, low-risk actions: may run after permission and user settings allow them.
- Actions that alter local records or create content: show a preview and ask before committing.
- External communication, calls, sharing, deletion, purchases, security changes and irreversible actions: explicit confirmation immediately before execution.
- Critical or prohibited actions: never available as an extension workaround.

The user selected approval-first autonomy. There is no silent background mode for consequential actions.

---

## 6. Capability catalogue and implementation order

Each capability is independently discoverable and exposes its current availability.

### Tier 1 — Preserve and consolidate existing capabilities

1. Launch installed apps.
2. Read accessible screen text.
3. Speech recognition and typed chat.
4. Opt-in “Hey AURORA” foreground listener.
5. Pulse orb and glass panel.
6. Pulse tasks.
7. Open calendar app.
8. Open email composer.
9. Search contacts (permission-gated).
10. Open dialler (user confirms call).
11. Web search and weather API integration.
12. Maps deep links.
13. In-app update flow with package and signing verification.

First milestone: these capabilities are called through one shared registry, with Main and Pulse producing the same action plan and result.

### Tier 2 — Everyday Android capabilities

- Share receiver for text, URLs, images and documents.
- Document and media picker through Storage Access Framework.
- Media controls for active sessions using MediaSession.
- Notification summaries through explicit notification-listener opt-in.
- Calendar event read/create/update using calendar provider permissions and confirmation.
- Contacts lookup and contact selection.
- Camera capture and QR/barcode scanning.
- Location lookup while in use, with explicit permission.
- Flashlight and supported device settings.
- Clipboard access only through clear user action and Android restrictions.
- Timers, alarms and reminders using appropriate intents or APIs.
- Local notes and task database shared between Main and Pulse.

### Tier 3 — Communication and productivity integrations

- Email provider integrations through user-authorised OAuth/API scopes.
- Draft email with recipients, subject, body and attachments.
- SMS features only if platform roles, permissions and store policies permit; otherwise open the default messaging app with a prefilled draft.
- Supported messaging app share intents and deep links.
- File search and document indexing for user-selected folders.
- Audio recording/transcription with visible recording state and consent.
- Screen capture only through MediaProjection's user-approved session.
- Printing, casting and device handoff through Android-supported flows.
- Smart-home integrations through authorised provider APIs.

### Tier 4 — Intelligence capabilities

- Hybrid memory and cross-device sync.
- Searchable personal knowledge base.
- Project and life timeline.
- Context-aware suggestions.
- Multi-step workflows with previews and rollback where possible.
- Specialist agents.
- Learning and creative workspaces.
- Workflow simulation and diagnostics.
- Extension registry and developer SDK.

### Tier 5 — Experimental research

- Adaptive task-specific UI generation.
- Multi-agent parallel analysis.
- Personal knowledge graph.
- Cross-device continuity.
- Local model routing and on-device inference where device capacity allows.
- User-defined sensors and compatible IoT integrations.

---

## 7. Hybrid memory architecture

### 7.1 Data classes

| Class | Examples | Default storage |
|---|---|---|
| Ephemeral context | Current prompt, temporary screen excerpt | Memory only; discard after task unless saved |
| User notes | Explicitly saved facts, notes and preferences | Encrypted local database; optional sync |
| Project knowledge | Documents, links, summaries, task relationships | Local index; optional encrypted sync |
| Action history | Action type, outcome, timestamp, approval | Local audit store; sync setting controlled by user |
| Sensitive data | Contact details, private documents, tokens | Avoid storing unless essential; encrypt and minimise |
| Model cache | Temporary response/cache data | Local, bounded retention |

### 7.2 Local storage

Use Room/SQLite for structured Android records, or a compatible encrypted SQLite implementation after dependency and build validation. Protect encryption keys with Android Keystore. Do not hard-code keys in the app or store raw provider secrets in the client.

Suggested tables:

- `memory_items`: id, type, title, content_ref, sensitivity, created_at, updated_at, expires_at, sync_state.
- `memory_links`: source_id, target_id, relation_type, confidence.
- `projects`: id, name, description, status, timestamps.
- `project_items`: project_id, item_id, relation.
- `action_records`: id, request_id, capability_id, status, approval_id, started_at, completed_at, result_summary.
- `consents`: id, permission_scope, purpose, granted_at, revoked_at.
- `sync_state`: item_id, version, server_version, last_sync_at, conflict_state.

Sensitive payloads should be encrypted separately; database encryption alone is not a reason to retain unnecessary personal information.

### 7.3 Optional cloud sync

- Use the existing Supabase project only after reviewing current schema, RLS policies and auth flows.
- Cloud sync is opt-in and per data class.
- Use authenticated user identity and row-level security on every user-owned record.
- Never put Supabase service-role keys or provider secrets in Android/web client bundles.
- Use versioned records, tombstones and conflict resolution.
- For end-to-end encrypted categories, encrypt on-device before upload; cloud should not need plaintext.
- Provide pause sync, export, delete cloud copy and local-only controls.
- Do not sync transient screen contents, raw notification bodies or sensitive data by default.

### 7.4 Memory lifecycle

1. Capture only when user asks to remember or has enabled a clearly described memory feature.
2. Classify and redact sensitive fields.
3. Ask before saving ambiguous or sensitive content.
4. Store locally with provenance and retention metadata.
5. Sync only if the user enabled that data category.
6. Retrieve only relevant memories and show provenance when useful.
7. Support correction, expiry, export and deletion.

---

## 8. Android native capability and permission matrix

Permissions are not a blanket onboarding checklist. Request them just in time, explain why, and offer a useful path when declined.

| Feature | Android mechanism | Permission / user step | Notes |
|---|---|---|---|
| Microphone and speech | SpeechRecognizer / foreground service | RECORD_AUDIO; foreground service notification | Background microphone use is OS-restricted; keep listener opt-in and visible |
| Floating Pulse | WindowManager overlay | ACTION_MANAGE_OVERLAY_PERMISSION | Preserve current explicit overlay flow |
| Screen reading | AccessibilityService | User enables service in Settings | Explain scope; never capture password/payment fields or bypass app protections |
| Notifications | NotificationListenerService | User grants notification access in Settings | Read only what is necessary; notification text may be sensitive |
| Contacts | Contacts Provider | READ_CONTACTS; WRITE_CONTACTS only if needed | Current contacts lookup must remain permission-gated |
| Calendar | Calendar Provider or intents | READ_CALENDAR / WRITE_CALENDAR if direct access is added | Current implementation only opens calendar app |
| Location | Fused Location Provider / platform APIs | Coarse/fine runtime permission; background only if justified | Prefer foreground location; no silent tracking |
| Camera | CameraX / camera intent | CAMERA | Visible capture state and explicit user initiation |
| Files | Storage Access Framework | User selects files/folders | Avoid broad storage permission |
| Media | MediaSession / MediaStore / picker | Depends on operation and Android version | Prefer picker and active media-session controls |
| Phone calls | ACTION_DIAL / telecom APIs | Dialler handoff; CALL_PHONE only if justified | Default is dialler handoff, user confirms |
| SMS | SMS intents / role APIs | SMS permissions and default SMS role where applicable | Strong Play policy and role restrictions |
| Screen recording | MediaProjection | Per-session system consent | Never record invisibly |
| Bluetooth | Companion Device Manager / Bluetooth APIs | Version-dependent nearby-device permissions | Do not assume all device toggles are directly writable |
| Wi-Fi / hotspot | Settings panels / permitted APIs | OS restrictions vary | Open system UI when direct control is blocked |
| App discovery | PackageManager | Package visibility declarations | Avoid QUERY_ALL_PACKAGES unless justified and policy-compliant |
| Install updates | PackageInstaller / FileProvider | Unknown-app install consent where needed | Preserve trusted source and signing-identity verification |

Also audit the existing manifest: remove duplicate/misaligned formatting, declare only required permissions, add appropriate `uses-feature` declarations, and test Android 13 Go and Android 15 behavior.

---

## 9. Pulse and Main integration

### 9.1 One shared client

Create a TypeScript client such as `AuroraEngineClient` used by both surfaces:

- `submitRequest(input)`
- `getCapabilities()`
- `getCapabilityStatus(id)`
- `previewPlan(planId)`
- `approveAction(actionId, approvalToken)`
- `cancelAction(actionId)`
- `getActionStatus(requestId)`
- `subscribeToEvents(listener)`

The client should call the same in-process engine in the main app. Pulse should use a narrow native bridge to submit requests and receive results/events; the bridge must not expose arbitrary reflection, shell execution, filesystem access or unrestricted method dispatch.

### 9.2 Pulse-specific responsibilities

- Render orb states: idle, listening, thinking, awaiting approval, executing, speaking, error.
- Display compact plan previews and approval prompts.
- Open capability cards only when requested.
- Keep glass opacity and placement preferences.
- Route tasks and app actions through shared storage/engine.
- Avoid direct duplicated routing to chat/weather/search endpoints once the shared API client exists.

### 9.3 Main-app responsibilities

- Full conversation and workspace UI.
- Capabilities Centre with availability and permission state.
- Memory Centre and sync controls.
- Workflow builder and history.
- Approval inbox for multi-step plans.
- Extension manager.
- Diagnostics and privacy dashboard.

### 9.4 Shared task storage

Migrate Pulse localStorage tasks to a repository abstraction. Initial implementation may use local persistence shared through the native layer; later use the same local database as Main. Migrate existing tasks without loss and keep a one-time rollback path.

---

## 10. Workflow engine

A workflow is a declarative sequence of typed actions, not arbitrary JavaScript.

Example:

```json
{
  "id": "prepare-study-session",
  "version": 1,
  "title": "Prepare a study session",
  "steps": [
    { "capability": "memory.search", "input": { "query": "current study project" } },
    { "capability": "files.pick", "input": { "kind": "document" } },
    { "capability": "learning.create_plan", "input": { "durationMinutes": 45 } },
    { "capability": "tasks.create", "input": { "source": "approved-plan" } }
  ],
  "approval": "preview_before_writes"
}
```

Required features:
- Input and output schemas.
- Dependency graph and step conditions.
- Preview of reads/writes and external side effects.
- Approval token bound to a plan hash.
- Per-step timeout and cancellation.
- Idempotency keys for retryable operations.
- Execution journal and verified outcomes.
- Compensation/undo only where an adapter explicitly supports it.
- No hidden loops, persistence or background scheduling without explicit configuration.

---

## 11. Extension platform

### 11.1 Extension manifest

Each extension declares:
- Stable ID, publisher, version and signature.
- Requested capability scopes.
- Input/output schemas.
- Network destinations.
- Data retention behavior.
- Offline behavior.
- Risk classification.
- Privacy disclosure and support contact.
- Minimum AURORA and Android versions.

### 11.2 Security model

- Extensions cannot receive unrestricted Android bridge access.
- Run extension logic in a constrained web/runtime sandbox.
- Use capability-scoped, short-lived tokens.
- Require user approval for new scopes and high-risk actions.
- Validate all inputs and outputs against schemas.
- Restrict network destinations and disclose external data transfers.
- Sign and verify extension packages/updates.
- Revoke extension access immediately when disabled.
- Maintain extension-specific audit records.
- No extension may bypass AURORA's approval policy or Android permission model.

Initial extension SDK should expose safe actions such as search, summarise, create a draft and open an approved intent. Native privileged extensions require a separate review and distribution process.

---

## 12. Backend and model routing

### Backend responsibilities

- Authenticated chat and tool orchestration.
- Provider key custody and rate limiting.
- Search/weather and other server integrations.
- Optional memory sync endpoints.
- Extension catalogue metadata.
- Diagnostics that exclude message contents by default.

### Model router

Choose a model based on:
- Required task capability.
- User privacy settings.
- Whether network is available.
- Device capability and battery/thermal state.
- Latency and token budget.
- Provider availability.

Fallback must be explicit. If cloud AI fails, AURORA can still provide deterministic local commands and cached/local functions. It must not pretend an offline model performed a cloud-only task.

### API conventions

- Version all endpoints.
- Validate request schemas server-side.
- Authenticate every user-specific operation.
- Apply per-user quotas and abuse limits.
- Keep secrets server-side.
- Return structured status and error codes.
- Avoid logging raw message content unless explicitly required and consented.

---

## 13. Security, privacy and safety requirements

1. Least-privilege permissions and just-in-time requests.
2. Android Keystore for local key protection.
3. No API keys, refresh tokens or service-role credentials in client code.
4. Explicit consent for memory, sync, notification access, accessibility and background microphone use.
5. Redact passwords, OTPs, payment details and sensitive accessibility nodes.
6. No actions that circumvent authentication, app security, payment approval or device-owner restrictions.
7. Approval for external communication, deletion, purchases, sharing, calls and security changes.
8. Visible recording/microphone state and persistent foreground notification when required.
9. Local audit history with clear user controls.
10. Safe extension sandbox and capability-scoped tokens.
11. Secure update source validation and signing-certificate continuity.
12. Account deletion and cloud-data deletion workflows.
13. Minimise telemetry; diagnostics should not contain personal content by default.
14. Guest mode must not silently sync or retain user data beyond its disclosed scope.

---

## 14. Reliability and observability

Every capability reports:
- Registered / unavailable / permission required.
- Last successful check.
- Last error code.
- Device/API compatibility.
- Whether offline execution is possible.
- Whether outcome verification is supported.

Diagnostics should answer:
- Which step failed?
- Was the failure due to permission, OS restriction, missing app, network or provider?
- Was any partial action completed?
- Is retry safe?
- Does the user need to do something?

Never retry non-idempotent actions automatically. For example, do not resend an email or repeat a purchase because a response timed out.

---

## 15. Testing and acceptance criteria

### Unit tests

- Intent parsing and ambiguity.
- Capability registration and discovery.
- Permission and policy decisions.
- Approval-token binding and expiry.
- Workflow validation.
- Memory retention and redaction.
- Sync conflict resolution.
- Action verification and retry safety.
- Extension manifest and scope validation.

### Android integration tests

- App launch and package visibility.
- Overlay permission granted/denied.
- Orb and panel lifecycle, rotation and cutout placement.
- Keyboard/composer behavior.
- Microphone permission, foreground notification and stop behavior.
- Accessibility enabled/disabled and screen content handling.
- Contacts permission and search.
- Calendar/email/dialler intents.
- File picker and URI permission lifetime.
- Notification listener opt-in/revocation.
- MediaSession behavior with supported and unsupported apps.
- Update download, package identity and signature mismatch.

### Device matrix

Minimum:
- Android 13 Go class device (low RAM and limited storage).
- Android 15 device.
- Small display and camera cutout.
- Offline mode.
- Restricted battery/background settings.
- Permission denied and later granted.
- Low storage and network interruption.

### Acceptance gates

A phase is not complete until:
- Existing features still work.
- Main and Pulse produce consistent action outcomes.
- No permission is requested before feature use.
- Denied permissions produce a useful alternative.
- Every consequential action has an approval record.
- Success is reported only after the appropriate verification.
- Offline behavior is accurately labelled.
- Build, typecheck, core tests and Android checks pass.
- A physical-device test is recorded for relevant native features.

---

## 16. Implementation roadmap

### Phase 0 — Baseline and regression safety
- Record current branch, build configuration and working APK identity.
- Add tests for current native methods and Pulse behaviors.
- Document current API endpoints and Supabase schema/RLS before changing backend data.
- Keep current feature files and bridge methods intact.

### Phase 1 — Shared Universal Action Engine
- Add contracts and capability registry.
- Wrap existing app launch, screen read, contacts, dialler, calendar, email, tasks, weather, search and maps as adapters.
- Add action planner, approval manager, execution journal and verifier.
- Add shared TypeScript client.
- Replace Pulse-specific command routing gradually, preserving fallback until parity tests pass.

### Phase 2 — Permissions and Android adapters
- Build permission catalogue and permission-status centre.
- Add file picker, share receiver, location-in-use, media session and notification listener as separate opt-in adapters.
- Add calendar provider operations only after permission and approval UX is ready.
- Add capability availability detection for device/API variations.

### Phase 3 — Hybrid memory
- Implement local encrypted storage and memory lifecycle.
- Add user controls for save/search/export/delete.
- Review Supabase auth, schema and RLS.
- Add optional encrypted sync, conflict handling and offline queue.
- Migrate existing Pulse tasks safely.

### Phase 4 — Context and knowledge
- Add project graph, document index and timeline.
- Add context assembler with strict source permissions.
- Add user-configurable proactive suggestions.

### Phase 5 — Workflow and specialist agents
- Add declarative workflow builder and preview.
- Add specialist agents as orchestrated tools, not independent privileged processes.
- Add simulation, cancellation, recovery and action replay prevention.

### Phase 6 — Extension ecosystem
- Publish extension manifest specification and SDK.
- Implement sandbox and scope-based tokens.
- Add extension review, signing, updates and revocation.
- Open a controlled catalogue.

### Phase 7 — Adaptive and multi-device experiences
- Dynamic workspaces and adaptive UI.
- Companion-device authentication and continuity.
- Experimental local models and multimodal device intelligence.

---

## 17. First implementation milestone: Definition of Done

The first code milestone should not attempt to add every feature. It should prove that the existing capabilities can use one engine.

**Required deliverables:**
1. Typed capability/action contracts.
2. Capability registry and resolver.
3. Approval-first policy manager.
4. Action journal and structured verification results.
5. Adapters for the existing app launch, screen read, contacts, dialler, calendar, email, Pulse tasks, search, weather and maps actions.
6. Main app client and a narrow Pulse bridge using the same request/result contract.
7. Unit tests and feature-parity checks.
8. Documentation of unsupported/permission-required states.

**Pass condition:** The same request made from Main and Pulse resolves to the same capability, permission decision, approval requirement and verified result, while all current user-facing features remain available.

---

## 18. Explicit non-goals

AURORA will not:
- Bypass Android permission prompts or another app's security.
- Read protected app databases or private messages without an authorised API/role.
- Record audio/video invisibly.
- send messages, make calls, share files, purchase items or delete data without the configured approval.
- Promise control of Wi-Fi, Bluetooth, hotspot, system settings or other apps where Android blocks it.
- Use accessibility as a way to defeat security controls.
- Execute arbitrary third-party extension code with the full native bridge.
- Claim an action succeeded without verification.

---

## 19. Architecture decision record

**ADR-001: One shared engine for Main and Pulse**  
Accepted. Both surfaces call the same engine and capability contracts.

**ADR-002: Hybrid memory**  
Accepted. Local-first, encrypted storage; optional per-category cloud sync; no default sync of sensitive transient data.

**ADR-003: Approval-first execution**  
Accepted. Plans are previewed and meaningful actions require user approval. External and irreversible actions require immediate confirmation.

**ADR-004: Built-in and third-party extensions**  
Accepted. Extensions are sandboxed and capability-scoped; no unrestricted native access.

**ADR-005: Preserve existing native bridge during migration**  
Accepted. Existing Capacitor methods remain compatible until their replacement adapters pass parity tests.

**ADR-006: Capability-driven Android support**  
Accepted. Runtime capability detection determines what is supported on each device and Android version.

---

## 20. Immediate next engineering task

Implement **Phase 0 + Phase 1 only**, on the existing feature branch, without modifying signing keys, production deployment settings, existing auth flows or unrelated UI. First inspect the current test suite and API/data contracts. Then add the engine beside the existing code, wrap current features, and migrate one entry point at a time. Do not remove the old path until parity tests pass.

This document is the design authority for subsequent AURORA implementation work; code changes must update it when an architecture decision changes.
