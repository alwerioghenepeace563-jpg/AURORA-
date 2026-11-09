# AURORA privacy and native foundations

This document describes the opt-in native foundations added to the existing AURORA Android app.

## Android secure storage

- `AuroraSecureStoragePlugin` exposes a small Capacitor bridge for set/get/remove.
- Values are encrypted with AES-GCM; the AES key is generated and held by Android Keystore.
- Ciphertext is stored under `getNoBackupFilesDir()/aurora-secure-store`, not browser localStorage and not Android cloud backup.
- Android sign-in sessions are migrated from the legacy `aurora-auth-session` localStorage entry into the encrypted store. New sign-ins, OAuth callbacks, refreshed sessions and sign-out use the encrypted store.
- The web build deliberately has no insecure imitation of the Android vault; web sign-in continues to use its existing browser session storage.
- Provider API keys should be kept server-side. Do not put privileged provider or Supabase service-role keys in this vault or in Vite environment variables.

## Supabase memory sync

The REST adapter uses the currently signed-in user's access token and the public anon key. It never uses a service-role key. Sync is disabled by default and only individual records can be sent; there is no bulk-upload method.

User flow:
1. Sign in to AURORA.
2. Say `prepare memory sync` to see the data-sharing explanation.
3. Say `confirm enable memory sync` to enable the per-record control.
4. Say `sync memory <memory-id>` to sync one selected record.
5. Say `disable memory sync` to turn it off and revoke the AURORA consent grant.

Conflict handling currently keeps the local record as the winner. Disabling sync does not delete cloud records; deletion of a local memory while sync is enabled sends a delete for that record.

### One-time database setup

The migration `supabase/migrations/202611090001_aurora_memories.sql` creates the table, enables RLS, adds per-user policies, and grants table access only to the authenticated role. It is committed to the repository but is **not automatically applied to the live Supabase project**. Apply it in the Supabase SQL Editor before enabling sync. Do not disable RLS or add a service-role key to the app.

## Reminders and scheduled work

- `AuroraReminderPlugin` schedules one-shot reminders through Android's battery-friendly inexact alarm API.
- A reminder is previewed first; the user must say `confirm reminder <id>` before Android schedules it.
- AURORA requests notification permission at confirmation time. If permission is denied, the reminder is not scheduled.
- Confirmed reminders are stored in app-private preferences and restored after device reboot. Delivered or cancelled reminders are removed.
- Reminders may arrive later than the requested minute because they are inexact alarms. Exact-alarm permission is intentionally not requested.
- This is reminder scheduling, not an autonomous arbitrary-action workflow. Device-changing or external actions still require a fresh AURORA approval.

Supported initial phrasing: `remind me to revise biology in 30 minutes`, `remind me to call the dentist in 2 hours`, or `remind me to review notes in 1 day`. Say `show reminders` to list scheduled reminders, or `cancel reminder <id>` to cancel one.

## Wake word

AURORA's existing Android wake-word service remains opt-in. The user starts it from the app after granting microphone permission. Android displays an ongoing foreground-service notification while it listens; the user can stop it from AURORA. It is not a hidden listener. Device manufacturers may restrict background microphone services, so this still requires real-device testing across Android versions.

## Extensions

The extension registry is intentionally declarative and metadata-only. It validates requested capabilities against AURORA's allowlist and requires explicit install approval. It does not download or execute extension JavaScript. A hardened executable extension sandbox is a separate future project and must not be simulated with `eval`, dynamic imports of remote code, or downloaded scripts.

## Validation status

The core test suite includes the planner, privacy/search/extension, and secure-sync adapter tests. Android Keystore, AlarmManager delivery, reboot recovery, notification permission prompts, microphone foreground service behavior, and sign-in migration still require a successful Android CI build and physical-device testing. The Supabase migration must be applied separately by the project owner.
