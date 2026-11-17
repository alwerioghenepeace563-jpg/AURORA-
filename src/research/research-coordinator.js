import { randomUUID } from "node:crypto";
import { inferResearchIntent } from "./intent-engine.js";
import { normalizeWebSources, normalizeMediaResults } from "./result-normalizer.js";
import { assessResearchEvidence } from "./verification-engine.js";
import { buildResearchContext, buildResearchCitations } from "./citation-engine.js";
import { discoverWebSources } from "./search-engine.js";
import { discoverResearchMedia } from "./visual-engine.js";

export function createResearchCoordinator(dependencies = {}) {
  const search = dependencies.search || discoverWebSources;
  const mediaSearch = dependencies.media || discoverResearchMedia;

  return async function runAuroraResearch(input = {}) {
    const request = inferResearchIntent(input.query, input);
    if (request.query.length < 2) throw new Error("Enter a research query with at least two characters.");
    const taskId = String(input.taskId || randomUUID()).slice(0, 100);
    const startedAt = new Date().toISOString();
    const warnings = [];
    let hasProviderFailure = false;
    const jobs = [];

    if (request.mediaTypes.includes("web")) {
      jobs.push(Promise.resolve().then(() => search(request.query)).then(value => ({ kind: "web", value })));
    }
    const requestedMedia = [...new Set(request.mediaTypes.filter(type => type !== "web"))];
    const mediaJobs = [];
    if (requestedMedia.includes("image") && requestedMedia.includes("video")) {
      mediaJobs.push("all");
      requestedMedia.splice(requestedMedia.indexOf("image"), 1);
      requestedMedia.splice(requestedMedia.indexOf("video"), 1);
    }
    mediaJobs.push(...requestedMedia);
    for (const mediaType of mediaJobs) {
      jobs.push(Promise.resolve().then(() => mediaSearch(request.query, mediaType)).then(value => ({ kind: "media", mediaType, value })));
    }

    const settled = await Promise.allSettled(jobs);
    const webGroups = [];
    const mediaItems = [];
    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        hasProviderFailure = true;
        warnings.push(String(outcome.reason?.message || "A research provider was unavailable.").slice(0, 220));
        continue;
      }
      if (outcome.value.kind === "web") {
        const value = outcome.value.value || {};
        webGroups.push(...(Array.isArray(value.providers) ? value.providers : [value]));
        if (Array.isArray(value.errors) && value.errors.length) {
          hasProviderFailure = true;
          warnings.push(...value.errors.slice(0, 3).map(error => String(error).slice(0, 180)));
        }
      } else {
        const value = outcome.value.value || {};
        const foundMedia = Array.isArray(value.results) ? value.results : [];
        mediaItems.push(...foundMedia.map(item => outcome.value.mediaType === "diagram" ? { ...item, kind: "diagram" } : item));
        if (Array.isArray(value.errors) && value.errors.length) {
          hasProviderFailure = true;
          warnings.push(...value.errors.slice(0, 3).map(error => String(error).slice(0, 180)));
        }
        if (value.warning) warnings.push(String(value.warning).slice(0, 180));
      }
    }

    const retrievedAt = new Date().toISOString();
    const web = normalizeWebSources(webGroups, taskId, retrievedAt);
    const visual = normalizeMediaResults(mediaItems, taskId, retrievedAt);
    const sources = [...web.sources, ...visual.sources];
    const verification = assessResearchEvidence(sources);
    if (sources.length) warnings.push("Search snippets are discovery leads; full-page claim verification has not been performed.");
    const missingMediaLabels = {
      image: "image previews", video: "video previews",
      diagram: "diagram previews", document: "document previews"
    };
    for (const mediaType of request.mediaTypes.filter(type => type !== "web")) {
      const matches = visual.media.some(item => item.type === mediaType || (mediaType === "image" && item.type === "diagram"));
      if (!matches) {
        hasProviderFailure = true;
        warnings.push("No supported " + (missingMediaLabels[mediaType] || "media results") + " were found for this query.");
      }
    }
    const result = {
      taskId, query: request.query,
      intent: request.intent, mediaTypes: request.mediaTypes,
      freshness: request.freshness,
      status: sources.length || visual.media.length ? (hasProviderFailure ? "partial" : "complete") : "failed",
      sources, media: visual.media, extractedContent: web.extractedContent,
      verification, citations: buildResearchCitations(sources),
      warnings: [...new Set(warnings)].slice(0, 10),
      startedAt, completedAt: new Date().toISOString()
    };
    result.context = buildResearchContext(result);
    return result;
  };
}

export const runAuroraResearch = createResearchCoordinator();
