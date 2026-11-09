/**
 * Built-in Android adapters for the shared AURORA Action Engine.
 * This is internal architecture: it creates no navigation routes or pages.
 */
import {
  auroraNative,
  requestAuroraContactsPermission,
  searchAuroraContacts,
  openAuroraDialer
} from "../lib/aurora-native";
import { createAuroraActionEngine, AURORA_ACTION_RISK } from "./aurora-action-engine";

const requiredString = (value, field) => {
  if (typeof value !== "string" || !value.trim()) return field + " is required.";
  return true;
};

function createAuroraCapabilityRuntime(options = {}) {
  const engine = createAuroraActionEngine({ approve: options.approve, now: options.now, createId: options.createId });

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
    validate: (input) => requiredString(input?.query, "Search query"),
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Contact search requires the Android app." }),
    execute: async ({ query }) => {
      const permission = await requestAuroraContactsPermission();
      if (!permission.granted) throw Object.assign(new Error("Contacts permission was not granted."), { code: "PERMISSION_REQUIRED" });
      return { contacts: await searchAuroraContacts(query.trim()) };
    }
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
      return { items, localOnly: true, limit: result.limit || 20 };
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
    validate: (input) => typeof input?.enabled === "boolean" || "Choose on or off.",
    availability: async () => ({ available: auroraNative.isAndroid(), reason: "Flashlight control is available only in Android." }),
    execute: async ({ enabled }) => {
      const permission = await AuroraNativePermission.requestCameraPermission();
      if (!permission.granted) throw Object.assign(new Error("Camera permission was not granted."), { code: "PERMISSION_REQUIRED" });
      return auroraNative.setFlashlight(enabled);
    }
  });

  return engine;
}

export { createAuroraCapabilityRuntime };
