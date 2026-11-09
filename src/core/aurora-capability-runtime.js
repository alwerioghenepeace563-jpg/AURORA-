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

  return engine;
}

export { createAuroraCapabilityRuntime };
