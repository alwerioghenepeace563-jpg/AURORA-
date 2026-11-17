import { auroraApiUrl, auroraNative } from "../lib/aurora-native";
import { createResearchCache } from "./research-cache";
import { extractPublicPageInIsolatedBrowser } from "./browser-engine";
import { buildResearchContext } from "./citation-engine";

const sessionCache = createResearchCache({ ttlMs: 45000, maxEntries: 6 });

function deviceTaskId() {
  return "aurora-device-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export async function runAuroraResearch(query, options = {}) {
  const request = {
    query: String(query || "").trim().slice(0, 240),
    intent: options.intent || "quick",
    mediaTypes: Array.isArray(options.mediaTypes) ? options.mediaTypes : undefined,
    freshness: options.freshness || "any"
  };
  if (request.query.length < 2) throw new Error("Enter a research query.");
  const cached = sessionCache.get(request);
  if (cached) return cached;

  let serverError = null;
  try {
    const response = await fetch(auroraApiUrl("/api/search"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, research: true })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "AURORA research could not complete.");
    sessionCache.set(request, data);
    return data;
  } catch (error) {
    serverError = error;
  }

  if (auroraNative.isAndroid() && request.mediaTypes.includes("web")) {
    const taskId = deviceTaskId();
    const searchUrl = "https://www.google.com/search?q=" + encodeURIComponent(request.query);
    const page = await extractPublicPageInIsolatedBrowser(searchUrl, taskId);
    const source = {
      sourceId: "device-search:" + taskId, title: page.title || "Google Search results",
      url: page.url, domain: "google.com", publisher: "Google Search",
      provider: "AURORA isolated Android browser", retrievedAt: page.retrievedAt,
      sourceType: "other", trustAssessment: "unknown"
    };
    const result = {
      taskId, query: request.query, intent: request.intent, mediaTypes: request.mediaTypes,
      freshness: request.freshness, status: "partial", sources: [source], media: [],
      extractedContent: [{ sourceId: source.sourceId, text: page.text, type: "browser_extraction" }],
      verification: { level: "discovery_only", independentDomainCount: 1, providerCount: 1, corroborationEstablished: false, conflicts: [] },
      citations: [{ number: 1, sourceId: source.sourceId, title: source.title, url: source.url, domain: source.domain }],
      warnings: ["Server research was unavailable: " + String(serverError?.message || "network error").slice(0, 160), "Device fallback extracted a search-results page only; open individual sources for verification."],
      startedAt: page.retrievedAt, completedAt: page.retrievedAt
    };
    result.context = buildResearchContext(result);
    return result;
  }
  throw serverError || new Error("AURORA research is unavailable.");
}

export function clearAuroraResearchSessionCache() {
  sessionCache.clear();
}

export async function clearAuroraResearchData() {
  sessionCache.clear();
  if (auroraNative.isAndroid()) return auroraNative.clearResearchBrowserData();
  return { started: true, isolated: true };
}
