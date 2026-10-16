# AURORA — Master Project Agenda (Refreshed)

Last refreshed: 2026-10-16  
Repository: https://github.com/alwerioghenepeace563-jpg/AURORA-  
Live web app: https://aurora-ten-gold.vercel.app  
Native target: Infinix Smart 8, Android 13 Go Edition  
Working branch: `fix/native-app-launch-wake-word`

## Project rule

This is a continuity refresh, not a restart that discards work. Keep all working features, earlier build improvements, and accepted design decisions. Make changes against the current branch, run checks, and never label a feature "done" solely because code exists or a CI build passes. Mark device-dependent features complete only after a real phone test.

## Product vision

AURORA should feel like a personal assistant in the Alexa / Google Assistant category, not merely a website displayed in an APK. Keep the glowing central orb, polished dark sci-fi glass interface, fast chat, voice interaction, native Android integration, and a safe update path. The web app remains available while the Android app gains native capabilities.

## Carry-forward feature register

### A. Core experience and UI
- [x] Animated glowing orb and AURORA visual identity.
- [x] Home, Activities, AURORA chat, Profile, and bottom navigation.
- [x] Dark sci-fi / glassmorphism visual direction.
- [x] Personality choices: Friendly, Strict, Calm, Teacher, and Short & direct.
- [x] Message formatting, inline links, and selectable answer choices.
- [ ] Re-test every page on desktop and a small Android screen after each UI change.
- [ ] Confirm Profile opens correctly and page-specific conversations/history stay separate.
- [ ] Confirm app state, navigation, attachments, and settings remain usable after refresh/relaunch.
- [ ] Keep the orb as the main home focus; theme changes should cover the whole app, not only the orb.

### B. AI brain and server configuration
- [x] Central server-side chat route; API secrets must remain in Vercel environment variables and out of browser bundles / Git.
- [x] Provider fallback design for Groq, OpenRouter, and Gemini, including transient failures and rate limits.
- [x] Shared text-AI route used by the assistant tools.
- [x] Image/PDF requests have provider-capability-specific handling.
- [ ] Live-test all configured providers and fallback order with real requests.
- [ ] Confirm health/diagnostics never reveal secret keys.
- [ ] Verify every AI tool uses the same fallback route where appropriate.
- [ ] Confirm the Admin area alone exposes provider diagnostics; ordinary chat must not display provider identity.
- [ ] Keep provider/model names configurable and refresh defaults when a provider retires a model.
- [ ] Verify Vercel production environment variables and redeploy after server-side changes.

### C. Voice and conversation
- [x] Voice input/output controls exist in the app.
- [x] Native Android Text-to-Speech fallback has been added.
- [x] Speech-friendly conversion for maths and formatted answers has been added.
- [ ] Test microphone permission, speech recognition, spoken replies, interruption/stop, and repeat on the Infinix Smart 8.
- [ ] Check voice playback is audible and not silent after screen changes or app relaunch.
- [ ] Keep the preferred voice direction: natural, mature futuristic female voice; calm, polished British/international delivery, not robotic.
- [ ] Confirm the configured ElevenLabs environment-variable names match the server code before changing any key names.

### D. Tools and media
- [x] Calculator and common unit conversions.
- [x] Weather lookup integration.
- [x] Translation page exists; it previously needed a blank-page fix.
- [x] Quiz maker exists with a CBT-style, one-question-at-a-time interaction.
- [x] File/PDF and image input paths exist.
- [x] Camera, gallery, file picker, and AI personality tuner entry points exist.
- [ ] Re-test web search and news cards, including article images and opening links.
- [ ] Re-test camera, gallery, files, PDF summarisation, image understanding, and translation end-to-end.
- [ ] Confirm tool sessions/history do not bleed into the main chat or other tools.
- [ ] Confirm quiz choices, scoring, and next-question flow work on mobile.

### E. Android-native assistant
- [x] Capacitor Android project generation and APK workflow.
- [x] Native bridge foundation and bundled web UI (not a remote-site-only wrapper).
- [x] Native app-launching bridge, including WhatsApp.
- [x] Native screen-reading bridge and settings entry point.
- [x] Background assistant service / wake-word foundation is present in source.
- [x] In-app APK update download/install foundation is present in source.
- [ ] Test “Hey AURORA” wake phrase on the real device; confirm whether listening survives screen-off, backgrounding, and reboot.
- [ ] Do not promise always-on listening until Android background-microphone restrictions, battery settings, and service notifications are validated on-device.
- [ ] Test opening WhatsApp and other supported apps from a voice/action request.
- [ ] Test screen reading only after the user explicitly enables the required Android Accessibility permission.
- [ ] Reassess Accessibility permission and Play Protect warnings. Keep sensitive permissions off unless the related feature truly needs them; explain why each permission is requested.
- [ ] Test in-app update checks, download, permission prompt, installer handoff, and version display.
- [ ] Confirm APK launches without requiring login. Sign-in must be optional for ordinary use.
- [ ] Confirm admin access remains restricted to the verified account `alwerioghenepeace563@gmail.com`.

### F. Sign-in, profile, and admin
- [x] Google and Apple/email sign-in UI exists.
- [x] Guest mode is the default so an unauthenticated user can enter the app.
- [x] Admin navigation has an email check and authenticated-session check.
- [ ] Test guest mode from a clean install and after sign-out.
- [ ] Test Google sign-in, email sign-in, and account persistence only when auth is configured.
- [ ] Confirm the admin email check is enforced server-side for privileged API actions, not just hidden in the UI.
- [ ] Verify profile editing/settings persist correctly.

### G. Build, release, and QA
- [x] Android APK GitHub Actions workflow.
- [x] Web production build and Android debug APK build succeeded on commit `e18c8036769e1354a4938031b50e279504e44a54`.
- [x] Latest APK artifact: `AURORA-debug-APK`, artifact ID `12044920998`, run `38897328500`.
- [ ] Install that exact APK on the Infinix Smart 8 and test launch, sign-in bypass, chat, voice, navigation, permissions, and crash behaviour.
- [ ] Compare web build and APK feature parity before every release.
- [ ] Keep versionCode/versionName increasing for upgrade installs; test update-over-existing-install, not just clean install.
- [ ] Store release notes and test outcomes with each build.
- [ ] Do not claim device validation from CI success alone.

## Recent refresh commits
- `71e7a3e` — added this master agenda so previous decisions and remaining work stay visible.
- `0baa408` — removed duplicate native speech bridge declarations.
- `fca41fb` — cleaned up guest-mode auth-gate formatting.
- A new build for the cleanup commits still needs to be confirmed; the latest confirmed APK is from `e18c803`.

## Current known cleanup items
- [x] Removed duplicate `speakText` declarations in `src/lib/aurora-native.ts` (commit `0baa408`).
- [x] Cleaned up guest-mode auth-gate formatting (commit `fca41fb`).
- [ ] Revisit the parity checker: it currently checks that native feature strings exist, but does not prove those features work on a phone.
- [ ] Accessibility service registration is currently disabled in the APK workflow as a cautious test setting; screen reading will not be fully available unless this is deliberately re-enabled and tested.
- [ ] Diagnose separately whether “does not open” means Android refuses to install the APK, the installed app crashes, or the app opens to an unwanted sign-in screen. These are different failures and must not be treated as the same bug.

## Definition of done

A feature is marked **Done** only when:
1. its implementation is present,
2. the relevant automated build/check passes,
3. the real user flow has been tested where hardware or external services are involved, and
4. no existing accepted feature has regressed.

## Next execution order

1. Clean up the native bridge declarations and auth-gate formatting without removing functionality.
2. Rebuild and verify the web app and APK from the same commit.
3. Install the exact APK on the Infinix Smart 8 and classify any failure as install, launch/crash, login gate, permissions, or feature-specific.
4. Fix the confirmed failure before adding more features.
5. Run the feature register from top to bottom, recording test evidence and keeping this document updated.
