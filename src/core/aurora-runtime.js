/**
 * AURORA's shared internal runtime.
 * Import this singleton from chat, Pulse, voice and future surfaces.
 * It owns no screen: capabilities and approvals are services.
 */
import { createAuroraApprovalBroker } from "./aurora-approval-broker";
import { createAuroraCapabilityRuntime } from "./aurora-capability-runtime";
import { runAuroraToolTree } from "../lib/aurora-tool-tree";

const approvalBroker = createAuroraApprovalBroker();
const actionEngine = createAuroraCapabilityRuntime({
  approve: (proposal) => approvalBroker.request(proposal)
});

actionEngine.registerCapability({
  id: "assistant.route_request",
  label: "Understand and route a request",
  category: "intelligence",
  description: "Runs AURORA’s existing local capability tree before AI response generation.",
  risk: "low",
  approvalRequired: false,
  validate: (input) => typeof input?.text === "string" && input.text.trim().length > 0,
  execute: (input) => runAuroraToolTree(input.text)
});


function parseCalendarIntent(message, now = new Date()) {
  const match = message.match(/^\s*(?:hey aurora[, ]*)?(?:please\s+)?(?:remind me to|add|create|schedule|put)\s+(.+?)\s+(?:for\s+)?(?:on\s+)?(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*$/i);
  if (!match) return null;
  const title = match[1].replace(/\s+(?:in|to)\s+(?:my\s+)?calendar$/i, "").trim();
  if (!title) return null;
  const dayToken = match[2].toLowerCase();
  const hourInput = Number(match[3]);
  const minute = Number(match[4] || 0);
  const meridiem = match[5].toLowerCase();
  if (hourInput < 1 || hourInput > 12 || minute > 59) return null;
  const date = new Date(now.getTime());
  if (dayToken === "tomorrow") date.setDate(date.getDate() + 1);
  else if (dayToken !== "today") {
    const weekdays = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    if (dayToken.includes("-")) {
      const [year, month, day] = dayToken.split("-").map(Number);
      date.setFullYear(year, month - 1, day);
    } else {
      const target = weekdays.indexOf(dayToken);
      const delta = (target - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + delta);
    }
  }
  let hour = hourInput % 12;
  if (meridiem === "pm") hour += 12;
  date.setHours(hour, minute, 0, 0);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now.getTime()) return null;
  return { title, beginTime: date.getTime(), endTime: date.getTime() + 60 * 60 * 1000 };
}

async function routeMessage(text) {
  const message = String(text || "").trim();
  if (/\b(?:enable|set up|configure|manage)\s+(?:aurora\s+)?notification access\b/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "notifications.open_access_settings", input: {} });
    return receipt.status === "completed" ? { tool: "android_notification_settings", context: "Android's Notification Access settings are open. Enable or disable AURORA there whenever you choose." } : { error: receipt.error?.message || "Could not open notification settings." };
  }

  if (/\b(?:clear|delete|erase)\s+(?:aurora'?s?\s+)?(?:recent\s+)?notification cache\b/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "notifications.clear_recent", input: {} });
    return receipt.status === "completed" ? { tool: "android_notifications", context: "AURORA's locally stored notification previews were cleared. Android notifications themselves were not dismissed." } : { error: receipt.error?.message || "Could not clear AURORA's notification cache." };
  }

  // Device and productivity commands are parsed into registered, typed capabilities.
  if (/^(?:what(?:'s| is)\s+)?(?:my\s+)?(?:battery|device status|phone status)\??$/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "device.get_status", input: {} });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "Device status is unavailable." };
    const s = receipt.result || {};
    return { tool: "android_device_status", context: "Battery: " + (s.batteryPercent == null ? "unknown" : s.batteryPercent + "%") + (s.charging ? " (charging)" : "") + ". Device: " + [s.manufacturer, s.model].filter(Boolean).join(" ") + ", Android SDK " + s.sdk + "." };
  }

  if (/\b(?:turn on|switch on|enable)\s+(?:the\s+)?(?:flashlight|torch)\b/i.test(message) || /^(?:flashlight|torch)\s+on$/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "device.set_flashlight", input: { enabled: true } });
    return receipt.status === "completed" ? { tool: "android_flashlight", context: "Flashlight turned on." } : { error: receipt.error?.message || "Could not turn on the flashlight." };
  }
  if (/\b(?:turn off|switch off|disable)\s+(?:the\s+)?(?:flashlight|torch)\b/i.test(message) || /^(?:flashlight|torch)\s+off$/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "device.set_flashlight", input: { enabled: false } });
    return receipt.status === "completed" ? { tool: "android_flashlight", context: "Flashlight turned off." } : { error: receipt.error?.message || "Could not turn off the flashlight." };
  }

  if (/\b(?:read|check|show|summari[sz]e)\s+(?:my\s+)?(?:recent\s+)?notifications\b/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "notifications.read_recent", input: {} });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "Notification access is unavailable." };
    const items = receipt.result?.items || [];
    return { tool: "android_notifications", context: items.length ? "Recent notifications (stored locally):\n" + items.map((item) => "- " + [item.title, item.text].filter(Boolean).join(": ")).join("\n") : "There are no recent notification previews in AURORA's local cache." };
  }

  const calendarIntent = parseCalendarIntent(message);
  if (calendarIntent) {
    const receipt = await actionEngine.execute({ capabilityId: "calendar.prepare_event", input: calendarIntent });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "Calendar event preparation was not completed." };
    return { tool: "android_calendar", context: "I opened the calendar editor for “" + calendarIntent.title + "”. Please review the date and time and save it there." };
  }

  // Explicit app-launch requests use a fixed package allowlist; package IDs are never model supplied.
  const appTargets = [
    { pattern: /\bwhatsapp business\b/i, packageName: "com.whatsapp.w4b", label: "WhatsApp Business" },
    { pattern: /\bwhats?app\b/i, packageName: "com.whatsapp", label: "WhatsApp" },
    { pattern: /\bfacebook lite\b/i, packageName: "com.facebook.lite", label: "Facebook Lite" },
    { pattern: /\bfacebook\b/i, packageName: "com.facebook.katana", label: "Facebook" },
    { pattern: /\bchrome\b/i, packageName: "com.android.chrome", label: "Chrome" },
    { pattern: /\byoutube\b/i, packageName: "com.google.android.youtube", label: "YouTube" },
    { pattern: /\bgmail\b/i, packageName: "com.google.android.gm", label: "Gmail" },
    { pattern: /\bgoogle maps\b|\bmaps\b/i, packageName: "com.google.android.apps.maps", label: "Google Maps" },
    { pattern: /\bmessages\b/i, packageName: "com.google.android.apps.messaging", label: "Messages" },
    { pattern: /\bsettings\b/i, packageName: "com.android.settings", label: "Settings" }
  ];
  if (/^\s*(?:hey aurora[, ]*)?(?:please\s+)?(?:open|launch)\s+/i.test(message)) {
    const target = appTargets.find((item) => item.pattern.test(message));
    if (target) {
      const receipt = await actionEngine.execute({ capabilityId: "android.open_app", input: { packageName: target.packageName } });
      if (receipt.status !== "completed") return { error: receipt.error?.message || "The app could not be opened." };
      return { tool: "android_open_app", context: "AURORA handed the request to Android to open " + target.label + "." };
    }
  }

  if (/^\s*(?:hey aurora[, ]*)?(?:please\s+)?(?:choose|pick|open|read)\s+(?:a\s+)?(?:file|document)\s*$/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "files.pick_document", input: {} });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "The file picker could not open." };
    if (receipt.result?.cancelled) return { tool: "android_file_picker", context: "File selection was cancelled." };
    return { tool: "android_file_picker", context: receipt.result?.textIncluded
      ? "The user selected " + receipt.result.name + ". Its text content is available for the next assistant step.\n\n" + receipt.result.text
      : "The user selected " + receipt.result?.name + ". " + (receipt.result?.note || "This file type is not available as a plain-text preview.") };
  }

  // Explicit navigation requests use the registered native capability adapters.
  const destinationMatch = message.match(/\b(?:directions to|route to|navigate to|take me to|how do i get to|open (?:the )?map(?:s)? for|find on (?:the )?map)\s+(.+?)(?:[?.!,]|$)/i);
  if (destinationMatch?.[1]) {
    const destination = destinationMatch[1].trim().replace(/\s+(?:today|tomorrow|now|please)$/i, "").trim();
    const mode = /\b(walk|walking|on foot)\b/i.test(message) ? "walking"
      : /\b(cycl|bicycl)\b/i.test(message) ? "bicycling"
      : /\b(transit|bus|train)\b/i.test(message) ? "transit" : "driving";
    const receipt = await actionEngine.execute({
      capabilityId: /\b(directions|route|navigate|take me)\b/i.test(message) ? "maps.get_directions" : "maps.search_place",
      input: /\b(directions|route|navigate|take me)\b/i.test(message) ? { destination, mode } : { query: destination }
    });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "The map action could not be completed." };
    return { tool: "android_maps", context: "AURORA handed " + destination + " to the installed map application. " + (receipt.result?.mode ? "Travel mode: " + receipt.result.mode + "." : "") };
  }

  // Media search is a handoff to the user's installed player; it does not
  // download media or bypass that application's playback controls.
  const mediaMatch = message.match(/^\s*(?:hey aurora[, ]*)?(?:please\s+)?(?:play|find and play|search and play)\s+(.+?)[?.!]*\s*$/i);
  if (mediaMatch?.[1]) {
    const query = mediaMatch[1].trim();
    const receipt = await actionEngine.execute({ capabilityId: "media.search_play", input: { query } });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "The media app could not open." };
    return { tool: "android_media", context: "AURORA handed the search for " + query + " to an installed media app. Playback remains under your app's controls." };
  }

  const receipt = await actionEngine.execute({ capabilityId: "assistant.route_request", input: { text: message } });
  if (receipt.status !== "completed") {
    return { error: receipt.error?.message || "AURORA could not route that request." };
  }
  return receipt.result || null;
}

const auroraRuntime = Object.freeze({
  actions: actionEngine,
  approvals: approvalBroker,
  capabilities: () => actionEngine.listCapabilities(),
  availability: (capabilityId) => actionEngine.getAvailability(capabilityId),
  execute: (request) => actionEngine.execute(request),
  routeMessage,
  parseCalendarIntent,
  subscribe: (listener) => actionEngine.subscribe(listener),
  subscribeApprovals: (listener) => approvalBroker.subscribe(listener)
});

export { auroraRuntime };
