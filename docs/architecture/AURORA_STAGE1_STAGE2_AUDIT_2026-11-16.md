# AURORA Android foundation audit and repair
**Date:** 16 November 2026  
**Scope:** Stage 1 project audit and Stage 2 assistant foundation repairs  
**Repository:** `alwerioghenepeace563-jpg/AURORA-`

## Repository and build inventory

- Android application ID: `com.aurora.assistant`
- Android target SDK: 35; compile SDK: 35; minimum SDK: 23
- Android bridge: Capacitor 7
- Main native bridge: `AuroraAssistantPlugin.java`
- Foreground wake listener: `AuroraAssistantService.java`
- System assistant integration: `AuroraVoiceInteractionService` and `AuroraVoiceInteractionSessionService`
- Web/native bridge facade: `src/lib/aurora-native.ts`
- Primary assistant UI and voice conversation routing: `src/App.jsx`
- Android native bootstrap/parity guard: `scripts/patch-android-native.mjs` and `scripts/check-android-feature-parity.mjs`

## Audit findings

### Existing foundations retained

- The Capacitor Android project and registered native plugin already exist.
- Microphone permission requests, one-shot Android speech recognition, speech-result/error/status events, and Android TextToSpeech fallback are present.
- A user-started microphone foreground service, persistent notification Stop action, and wake-phrase detection are present.
- Android declares both VoiceInteractionService and VoiceInteractionSessionService, and the session opens the existing AURORA Pulse surface.
- The app already routes chat, Pulse and voice through shared runtime/tool services. Provider and backend routing were not replaced.
- Existing signing verification, updater logic, accessibility, app-launch, location, contacts and calendar adapters were left intact.

### Gaps identified and addressed in this branch

1. **One-shot speech recognizer lifecycle:** callbacks were not tied to a recognizer generation. A late callback from an old recognizer could interfere with a newer request. The bridge now guards callbacks by recognizer instance and generation, uses on-device recognition when Android reports it available, includes explicit request metadata/partial results, and clears the recognizer safely on completion or error.
2. **Speech status:** the bridge now emits explicit listening/hearing/processing/idle states and partial transcript events. Errors still carry Android's numeric code and a readable message.
3. **Text-to-speech initialization:** simultaneous speech requests could be rejected while Android TTS was initializing. Requests are now queued (bounded to five), then played when the engine and English voice are ready. Pending speech is rejected with a clear reason if initialization fails or playback is stopped.
4. **Wake listener reliability:** retries are now de-duplicated and use bounded backoff. The shared listening flag reflects the recognizer's ready state rather than merely the service process being alive. On-device speech recognition is selected when supported.
5. **Wake phrase hand-off:** Android may block an Activity launch from a background service. AURORA now leaves a tappable wake notification when the app is backgrounded; when the app is already foregrounded, its existing wake-event poll opens Pulse. The persistent notification still offers a visible Stop action while listening.
6. **Default assistant selection:** the app now exposes Android's official Assistant role request through `RoleManager.ROLE_ASSISTANT`, reports whether the role is supported/held, and offers a Profile control to request it. The user must approve Android's system selection screen.
7. **Status visibility:** the Profile assistant card refreshes native listening and assistant-role status periodically rather than relying only on the initial app load.

## Important platform boundaries

- “Hey AURORA” currently uses Android's configured SpeechRecognizer provider in a foreground microphone service. It is not a dedicated low-power DSP hotword engine, and recognition may use network services depending on the device/provider.
- Continuous microphone use is explicit opt-in, visibly notified, and stoppable. Android/OEM battery and background restrictions can still interrupt it.
- If AURORA is not the selected Android assistant, the wake listener can still open AURORA through its notification hand-off; the Android system assistant gesture is controlled by the system role.
- The voice session UI, role selection, microphone recognition and TTS require installation and device testing. Source-level checks cannot prove the device's installed recognition/TTS providers are available.

## Verification plan

- Run `npm run typecheck`, `npm run build`, `npm run android:check`, and the assistant/wake/spoken-output regression tests.
- Build the APK with the existing signing configuration; do not replace or bypass the signing certificate check.
- On a supported Android device, verify microphone permission, one-shot voice input, spoken fallback, wake listener start/stop, recognition-provider recovery, notification hand-off, and Android default-assistant role selection.
- Do not claim physical-device verification until those steps are actually performed.
