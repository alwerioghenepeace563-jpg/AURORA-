function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.href;
  } catch { return ""; }
}

function domainOf(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

export function normalizeWebSources(providerResults, taskId, retrievedAt = new Date().toISOString()) {
  const groups = Array.isArray(providerResults) ? providerResults : providerResults ? [providerResults] : [];
  const sources = [];
  const snippets = [];
  const seen = new Set();
  for (const group of groups) {
    const provider = String(group?.source || group?.provider || "Web search").slice(0, 80);
    for (const item of (Array.isArray(group?.results) ? group.results : [])) {
      const url = safeHttpsUrl(item?.url);
      const title = String(item?.title || "").trim().slice(0, 220);
      if (!url || !title || seen.has(url)) continue;
      seen.add(url);
      const sourceId = "web:" + sources.length + ":" + domainOf(url);
      sources.push({
        sourceId, title, url, domain: domainOf(url),
        publisher: provider, provider, retrievedAt,
        sourceType: /wikipedia/i.test(provider) ? "reference" : "article",
        trustAssessment: /\.gov(?:\.ng)?$|\.gov\.[a-z]{2}$/i.test(domainOf(url)) ? "moderate" : "unknown"
      });
      const snippet = String(item?.snippet || "").trim().slice(0, 700);
      if (snippet) snippets.push({ sourceId, text: snippet, type: "search_snippet" });
    }
  }
  return { sources, extractedContent: snippets };
}

export function normalizeMediaResults(items, taskId, retrievedAt = new Date().toISOString()) {
  const sources = [];
  const media = [];
  const seen = new Set();
  for (const item of (Array.isArray(items) ? items : [])) {
    const pageUrl = safeHttpsUrl(item?.pageUrl || item?.downloadUrl);
    const previewUrl = safeHttpsUrl(item?.previewUrl);
    const originalUrl = safeHttpsUrl(item?.downloadUrl);
    if (!pageUrl || !originalUrl || seen.has(originalUrl)) continue;
    seen.add(originalUrl);
    const sourceId = "media:" + media.length + ":" + domainOf(pageUrl);
    const provider = String(item?.provider || "Media provider").slice(0, 80);
    sources.push({
      sourceId, title: String(item?.title || "Media source").slice(0, 220),
      url: pageUrl, domain: domainOf(pageUrl), publisher: provider, provider,
      retrievedAt, sourceType: "other", trustAssessment: "unknown"
    });
    media.push({
      mediaId: String(item?.id || sourceId).slice(0, 220),
      type: ["image", "video", "document", "diagram"].includes(item?.kind) ? item.kind : "image",
      title: String(item?.title || "Untitled media").slice(0, 220),
      sourceUrl: pageUrl, previewUrl: previewUrl || undefined,
      originalUrl, mimeType: String(item?.mimeType || "").slice(0, 100) || undefined,
      attribution: String(item?.attribution || "").slice(0, 300) || undefined,
      license: String(item?.license || "").slice(0, 160) || undefined,
      licenseUrl: safeHttpsUrl(item?.licenseUrl) || undefined,
      provider, sourceId, retrievedAt
    });
  }
  return { sources, media };
}
