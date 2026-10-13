# AURORA native Android assistant roadmap

This repository keeps the existing React/Vite AURORA interface and adds native Android capabilities alongside it. The APK workflow generates the Capacitor Android project and then applies the native bridge sources.

## Implemented in the first native foundation
- Capacitor bridge named `AuroraNative`.
- Explicit start/stop controls for a visible Android foreground service.
- Persistent notification while that service is running.
- Native launch of installed apps by package name, including WhatsApp.
- A shortcut to Android Accessibility settings for a future user-enabled screen/action service.
- Status API that explicitly reports that wake-word and real-time voice are not yet enabled.

## Not yet implemented
- An always-on "Hey AURORA" detector. This requires a tested wake-word engine, microphone permission, a user-visible activation flow, and Android-version/device-specific background testing.
- A real-time streaming voice session. Current text chat and generated speech are not the same as a duplex live audio session.
- An AccessibilityService for reading accessible UI text and performing user-authorized actions. It must be declared, explained, and manually enabled by the user in Android settings.
- Default digital assistant / assistant role integration and lock-screen behavior.
- Secure account/session handling for native actions.

## Build
The GitHub Actions workflow runs `scripts/patch-android-native.mjs` after `npx cap add android`, so generated Android files do not need to be committed. After installing the APK, test the native bridge before enabling background behavior. Do not describe the first service foundation as an active wake-word listener.
