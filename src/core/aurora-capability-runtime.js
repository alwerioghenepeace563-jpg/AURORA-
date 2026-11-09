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
    "android.overlay": async () => (await auroraNative.hasOverlayPermission()).granted === true
  };
  const authorize = async ({ capability, proposal }) => {
    for (const permission of capability.permissionRequirements || []) {
      const check = permissionChecks[permission];
      if (!check) return { authorized: false, code: "PERMISSION_POLICY_UNAVAILABLE", reason: "No permission adapter is registered for " + permission + "." };
      let granted = false;
      try { granted = await check(); } catch { granted = false; }
      if (!granted) return { authorized: false, code: "PERMISSION_REQUIRED", reason: "The required Android permission was not granted: " + permission + "." };
    }
    if ((capability.consentRequirements || []).length) {
      if (typeof options.authorize !== "function") return { authorized: false, code: "CONSENT_POLICY_UNAVAILABLE", reason: "Required consent policy is not configured." };
      return options.authorize({ capability, proposal });
    }
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


  // Stage 5: expose the already-implemented native voice and Pulse services
  // through the same Action Engine used by chat, overlay, and future surfaces.
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
      return input.text.length <= 8000 || "Speech text must be 8000 characters or fewer.";
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
    id: "pulse.show_overlay",
    label: "Show AURORA Pulse",
    category: "device",
    description: "Show the AURORA Pulse overlay after the user has granted Android overlay permission.",
    risk: AURORA_ACTION_RISK.MEDIUM,
    approvalRequired: true,
    permissionRequirements: ["android.overlay"],
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "AURORA Pulse overlay requires the Android app." }),
    execute: async () => {
      const result = await auroraNative.showOverlay();
      if (!result?.shown) throw new Error(result?.note || "Android did not show the AURORA Pulse overlay.");
      return { shown: true };
    }
  });

  engine.registerCapability({
    id: "pulse.hide_overlay",
    label: "Hide AURORA Pulse",
    category: "device",
    description: "Hide the currently visible AURORA Pulse overlay.",
    risk: AURORA_ACTION_RISK.LOW,
    approvalRequired: false,
    validate: () => true,
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "AURORA Pulse overlay requires the Android app." }),
    execute: async () => {
      const result = await auroraNative.hideOverlay();
      if (!result?.hidden) throw new Error("Android did not confirm that the AURORA Pulse overlay was hidden.");
      return { hidden: true };
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
