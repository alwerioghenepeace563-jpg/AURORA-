import { auroraApiUrl, auroraNative } from "../lib/aurora-native";
import { createResearchCache } from "./research-cache";
import { extractPublicPageInIsolatedBrowser } from "./browser-engine";
import { buildResearchContext } from "./citation-engine";
import { inferResearchIntent } from "./intent-engine";

const sessionCache = createResearchCache({ ttlMs: 45000, maxEntries: 6 });

function deviceTaskId() {
  return "aurora-device-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}


const LOCAL_LIBRARY_KEY = "aurora-research-library-v1";
function readLocalLibrary() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(LOCAL_LIBRARY_KEY) || "[]");
    return Array.isArray(value) ? value.slice(0, 40) : [];
  } catch { return []; }
}
function writeLocalLibrary(items) {
  try { globalThis.localStorage?.setItem(LOCAL_LIBRARY_KEY, JSON.stringify(items.slice(0, 40))); } catch {}
}
async function researchAction(action, accessToken, body = {}) {
  if (!accessToken) throw new Error("Sign in to use cloud research storage.");
  const response = await fetch(auroraApiUrl("/api/search"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
    body: JSON.stringify({ action, ...body }),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "AURORA research storage is unavailable.");
  return data;
}

export async function createAuroraResearchTask(query, options = {}, accessToken) {
  const inferred = inferResearchIntent(query, options);
  const data = await researchAction("create-task", accessToken, inferred);
  return { ...data.task, workerWake: data.workerWake || "not_configured" };
}
export async function getAuroraResearchTask(taskId, accessToken) {
  if (!accessToken) throw new Error("Sign in to check this research task.");
  const response = await fetch(auroraApiUrl("/api/search?action=task-status&taskId=" + encodeURIComponent(taskId)), {
    headers: { Authorization: "Bearer " + accessToken }, cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not refresh the research task.");
  return data.task;
}
export async function listAuroraResearchTasks(accessToken) {
  if (!accessToken) return [];
  const response = await fetch(auroraApiUrl("/api/search?action=task-list"), {
    headers: { Authorization: "Bearer " + accessToken }, cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not load research tasks.");
  return Array.isArray(data.tasks) ? data.tasks : [];
}
export async function cancelAuroraResearchTask(taskId, accessToken) {
  const data = await researchAction("cancel-task", accessToken, { taskId });
  return data;
}
export async function saveAuroraResearchResult(result, accessToken, options = {}) {
  const record = {
    id: globalThis.crypto?.randomUUID?.() || "research-" + Date.now().toString(36),
    title: String(options.title || result?.query || "Saved research").slice(0, 160),
    query: String(result?.query || "").slice(0, 240),
    result,
    tags: Array.isArray(options.tags) ? options.tags.slice(0, 8) : [],
    created_at: new Date().toISOString()
  };
  if (accessToken) {
    try {
      const data = await researchAction("save-research", accessToken, record);
      return { ...(data.item || record), localOnly: false };
    } catch (error) {
      const local = readLocalLibrary();
      writeLocalLibrary([record, ...local.filter(item => item.id !== record.id)]);
      return { ...record, localOnly: true, warning: error?.message || "Cloud save unavailable; saved on this device." };
    }
  }
  const local = readLocalLibrary();
  writeLocalLibrary([record, ...local.filter(item => item.id !== record.id)]);
  return { ...record, localOnly: true };
}
export async function listAuroraSavedResearch(accessToken) {
  const local = readLocalLibrary();
  if (!accessToken) return local;
  try {
    const response = await fetch(auroraApiUrl("/api/search?action=library-list"), {
      headers: { Authorization: "Bearer " + accessToken }, cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Cloud research library unavailable.");
    const cloud = Array.isArray(data.items) ? data.items : [];
    const seen = new Set(cloud.map(item => item.id));
    return [...cloud, ...local.filter(item => !seen.has(item.id))].slice(0, 40);
  } catch {
    return local;
  }
}
export async function deleteAuroraSavedResearch(id, accessToken) {
  const local = readLocalLibrary().filter(item => item.id !== String(id));
  writeLocalLibrary(local);
  if (accessToken && /^[0-9a-f-]{36}$/i.test(String(id))) {
    await researchAction("delete-research", accessToken, { id });
  }
  return { deleted: true, id: String(id) };
}

export async function runAuroraResearch(query, options = {}) {
  const inferred = inferResearchIntent(String(query || "").trim().slice(0, 240), options);
  const request = {
    ...inferred,
    freshness: options.freshness || inferred.freshness
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
