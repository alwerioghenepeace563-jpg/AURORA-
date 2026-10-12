# AURORA Web-to-Native Port — Four Batches

Source of truth: the existing React web app in `src/App.jsx` and `src/styles.css`. Keep the web app intact. Native work stays on `feat/true-native-android`.

## Batch 1 — Core interface and navigation
- [x] Native Kotlin/Jetpack Compose app shell
- [x] Dark sci-fi palette, animated cyan orb, AURORA brand header
- [x] Home, Activities, Jarvis and Profile bottom navigation
- [x] Native chat layout and basic message composer
- [x] Profile links to AI connection settings and app updates
- [ ] Fine visual comparison against the complete web UI and device screenshots

## Batch 2 — AI and voice
- [x] Initial text-chat request wired to the deployed web app's `/api/chat` endpoint
- [ ] Carry over the same user profile, active AI provider, schedules and attachment payloads
- [ ] Port chat session persistence and rich message rendering
- [ ] Voice input/output, wake phrase and native assistant service, with Android permissions and background restrictions handled correctly
- [ ] Native actions for supported apps and device features

## Batch 3 — Remaining screens and tools
- [ ] Port Profile fields and persistence
- [ ] Port Activities, schedules and conversation history
- [ ] Port tools, calculators, search, weather, image/document attachments and camera flows
- [ ] Port authentication and admin-only features with secure session handling
- [ ] Test each feature against its existing web counterpart

## Batch 4 — Updates and release
- [ ] Decide final application ID and preserve it for every release
- [ ] Configure private release signing securely (never commit the keystore or passwords)
- [ ] Choose an update feed reachable by installed apps without embedding a GitHub token
- [ ] Download APK updates and launch Android's user-approved package installer
- [ ] Verify version comparison, checksums/signatures, failed downloads and rollback guidance
- [ ] Build and test a signed release APK on a real Android device

## Current limitations
The app is not yet a full parity port. The current chat sends text and a small message history to `/api/chat`; it does not yet transfer all web-app profile/provider settings or voice/attachment functionality. The current update page only checks release metadata and can open a release page; it does not install updates yet.
