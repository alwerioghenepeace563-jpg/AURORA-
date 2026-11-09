/**
 * Built-in Android adapters for the shared AURORA Action Engine.
 * This is internal architecture: it creates no navigation routes or pages.
 */
import {
  auroraNative,
  requestAuroraContactsPermission,
  searchAuroraContacts,
  openAuroraDialer,
  requestAuroraCameraPermission as AuroraNativePermission
} from "../lib/aurora-native";
import { createAuroraActionEngine, AURORA_ACTION_RISK } from "./aurora-action-engine";

const requiredString = (value, field) => {
  if (typeof value !== "string" || !value.trim()) return field + " is required.";
  return true;
};

function createAuroraCapabilityRuntime(options = {}) {
  const permissionChecks = {
    "android.contacts": async () => (await requestAuroraContactsPermission()).granted === true,
    "android.accessibility": async () => (await auroraNative.isAccessibilityEnabled()).enabled === true,
    "android.notification_access": async () => (await auroraNative.hasNotificationAccess()).granted === true,
    "android.camera": async () => (await AuroraNativePermission.requestCameraPermission()).granted === true,
    "android.microphone": async () => (await auroraNative.requestMicrophonePermission()).granted === true,
    "android.notifications": async () => (await auroraNative.requestNotificationPermission()).granted === true,
    "android.calendar": async () => (await auroraNative.requestCalendarReadPermission()).granted === true,
    "android.location": async () => (await auroraNative.requestLocationPermission()).granted === true
  };
  const authorize = async ({ capability, proposal }) => {
    const consentRequirements = capability.consentRequirements || [];
    if (consentRequirements.length) {
      if (typeof options.authorize !== "function") return { authorized: false, code: "CONSENT_POLICY_UNAVAILABLE", reason: "Required consent policy is not configured." };
      const consent = await options.authorize({ capability, proposal });
      if (consent?.authorized !== true) return consent;
    }
    for (const permission of capability.permissionRequirements || []) {
      const check = permissionChecks[permission];
      if (!check) return { authorized: false, code: "PERMISSION_POLICY_UNAVAILABLE", reason: "No permission adapter is registered for " + permission + "." };
      let granted = false;
      try { granted = await check(); } catch { granted = false; }
      if (!granted) return { authorized: false, code: "PERMISSION_REQUIRED", reason: "The required Android permission was not granted: " + permission + "." };
    }
    if (consentRequirements.length) return { authorized: true };
    return typeof options.authorize === "function" ? options.authorize({ capability, proposal }) : { authorized: true };
  };
  const engine = createAuroraActionEngine({ approve: options.approve, authorize, now: options.now, createId: options.createId });

  engine.registerCapability({
    id: "android.open_app",
    label: "Open an app",
    category: "device",
    description: "Launch an installed Android application.",
    risk: AURORA_ACTION_RISK.LOW,
    validate: (input) => requiredString(input?.packageName, "Package name"),
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Android app launching is available only in the native Android app." }),
    execute: async ({ packageName }) => {
      const result = await auroraNative.openApp(packageName.trim());
      if (!result?.opened) throw Object.assign(new Error("Android did not confirm that the app opened."), { code: "APP_HANDOFF_FAILED" });
      return { opened: true, packageName: result.packageName || packageName.trim() };
    }
  });

  engine.registerCapability({
    id: "android.read_screen",
    label: "Read the current screen",
    category: "context",
    description: "Read visible screen text using the user's enabled accessibility service.",
    risk: AURORA_ACTION_RISK.HIGH,
    approvalRequired: true,
    permissionRequirements: ["android.accessibility"],
    validate: () => true,
    availability: async () => {
      if (!auroraNative.isAndroid()) return { available: false, reason: "Screen reading requires the Android app." };
      const state = await auroraNative.isAccessibilityEnabled();
      return { available: state.enabled === true, reason: state.enabled ? null : "Enable AURORA's Accessibility service in Android Settings first." };
    },
    execute: async () => {
      const result = await auroraNative.readScreen();
      return { text: String(result?.text || "") };
    }
  });

  engine.registerCapability({
    id: "contacts.search",
    label: "Search contacts",
    category: "communication",
    description: "Find a contact after Android grants Contacts permission.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: false,
    permissionRequirements: ["android.contacts"],
    validate: (input) => requiredString(input?.query, "Search query"),
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Contact search requires the Android app." }),
    execute: async ({ query }) => ({ contacts: await searchAuroraContacts(query.trim()) })
  });


  engine.registerCapability({
    id: "communication.prepare_sms",
    label: "Prepare a text message",
    category: "communication",
    description: "Open Android's SMS composer with a recipient and optional draft. AURORA never sends the message; the user reviews and taps Send.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: true,
    validate: (input) => {
      const valid = requiredString(input?.number, "Phone number");
      if (valid !== true) return valid;
      if (!/^[+0-9()\\s.-]{5,25}$/.test(input.number.trim())) return "Enter a valid phone number.";
      if (input?.body != null && (typeof input.body !== "string" || input.body.length > 2000)) return "Message draft must be text no longer than 2000 characters.";
      return true;
    },
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "SMS composer handoff requires the Android app." }),
    execute: async ({ number, body = "" }) => {
      const result = await auroraNative.prepareSms(number.trim(), body);
      if (!result?.opened) throw new Error("Android did not open the SMS composer.");
      return { composerOpened: true, requiresUserSend: true };
    }
  });

  engine.registerCapability({
    id: "communication.prepare_email",
    label: "Prepare an email",
    category: "communication",
    description: "Open Android's email composer with validated recipients, subject and draft text. AURORA never sends the email; the user reviews and taps Send.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: true,
    validate: (input) => {
      const valid = requiredString(input?.to, "Email recipient");
      if (valid !== true) return valid;
      const recipients = input.to.split(/[,;]/).map((address) => address.trim()).filter(Boolean);
      if (!recipients.length || recipients.length > 10 || recipients.length !== input.to.split(/[,;]/).length) return "Provide 1 to 10 valid email recipients.";
      const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
      if (recipients.some((address) => !emailPattern.test(address))) return "Check the email recipient addresses.";
      if (input?.subject != null && (typeof input.subject !== "string" || input.subject.length > 200)) return "Email subject must be text no longer than 200 characters.";
      if (input?.body != null && (typeof input.body !== "string" || input.body.length > 8000)) return "Email draft must be text no longer than 8000 characters.";
      return true;
    },
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Email composer handoff requires the Android app." }),
    execute: async ({ to, subject = "", body = "" }) => {
      const result = await auroraNative.prepareEmail(to.trim(), subject, body);
      if (!result?.opened) throw new Error("Android did not confirm that the email composer opened.");
      return { ...result, requiresUserReview: true, requiresUserSend: true, sentByAurora: false };
    }
  });

  engine.registerCapability({
    id: "communication.share_text",
    label: "Share text",
    category: "communication",
    description: "Open Android's system share sheet for text explicitly provided by the user. The user chooses the destination and confirms sharing.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: true,
    validate: (input) => {
      const valid = requiredString(input?.text, "Text to share");
      if (valid !== true) return valid;
      return input.text.length <= 8000 || "Text to share must be 8000 characters or fewer.";
    },
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Android sharing requires the native app." }),
    execute: async ({ text }) => {
      const result = await auroraNative.shareText(text);
      if (!result?.opened) throw new Error("Android did not open the share sheet.");
      return { shareSheetOpened: true, requiresUserDestination: true };
    }
  });

  engine.registerCapability({
    id: "device.set_audio_volume", label: "Set device volume", category: "device",
    description: "Set media, ring or alarm volume from 0 to 100 and show Android system volume UI. Requires fresh user approval.",
    risk: AURORA_ACTION_RISK.MEDIUM, approvalRequired: true,
    validate: (input) => ["media", "ring", "alarm"].includes(input?.stream) && Number.isInteger(input?.level) && input.level >= 0 && input.level <= 100 || "Choose media, ring or alarm and a volume level from 0 to 100.",
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Volume control requires Android." }),
    execute: async ({ stream, level }) => { const result = await auroraNative.setAudioVolume(stream, level); if (!Number.isFinite(result?.current)) throw new Error("Android did not verify the volume change."); return { ...result, verified: true }; }
  });

  engine.registerCapability({
    id: "apps.list_launchable", label: "List launchable apps", category: "device",
    description: "List up to 200 launcher-visible installed apps with display names and package identifiers. Does not read app data or launch/uninstall anything.",
    risk: AURORA_ACTION_RISK.LOW, approvalRequired: false, validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "App discovery requires Android." }),
    execute: async () => auroraNative.listLaunchableApps()
  });

  engine.registerCapability({
    id: "device.get_network_status", label: "Inspect network connectivity", category: "device",
    description: "Read connection state, validated internet capability, metered status and transport type. Does not read Wi-Fi names, inspect traffic or change connectivity.",
    risk: AURORA_ACTION_RISK.LOW, approvalRequired: false, validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Network diagnostics require Android." }),
    execute: async () => auroraNative.getNetworkStatus()
  });

  engine.registerCapability({
    id: "device.get_storage_status", label: "Inspect device storage", category: "device",
    description: "Read total, used and available app-data storage capacity. Does not inspect file names or contents.",
    risk: AURORA_ACTION_RISK.LOW, approvalRequired: false, validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Storage status requires Android." }),
    execute: async () => auroraNative.getStorageStatus()
  });

  engine.registerCapability({
    id: "contacts.prepare_new", label: "Prepare a new contact", category: "communication",
    description: "Open Android contact form with a name and optional phone/email. User reviews and saves; AURORA does not write contacts directly.",
    risk: AURORA_ACTION_RISK.MEDIUM, approvalRequired: true,
    validate: (input) => { const valid = requiredString(input?.name, "Contact name"); if (valid !== true) return valid; if (input.name.length > 120) return "Contact name must be 120 characters or fewer."; if (input?.phone != null && (typeof input.phone !== "string" || input.phone.length > 40 || (input.phone && !/^[+0-9() .-]{5,40}$/.test(input.phone.trim())))) return "Check the contact phone number."; if (input?.email != null && (typeof input.email !== "string" || input.email.length > 254 || (input.email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(input.email.trim())))) return "Check the contact email address."; if (!input.phone?.trim() && !input.email?.trim()) return "Provide a phone number or email address."; return true; },
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Contact creation handoff requires Android." }),
    execute: async ({ name, phone = "", email = "" }) => { const result = await auroraNative.prepareContact(name.trim(), phone.trim(), email.trim()); if (!result?.opened) throw new Error("Android did not confirm that the contact form opened."); return { ...result, savedByAurora: false, requiresUserSave: true }; }
  });

  engine.registerCapability({
    id: "productivity.prepare_alarm", label: "Prepare an alarm", category: "productivity", description: "Open Android clock with a proposed alarm time. The user reviews and confirms the alarm.",
    risk: AURORA_ACTION_RISK.LOW, approvalRequired: false,
    validate: (input) => (Number.isInteger(input?.hour) && input.hour >= 0 && input.hour <= 23 && Number.isInteger(input?.minute) && input.minute >= 0 && input.minute <= 59) || "Provide a valid 24-hour alarm time.",
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Alarm handoff requires Android." }),
    execute: async ({ hour, minute, message = "AURORA alarm" }) => { const result = await auroraNative.prepareAlarm(hour, minute, message); if (!result?.opened) throw new Error("Android did not confirm that the alarm form opened."); return { ...result, requiresUserConfirmation: true, alarmCreatedByAurora: false }; }
  });

  engine.registerCapability({
    id: "productivity.prepare_timer", label: "Prepare a timer", category: "productivity", description: "Open Android clock with a proposed timer duration. The user reviews and starts the timer.",
    risk: AURORA_ACTION_RISK.LOW, approvalRequired: false,
    validate: (input) => (Number.isInteger(input?.seconds) && input.seconds >= 1 && input.seconds <= 86400) || "Timer duration must be between 1 second and 24 hours.",
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Timer handoff requires Android." }),
    execute: async ({ seconds, message = "AURORA timer" }) => { const result = await auroraNative.prepareTimer(seconds, message); if (!result?.opened) throw new Error("Android did not confirm that the timer form opened."); return { ...result, requiresUserConfirmation: true, timerCreatedByAurora: false }; }
  });

  engine.registerCapability({
    id: "communication.open_dialer",
    label: "Prepare a phone call",
    category: "communication",
    description: "Open Android's dialler with a number; AURORA never places the call silently.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: true,
    validate: (input) => {
      const valid = requiredString(input?.number, "Phone number");
      if (valid !== true) return valid;
      return /^[+0-9()\s.-]{5,25}$/.test(input.number.trim()) || "Enter a valid phone number.";
    },
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "The Android dialler is available only in the Android app." }),
    execute: async ({ number }) => {
      const result = await openAuroraDialer(number.trim());
      if (!result?.opened) throw Object.assign(new Error("Android could not open the dialler."), { code: "APP_HANDOFF_FAILED" });
      return { diallerOpened: true };
    }
  });


  engine.registerCapability({
    id: "maps.search_place",
    label: "Find a place on the map",
    category: "navigation",
    description: "Open a place search in the user's installed map application.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: (input) => requiredString(input?.query, "Place or address"),
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Map handoff requires the Android app." }),
    execute: async ({ query }) => {
      const result = await auroraNative.searchOnMap(query.trim());
      if (!result?.opened) throw new Error("The map application did not open.");
      return { opened: true, query: result.query || query.trim() };
    }
  });

  engine.registerCapability({
    id: "maps.get_directions",
    label: "Get directions",
    category: "navigation",
    description: "Hand a destination and travel mode to an installed map application for review.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: (input) => {
      const valid = requiredString(input?.destination, "Destination");
      if (valid !== true) return valid;
      return ["driving", "walking", "bicycling", "transit"].includes(input?.mode || "driving") || "Choose driving, walking, bicycling or transit.";
    },
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Directions handoff requires the Android app." }),
    execute: async ({ destination, mode = "driving" }) => {
      const result = await auroraNative.startMapDirections(destination.trim(), mode);
      if (!result?.opened) throw new Error("The map application did not open.");
      return { opened: true, destination: result.destination || destination.trim(), mode };
    }
  });

  engine.registerCapability({
    id: "location.get_current",
    label: "Get current device location",
    category: "navigation",
    description: "Read the device's last known location after explicit approval and Android location permission. Returns timestamp and freshness so stale coordinates are never presented as live; no background tracking or location storage is performed.",
    risk: AURORA_ACTION_RISK.HIGH,
    approvalRequired: true,
    permissionRequirements: ["android.location"],
    consentRequirements: ["location.current:android"],
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Device location requires Android, enabled location services, and user-granted permission." }),
    execute: async () => {
      const result = await auroraNative.getCurrentLocation();
      return { latitude: result.latitude, longitude: result.longitude, accuracyMeters: result.accuracyMeters, provider: result.provider, timestamp: result.timestamp, ageMs: result.ageMs, fresh: result.fresh === true, precision: result.precision, backgroundTracking: false, stored: false };
    }
  });

  engine.registerCapability({
    id: "calendar.prepare_event",
    label: "Prepare a calendar event",
    category: "productivity",
    description: "Open Android's calendar event editor; the user reviews and saves the event.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: true,
    validate: (input) => {
      const valid = requiredString(input?.title, "Event title");
      if (valid !== true) return valid;
      if (!Number.isFinite(input?.beginTime) || !Number.isFinite(input?.endTime) || input.endTime <= input.beginTime) return "Valid start and end timestamps are required.";
      return true;
    },
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Calendar handoff requires the Android app." }),
    execute: async ({ title, beginTime, endTime, description, location }) => {
      const result = await auroraNative.prepareCalendarEvent({ title: title.trim(), beginTime, endTime, description, location });
      if (!result?.opened || !result?.requiresUserSave) throw new Error("The calendar editor could not be opened.");
      return { editorOpened: true, requiresUserSave: true };
    }
  });

  engine.registerCapability({
    id: "calendar.search_events",
    label: "Search upcoming calendar events",
    category: "productivity",
    description: "Search events on the device calendar for the next 90 days. Results are read locally and are not saved or uploaded.",
    risk: AURORA_ACTION_RISK.HIGH,
    approvalRequired: true,
    permissionRequirements: ["android.calendar"],
    validate: (input) => {
      if (input?.query !== undefined && (typeof input.query !== "string" || input.query.length > 100)) return "Calendar search query must be text no longer than 100 characters.";
      return true;
    },
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Calendar search requires the Android app and Calendar permission." }),
    execute: async ({ query = "" }) => {
      const result = await auroraNative.searchCalendarEvents(query.trim());
      return { events: result.events || [], count: result.count || 0, limit: result.limit || 20, windowEnd: result.windowEnd, localOnly: true, notStored: true };
    }
  });

  engine.registerCapability({
    id: "media.search_play",
    label: "Find and play media",
    category: "media",
    description: "Hand a song, artist or title to an installed media app; playback remains under the user's app controls.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: (input) => requiredString(input?.query, "Song, artist or media title"),
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Media search handoff requires the Android app." }),
    execute: async ({ query }) => {
      const result = await auroraNative.searchMedia(query.trim());
      if (!result?.opened) throw new Error("No media app accepted the search.");
      return { opened: true, query: result.query || query.trim() };
    }
  });


  engine.registerCapability({
    id: "files.pick_document",
    label: "Choose a file",
    category: "files",
    description: "Open Android's system document picker. Only a file explicitly selected by the user is shared with AURORA; plain-text previews are limited to 1 MB.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "The system document picker is available only in the Android app." }),
    execute: async () => {
      const result = await auroraNative.pickDocument();
      if (result?.cancelled) return { cancelled: true };
      return {
        cancelled: false,
        name: result?.name || "Selected file",
        mimeType: result?.mimeType || "application/octet-stream",
        contentUri: result?.contentUri || null,
        text: result?.textIncluded ? String(result.text || "") : null,
        textIncluded: result?.textIncluded === true,
        note: result?.note || null
      };
    }
  });



  engine.registerCapability({
    id: "files.pick_media",
    label: "Choose an image, video or audio file",
    category: "files",
    description: "Open Android's system picker for one image, video or audio item. Returns only selected-file metadata and a content URI; media bytes are not loaded automatically.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: false,
    validate: (input) => ["image", "video", "audio"].includes(input?.mediaType) || "Choose image, video or audio.",
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "The Android system media picker is required." }),
    execute: async ({ mediaType }) => {
      const result = await auroraNative.pickMedia(mediaType);
      if (result?.cancelled) return { cancelled: true };
      return { cancelled: false, name: result?.name || "Selected media", mimeType: result?.mimeType || "application/octet-stream", contentUri: result?.contentUri || null, readOnlySelection: true, contentLoaded: false };
    }
  });

  engine.registerCapability({
    id: "files.share_selected_file",
    label: "Share a selected file",
    category: "files",
    description: "Open Android's share sheet for a content URI returned by AURORA's explicit system picker. The user chooses the destination; AURORA does not send or upload the file.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: true,
    validate: (input) => requiredString(input?.contentUri, "Selected file URI") === true && input.contentUri.startsWith("content://") && input.contentUri.length <= 2048 && requiredString(input?.mimeType, "File media type") === true || "Share only a selected content URI and a valid media type.",
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Android file sharing requires the native app." }),
    execute: async ({ contentUri, mimeType }) => {
      const result = await auroraNative.shareSelectedFile(contentUri, mimeType);
      if (!result?.opened) throw new Error("Android did not open the file share sheet.");
      return { shareSheetOpened: true, requiresUserDestination: true, fileSentByAurora: false };
    }
  });

  engine.registerCapability({
    id: "files.search_selected_text",
    label: "Search selected document text",
    category: "files",
    description: "Find matching passages in text explicitly selected and supplied by the user. Searches in memory only and does not save document text.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: true,
    validate: (input) => {
      const valid = requiredString(input?.text, "Selected document text");
      if (valid !== true) return valid;
      if (input.text.length > 1000000) return "Selected document text must be 1 MB or smaller.";
      const queryValid = requiredString(input?.query, "Document search query");
      if (queryValid !== true) return queryValid;
      return input.query.length <= 120 || "Document search query must be 120 characters or fewer.";
    },
    availability: async () => ({ available: true }),
    execute: async ({ text, query }) => {
      const source = text;
      const needle = query.trim().toLocaleLowerCase();
      const lower = source.toLocaleLowerCase();
      const matches = [];
      let from = 0;
      while (matches.length < 20) {
        const index = lower.indexOf(needle, from);
        if (index < 0) break;
        const start = Math.max(0, index - 90);
        const end = Math.min(source.length, index + needle.length + 90);
        matches.push({ position: index, excerpt: source.slice(start, end).replace(/[\\r\\n\\t]+/g, " ").trim() });
        from = index + Math.max(needle.length, 1);
      }
      return { matches, count: matches.length, truncated: matches.length === 20, sourceLength: source.length, notStored: true };
    }
  });

  engine.registerCapability({
    id: "notifications.open_access_settings",
    label: "Configure notification access",
    category: "notifications",
    description: "Open Android's system settings so the user can explicitly enable or disable AURORA notification access.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Notification access settings require Android." }),
    execute: async () => auroraNative.openNotificationAccessSettings()
  });

  engine.registerCapability({
    id: "notifications.read_recent",
    label: "Read recent notifications",
    category: "notifications",
    description: "Read up to 20 recent notification previews stored locally after the user enables Android Notification Access.",
    risk: AURORA_ACTION_RISK.HIGH,
    approvalRequired: true,
    permissionRequirements: ["android.notification_access"],
    validate: () => true,
    availability: async () => {
      if (!auroraNative.isAndroid()) return { available: false, reason: "Notification intelligence requires Android." };
      const state = await auroraNative.hasNotificationAccess();
      return { available: state.granted, reason: state.granted ? null : "Enable AURORA Notification Access in Android Settings first." };
    },
    execute: async () => {
      const result = await auroraNative.readRecentNotifications();
      let items = [];
      try { items = JSON.parse(result.items || "[]"); } catch { items = []; }
      return { items, localOnly: true, excludedFromBackup: true, limit: result.limit || 20 };
    }
  });


  engine.registerCapability({
    id: "notifications.search_recent",
    label: "Search recent notifications",
    category: "notifications",
    description: "Search the locally cached recent notification previews by app, title, or text. Requires Notification Access and fresh approval; results remain local to this action.",
    risk: AURORA_ACTION_RISK.HIGH,
    approvalRequired: true,
    permissionRequirements: ["android.notification_access"],
    validate: (input) => {
      const valid = requiredString(input?.query, "Notification search query");
      if (valid !== true) return valid;
      return input.query.trim().length >= 2 && input.query.length <= 120 || "Use a search query between 2 and 120 characters.";
    },
    availability: async () => {
      if (!auroraNative.isAndroid()) return { available: false, reason: "Notification search requires Android." };
      const state = await auroraNative.hasNotificationAccess();
      return { available: state.granted, reason: state.granted ? null : "Enable AURORA Notification Access in Android Settings first." };
    },
    execute: async ({ query }) => {
      const result = await auroraNative.readRecentNotifications();
      let items = [];
      try { items = JSON.parse(result.items || "[]"); } catch { items = []; }
      const needle = query.trim().toLocaleLowerCase();
      const matches = items.filter((item) => [item?.packageName, item?.title, item?.text]
        .some((value) => String(value || "").toLocaleLowerCase().includes(needle)))
        .slice(0, 20);
      return { matches, count: matches.length, localOnly: true, excludedFromBackup: true };
    }
  });

  engine.registerCapability({
    id: "notifications.clear_recent",
    label: "Clear AURORA notification cache",
    category: "notifications",
    description: "Delete the recent notification previews stored locally by AURORA; this does not dismiss Android notifications.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: true,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Notification cache is available only in Android." }),
    execute: async () => auroraNative.clearRecentNotifications()
  });

  engine.registerCapability({
    id: "android.inspect_capabilities",
    label: "Inspect Android capabilities",
    category: "device",
    description: "Read a device-specific inventory of hardware features and current permission states. This inspection is read-only and never requests permissions or changes settings.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Device capability inspection requires the native Android app." }),
    execute: async () => {
      const inventory = await auroraNative.getDeviceCapabilityInventory();
      return { ...inventory, readOnly: true, noPermissionPrompt: true, noSettingsChanged: true };
    }
  });

  engine.registerCapability({
    id: "device.get_status",
    label: "Get device status",
    category: "device",
    description: "Read basic device model, Android version, battery percentage and charging state.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Device status is available only in Android." }),
    execute: async () => auroraNative.getDeviceStatus()
  });

  engine.registerCapability({
    id: "device.open_wifi_settings",
    label: "Open Wi-Fi settings",
    category: "device",
    description: "Open Android Wi-Fi settings. AURORA never toggles Wi-Fi directly; the user makes any change in system settings.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in the Android app." }),
    execute: async () => {
      const result = await auroraNative.openDeviceSettings("wifi");
      if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened.");
      return { ...result, noDirectSettingMutation: true };
    }
  });

  engine.registerCapability({
    id: "device.open_bluetooth_settings",
    label: "Open Bluetooth settings",
    category: "device",
    description: "Open Android Bluetooth settings. AURORA never toggles Bluetooth directly; the user makes any change in system settings.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in the Android app." }),
    execute: async () => {
      const result = await auroraNative.openDeviceSettings("bluetooth");
      if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened.");
      return { ...result, noDirectSettingMutation: true };
    }
  });

  engine.registerCapability({
    id: "device.open_display_settings",
    label: "Open display settings",
    category: "device",
    description: "Open Android display settings for user-controlled display adjustments.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in the Android app." }),
    execute: async () => {
      const result = await auroraNative.openDeviceSettings("display");
      if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened.");
      return { ...result, noDirectSettingMutation: true };
    }
  });

  engine.registerCapability({
    id: "device.open_nfc_settings",
    label: "Open NFC settings",
    category: "device",
    description: "Open Android NFC settings; the user controls NFC.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in the Android app." }),
    execute: async () => { const result = await auroraNative.openDeviceSettings("nfc"); if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened."); return { ...result, noDirectSettingMutation: true }; }
  });

  engine.registerCapability({
    id: "device.open_sound_settings",
    label: "Open sound settings",
    category: "device",
    description: "Open Android sound settings; the user controls sound and vibration.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in the Android app." }),
    execute: async () => { const result = await auroraNative.openDeviceSettings("sound"); if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened."); return { ...result, noDirectSettingMutation: true }; }
  });

  engine.registerCapability({
    id: "device.open_battery_settings",
    label: "Open battery settings",
    category: "device",
    description: "Open Android battery settings; the user controls power and battery optimization.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in the Android app." }),
    execute: async () => { const result = await auroraNative.openDeviceSettings("battery"); if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened."); return { ...result, noDirectSettingMutation: true }; }
  });

  engine.registerCapability({
    id: "device.open_app_details_settings",
    label: "Open AURORA app settings",
    category: "device",
    description: "Open Android app details for AURORA so the user can manage permissions and storage.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in the Android app." }),
    execute: async () => { const result = await auroraNative.openDeviceSettings("app_details"); if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened."); return { ...result, noDirectSettingMutation: true }; }
  });

  engine.registerCapability({ id: "device.open_location_settings", label: "Open location settings", category: "device", description: "Open Android location settings; the user controls location services.", risk: AURORA_ACTION_RISK.LOW, approvalRequired: false, validate: () => true, availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in Android." }), execute: async () => { const result = await auroraNative.openDeviceSettings("location"); if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened."); return { ...result, noDirectSettingMutation: true }; } });

  engine.registerCapability({ id: "device.open_notifications_settings", label: "Open AURORA notification settings", category: "device", description: "Open Android notification settings for AURORA; the user controls notification preferences.", risk: AURORA_ACTION_RISK.LOW, approvalRequired: false, validate: () => true, availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in Android." }), execute: async () => { const result = await auroraNative.openDeviceSettings("notifications"); if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened."); return { ...result, noDirectSettingMutation: true }; } });

  engine.registerCapability({ id: "device.open_security_settings", label: "Open security settings", category: "device", description: "Open Android security settings; the user controls security options.", risk: AURORA_ACTION_RISK.LOW, approvalRequired: false, validate: () => true, availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in Android." }), execute: async () => { const result = await auroraNative.openDeviceSettings("security"); if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened."); return { ...result, noDirectSettingMutation: true }; } });

  engine.registerCapability({ id: "device.open_date_time_settings", label: "Open date and time settings", category: "device", description: "Open Android date and time settings; the user controls clock settings.", risk: AURORA_ACTION_RISK.LOW, approvalRequired: false, validate: () => true, availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in Android." }), execute: async () => { const result = await auroraNative.openDeviceSettings("date_time"); if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened."); return { ...result, noDirectSettingMutation: true }; } });

  engine.registerCapability({ id: "device.open_storage_settings", label: "Open storage settings", category: "device", description: "Open Android storage settings; the user controls storage management.", risk: AURORA_ACTION_RISK.LOW, approvalRequired: false, validate: () => true, availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in Android." }), execute: async () => { const result = await auroraNative.openDeviceSettings("storage"); if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened."); return { ...result, noDirectSettingMutation: true }; } });

  engine.registerCapability({
    id: "device.open_hotspot_settings",
    label: "Open hotspot settings",
    category: "device",
    description: "Open Android hotspot/tethering settings. Android may route to general wireless settings; the user applies any change.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "This settings handoff is available only in the Android app." }),
    execute: async () => {
      const result = await auroraNative.openDeviceSettings("hotspot");
      if (!result?.opened) throw new Error("Android did not confirm that the requested settings page opened.");
      return { ...result, noDirectSettingMutation: true };
    }
  });

  engine.registerCapability({
    id: "device.set_flashlight",
    label: "Control flashlight",
    category: "device",
    description: "Turn the Android device flashlight on or off at the user's explicit request.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    permissionRequirements: ["android.camera"],
    validate: (input) => typeof input?.enabled === "boolean" || "Choose on or off.",
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Flashlight control is available only in Android." }),
    execute: async ({ enabled }) => auroraNative.setFlashlight(enabled)
  });


  // Stage 5: expose verified native voice and assistant services through the shared Action Engine.
  engine.registerCapability({
    id: "voice.start_listening",
    label: "Start voice input",
    category: "voice",
    description: "Start Android speech recognition and deliver transcript results through the shared speechResult event.",
    risk: AURORA_ACTION_RISK.HIGH,
    approvalRequired: true,
    permissionRequirements: ["android.microphone"],
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Native speech recognition requires the Android app and an installed speech recognition service." }),
    execute: async () => {
      const result = await auroraNative.startSpeechRecognition();
      if (!result?.started) throw new Error("Android speech recognition did not start.");
      return { started: true, transcriptEvent: "speechResult", errorEvent: "speechError" };
    }
  });

  engine.registerCapability({
    id: "voice.stop_listening",
    label: "Stop voice input",
    category: "voice",
    description: "Stop the current Android speech recognition session.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Native speech recognition requires the Android app." }),
    execute: async () => {
      const result = await auroraNative.stopSpeechRecognition();
      if (!result?.stopped) throw new Error("Android speech recognition did not stop.");
      return { stopped: true };
    }
  });

  engine.registerCapability({
    id: "notifications.request_permission",
    label: "Request notification permission",
    category: "notifications",
    description: "Ask Android for notification permission where required by the installed Android version.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Android notification permission is available only in the native app." }),
    execute: async () => {
      const result = await auroraNative.requestNotificationPermission();
      return { granted: result?.granted === true };
    }
  });

  engine.registerCapability({
    id: "assistant.get_status",
    label: "Get assistant service status",
    category: "voice",
    description: "Read whether the native bridge, wake-word listener foundation, and live voice mode are available or active.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Assistant service status requires the Android app." }),
    execute: async () => {
      const state = await auroraNative.status();
      return {
        platform: state.platform,
        nativeBridge: state.nativeBridge === true,
        backgroundServiceFoundation: state.backgroundServiceFoundation === true,
        wakeWordEnabled: state.wakeWordEnabled === true,
        wakeWordListening: state.wakeWordListening === true,
        liveRealtimeVoiceEnabled: state.liveRealtimeVoiceEnabled === true
      };
    }
  });

  engine.registerCapability({
    id: "voice.speak_text",
    label: "Speak a response",
    category: "voice",
    description: "Speak assistant text through Android text-to-speech.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    timeoutMs: 120000,
    validate: (input) => {
      const valid = requiredString(input?.text, "Speech text");
      if (valid !== true) return valid;
      return input.text.length <= 2500 || "Speech text must be 2500 characters or fewer.";
    },
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Native speech output requires the Android app." }),
    execute: async ({ text }) => {
      const result = await auroraNative.speakText(text.trim());
      if (!result?.started) throw new Error("Android text-to-speech did not start.");
      return { started: true, engine: result.engine || "android-tts" };
    }
  });

  engine.registerCapability({
    id: "voice.stop_speaking",
    label: "Stop speaking",
    category: "voice",
    description: "Stop current Android text-to-speech playback.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Native speech output requires the Android app." }),
    execute: async () => {
      const result = await auroraNative.stopTextSpeech();
      return { stopped: result?.stopped === true };
    }
  });

  engine.registerCapability({
    id: "assistant.start_background_service",
    label: "Start AURORA background service",
    category: "voice",
    description: "Start AURORA's Android foreground assistant service after microphone permission is granted.",
    risk: AURORA_ACTION_RISK.HIGH,
    approvalRequired: true,
    permissionRequirements: ["android.microphone"],
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "The background assistant service requires the Android app." }),
    execute: async () => {
      const result = await auroraNative.startAssistantService();
      if (!result?.started) throw new Error(result?.note || "Android did not start the assistant service.");
      return { started: true, note: result.note || null };
    }
  });

  engine.registerCapability({
    id: "assistant.stop_background_service",
    label: "Stop AURORA background service",
    category: "voice",
    description: "Stop AURORA's Android foreground assistant service.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "The background assistant service requires the Android app." }),
    execute: async () => {
      const result = await auroraNative.stopAssistantService();
      if (!result?.stopped) throw new Error("Android did not confirm that the assistant service stopped.");
      return { stopped: true };
    }
  });

  engine.registerCapability({
    id: "device.open_accessibility_settings",
    label: "Open accessibility settings",
    category: "device",
    description: "Open Android settings so the user can enable or disable AURORA's accessibility service.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Accessibility settings require the Android app." }),
    execute: async () => {
      const result = await auroraNative.openAccessibilitySettings();
      if (!result?.opened) throw new Error("Android accessibility settings could not be opened.");
      return { opened: true };
    }
  });

  engine.registerCapability({
    id: "device.get_build_info",
    label: "Get app build information",
    category: "device",
    description: "Read the installed AURORA version code and version name.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Installed build information requires the Android app." }),
    execute: async () => auroraNative.getBuildInfo()
  });

  return engine;
}

export { createAuroraCapabilityRuntime };
