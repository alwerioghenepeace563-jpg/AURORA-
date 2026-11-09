/**
 * AURORA Universal Action Planner (deterministic safety-first stage).
 * Converts clearly expressed multi-action requests into typed capability steps.
 * It never invents parameters or executes a plan; the runtime previews it first.
 */
import { parseCalendarIntent } from "./aurora-intent-parser.js";

const APP_TARGETS = [
  { pattern: /whatsapp business/i, packageName: "com.whatsapp.w4b", label: "WhatsApp Business" },
  { pattern: /whatsapp/i, packageName: "com.whatsapp", label: "WhatsApp" },
  { pattern: /facebook lite/i, packageName: "com.facebook.lite", label: "Facebook Lite" },
  { pattern: /facebook/i, packageName: "com.facebook.katana", label: "Facebook" },
  { pattern: /chrome/i, packageName: "com.android.chrome", label: "Chrome" },
  { pattern: /youtube/i, packageName: "com.google.android.youtube", label: "YouTube" },
  { pattern: /gmail/i, packageName: "com.google.android.gm", label: "Gmail" },
  { pattern: /google maps|maps/i, packageName: "com.google.android.apps.maps", label: "Google Maps" },
  { pattern: /messages/i, packageName: "com.google.android.apps.messaging", label: "Messages" },
  { pattern: /settings/i, packageName: "com.android.settings", label: "Settings" }
];

function clean(value) { return String(value || "").trim().replace(/[?.!,;]+$/, "").trim(); }

function resolveClause(clause, capabilities) {
  const text = clean(clause);
  if (!text) return null;
  const has = (id) => capabilities.has(id);
  if (/^(?:please\s+)?(?:open|launch)\s+/i.test(text) && has("android.open_app")) {
    const app = APP_TARGETS.find((item) => item.pattern.test(text));
    if (app) return { capabilityId: "android.open_app", input: { packageName: app.packageName }, label: "Open " + app.label };
  }
  // Accept natural check-battery phrasing with or without the word status.
  if (/^(?:(?:what(?:'s| is)\s+)?(?:my\s+)?(?:battery|device status|phone status)|check\s+(?:my\s+)?(?:battery|device|phone)(?:\s+status)?)$/i.test(text) && has("device.get_status")) {
    return { capabilityId: "device.get_status", input: {}, label: "Check device and battery status" };
  }
  if (/^(?:turn on|switch on|enable)\s+(?:the\s+)?(?:flashlight|torch)$|^(?:flashlight|torch) on$/i.test(text) && has("device.set_flashlight")) {
    return { capabilityId: "device.set_flashlight", input: { enabled: true }, label: "Turn on flashlight" };
  }
  if (/^(?:turn off|switch off|disable)\s+(?:the\s+)?(?:flashlight|torch)$|^(?:flashlight|torch) off$/i.test(text) && has("device.set_flashlight")) {
    return { capabilityId: "device.set_flashlight", input: { enabled: false }, label: "Turn off flashlight" };
  }
  if (/^(?:read|check|show|summari[sz]e)\s+(?:my\s+)?(?:recent\s+)?notifications$/i.test(text) && has("notifications.read_recent")) {
    return { capabilityId: "notifications.read_recent", input: {}, label: "Read recent notifications" };
  }
  const direction = text.match(/^(?:get )?(?:directions to|route to|navigate to|take me to)\s+(.+)$/i);
  if (direction && has("maps.get_directions")) {
    const destination = clean(direction[1]);
    const mode = /\b(walk|walking|on foot)\b/i.test(text) ? "walking" : /\b(cycl|bicycl)\b/i.test(text) ? "bicycling" : /\b(transit|bus|train)\b/i.test(text) ? "transit" : "driving";
    if (destination) return { capabilityId: "maps.get_directions", input: { destination, mode }, label: "Get directions to " + destination };
  }
  const place = text.match(/^(?:find|search for|look up)\s+(.+?)\s+on (?:the )?map$/i);
  if (place && has("maps.search_place")) return { capabilityId: "maps.search_place", input: { query: clean(place[1]) }, label: "Find " + clean(place[1]) + " on the map" };
  const media = text.match(/^(?:play|find and play|search and play)\s+(.+)$/i);
  if (media && has("media.search_play")) return { capabilityId: "media.search_play", input: { query: clean(media[1]) }, label: "Find media: " + clean(media[1]) };
  if (/^(?:choose|pick|open|read)\s+(?:a\s+)?(?:file|document)$/i.test(text) && has("files.pick_document")) {
    return { capabilityId: "files.pick_document", input: {}, label: "Choose a document" };
  }
  const calendar = parseCalendarIntent(text);
  if (calendar && has("calendar.prepare_event")) return { capabilityId: "calendar.prepare_event", input: calendar, label: "Prepare calendar event: " + calendar.title };
  return null;
}

function splitActions(message) {
  const source = String(message || "").trim().replace(/^(?:hey aurora[, ]*|aurora[, ]*)/i, "").replace(/[.!?]+$/, "");
  if (!source) return [];
  return source.split(/\s+(?:and then|then|and)\s+/i).map(clean).filter(Boolean).slice(0, 8);
}

function planAuroraActions(message, capabilities) {
  const available = new Set((Array.isArray(capabilities) ? capabilities : []).map((item) => item.id));
  const clauses = splitActions(message);
  if (clauses.length < 2) return null;
  const steps = clauses.map((clause) => resolveClause(clause, available));
  const unsupportedClauses = clauses.filter((clause, index) => !steps[index]);
  if (unsupportedClauses.length) return { unsupported: true, unsupportedClauses };
  const unique = new Set();
  const normalized = steps.filter((step) => {
    const key = step.capabilityId + ":" + JSON.stringify(step.input);
    if (unique.has(key)) return false;
    unique.add(key);
    return true;
  });
  if (normalized.length < 2) return { unsupported: true, unsupportedClauses: clauses };
  return {
    title: "AURORA multi-action request",
    summary: normalized.map((step) => step.label).join(" → "),
    steps: normalized.map((step, index) => ({
      id: "step-" + (index + 1),
      capabilityId: step.capabilityId,
      input: step.input,
      dependsOn: index ? ["step-" + index] : []
    }))
  };
}

export { planAuroraActions, splitActions };
