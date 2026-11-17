export const RESEARCH_PROVIDERS = Object.freeze([
  { id: "duckduckgo", label: "DuckDuckGo", kind: "web", priority: 1 },
  { id: "bing", label: "Bing", kind: "web", priority: 2 },
  { id: "wikipedia", label: "Wikipedia", kind: "reference", priority: 3 },
  { id: "google-news", label: "Google News", kind: "news", priority: 1 },
  { id: "wikimedia-commons", label: "Wikimedia Commons", kind: "media", priority: 1 },
  { id: "internet-archive", label: "Internet Archive", kind: "media", priority: 2 }
]);

export function getResearchProvider(id) {
  return RESEARCH_PROVIDERS.find(provider => provider.id === String(id)) || null;
}

export function listResearchProviders(kind) {
  return RESEARCH_PROVIDERS.filter(provider => !kind || provider.kind === kind).map(provider => ({ ...provider }));
}
