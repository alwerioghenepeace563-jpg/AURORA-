import cors from "../lib/cors.cjs";
import auth from "../lib/supabase-auth.cjs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { inferResearchIntent } from "../src/research/intent-engine.js";
const { applyAuroraCors } = cors;
const { verifySupabaseUser } = auth;
function decodeHtml(value = "") {
  return value
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
function stripTags(value = "") {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}
function safeUrl(raw, base) {
  try {
    const u = new URL(decodeHtml(raw), base);
    if (u.hostname.includes("duckduckgo.com") && u.pathname === "/l/") {
      const target = u.searchParams.get("uddg");
      if (target) return safeUrl(target, base);
    }
    if (!["http:", "https:"].includes(u.protocol)) return "";
    if (/duckduckgo\.com|bing\.com/.test(u.hostname)) return "";
    if (/google\.com$/.test(u.hostname) &&
        !(u.hostname === "news.google.com" && /^\/(?:rss\/)?articles\//.test(u.pathname))) return "";
    return u.href;
  } catch { return ""; }
}
function collectAnchors(html, pattern, base, snippetPattern) {
  const results = [];
  let match;
  while ((match = pattern.exec(html)) && results.length < 8) {
    const url = safeUrl(match[1], base);
    const title = stripTags(match[2]);
    if (!url || !title || results.some(item => item.url === url)) continue;
    const tail = html.slice(pattern.lastIndex, pattern.lastIndex + 2200);
    const snippetMatch = tail.match(snippetPattern);
    results.push({ title, url, snippet: snippetMatch ? stripTags(snippetMatch[1]) : "" });
  }
  return results;
}
function parseDuck(html) {
  return collectAnchors(html, /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    "https://duckduckgo.com", /class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i);
}
function parseDuckLite(html) {
  const results = [];
  const re = /<a[^>]+class=["'][^"']*result-link[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 8) {
    const url = safeUrl(m[1], "https://lite.duckduckgo.com");
    const title = stripTags(m[2]);
    const tail = html.slice(re.lastIndex, re.lastIndex + 1400);
    const sm = tail.match(/class=["'][^"']*result-snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:td|div)>/i);
    if (url && title && !results.some(x => x.url === url)) results.push({title,url,snippet:sm ? stripTags(sm[1]) : ""});
  }
  return results;
}
function parseBing(html) {
  const results = [];
  const re = /<li class=["']b_algo["'][^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 8) {
    const link = m[1].match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const url = safeUrl(link[1], "https://www.bing.com");
    const title = stripTags(link[2]);
    const sm = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (url && title && !results.some(x => x.url === url)) results.push({title,url,snippet:sm ? stripTags(sm[1]) : ""});
  }
  return results;
}
async function parseDuckApi(query) {
  const url = "https://api.duckduckgo.com/?q="+encodeURIComponent(query)+"&format=json&no_html=1&skip_disambig=1";
  const response = await fetch(url, {headers:{"Accept":"application/json"},signal:AbortSignal.timeout(6500)});
  if (!response.ok) throw new Error("DuckDuckGo API HTTP "+response.status);
  const data = await response.json();
  const results = [];
  const add = (title, target, snippet) => {
    const safe = safeUrl(target, "https://duckduckgo.com");
    if (safe && title && !results.some(x => x.url === safe)) results.push({title:stripTags(title),url:safe,snippet:stripTags(snippet || "")});
  };
  if (data.AbstractURL) add(data.Heading || query, data.AbstractURL, data.AbstractText);
  for (const topic of (data.RelatedTopics || [])) {
    if (topic.Topics) {
      for (const nested of topic.Topics) if (nested.FirstURL) add(nested.Text?.split(" - ")[0] || nested.Text, nested.FirstURL, nested.Text);
    } else if (topic.FirstURL) add(topic.Text?.split(" - ")[0] || topic.Text, topic.FirstURL, topic.Text);
    if (results.length >= 6) break;
  }
  if (!results.length) throw new Error("DuckDuckGo API returned no instant results");
  return results.slice(0, 6);
}
function parseGoogleNews(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  const field = (html, name) => {
    const found = html.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + ">", "i"));
    return found ? found[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : "";
  };
  while ((m = re.exec(xml)) && items.length < 8) {
    const item = m[1];
    const title = stripTags(field(item, "title"));
    const url = safeUrl(field(item, "link"), "https://news.google.com");
    const descriptionRaw = field(item, "description");
    const description = stripTags(descriptionRaw);
    const pubDate = stripTags(field(item, "pubDate"));
    const imageMatch = item.match(/<(?:media:content|media:thumbnail|enclosure)[^>]+(?:url|href)=["']([^"']+)["'][^>]*>/i)
      || descriptionRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
    let image = "";
    if (imageMatch?.[1]) {
      try {
        const candidate = new URL(decodeHtml(imageMatch[1]), "https://news.google.com");
        if (candidate.protocol === "https:") image = candidate.href;
      } catch {}
    }
    if (title && url && !items.some(x => x.url === url)) {
      items.push({ title, url, snippet: [description, pubDate ? "Published: " + pubDate : ""].filter(Boolean).join(" · "), ...(image ? {image} : {}) });
    }
  }
  return items;
}
async function parseGoogleNewsSearch(query) {
  const url = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=en-NG&gl=NG&ceid=NG:en";
  const response = await fetch(url, {headers:{"Accept":"application/rss+xml, application/xml, text/xml"},signal:AbortSignal.timeout(6500)});
  if (!response.ok) throw new Error("Google News HTTP " + response.status);
  const results = parseGoogleNews(await response.text());
  if (!results.length) throw new Error("Google News returned no parseable results");
  return results;
}
async function parseWikipedia(query) {
  const url = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="+encodeURIComponent(query)+"&srlimit=6&format=json&origin=*";
  const response = await fetch(url, {headers:{"Accept":"application/json","User-Agent":"AURORA assistant search/1.0"},signal:AbortSignal.timeout(4500)});
  if (!response.ok) throw new Error("Wikipedia HTTP "+response.status);
  const data = await response.json();
  return (data?.query?.search || []).map(item => ({
    title: item.title,
    url: "https://en.wikipedia.org/wiki/"+encodeURIComponent(item.title.replace(/ /g, "_")),
    snippet: stripTags(item.snippet || "")
  }));
}

function decodeBingValue(value = "") {
  return String(value).replace(/\\u0026/gi, "&").replace(/\\u003d/gi, "=")
    .replace(/\\u002f/gi, "/").replace(/\\u003a/gi, ":")
    .replace(/\\\//g, "/").replace(/&amp;/g, "&").trim();
}
function parseBingImages(html) {
  const results = [];
  const imagePattern = /"murl"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = imagePattern.exec(html)) && results.length < 16) {
    const context = html.slice(Math.max(0, match.index - 1800), Math.min(html.length, match.index + 4200));
    const image = decodeBingValue(match[1]);
    const titleMatch = context.match(/"t"\s*:\s*"([^"]*)"/);
    const pageMatch = context.match(/"purl"\s*:\s*"([^"]*)"/);
    const descriptionMatch = context.match(/"desc"\s*:\s*"([^"]*)"/);
    const title = stripTags(decodeBingValue(titleMatch?.[1] || "Visual reference"));
    try {
      const imageUrl = new URL(image);
      const sourceUrl = pageMatch?.[1] ? new URL(decodeBingValue(pageMatch[1])) : imageUrl;
      if (imageUrl.protocol !== "https:" || sourceUrl.protocol !== "https:" || !title ||
          /(^|\.)(localhost|local|internal)$/i.test(imageUrl.hostname) ||
          /(^|\.)(localhost|local|internal)$/i.test(sourceUrl.hostname)) continue;
      if (!results.some(item => item.image === imageUrl.href)) results.push({
        title: title.slice(0, 140), image: imageUrl.href, url: sourceUrl.href,
        snippet: stripTags(decodeBingValue(descriptionMatch?.[1] || "Retrieved from Bing Images")).slice(0, 220)
      });
    } catch {}
  }
  return results;
}
export async function searchBingImages(query) {
  const url = "https://www.bing.com/images/search?q=" + encodeURIComponent(query) + "&form=HDRSC3";
  const response = await fetch(url, {
    headers: {"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36","Accept":"text/html,application/xhtml+xml"},
    signal: AbortSignal.timeout(6500)
  });
  if (!response.ok) throw new Error("Bing Images HTTP " + response.status);
  const html = (await response.text()).slice(0, 1800000);
  const results = parseBingImages(html);
  if (!results.length) throw new Error("Bing Images returned no parseable image previews");
  return {query,source:"Bing Images",results:results.slice(0,8)};
}

export async function searchAuroraWeb(rawQuery) {
  const query = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 240) : "";
  if (query.length < 2) throw new Error("Search query is too short.");

  const looksLikeNews = /\b(news|headlines|breaking news|current affairs)\b|\b(latest|breaking|current|today'?s|recent)\b.{0,50}\b(naija|Nigeria|world|tech|sports|politics|updates)\b/i.test(query);
  const errors = [];
  const attemptGroup = async (attempts) => {
    try {
      return await Promise.any(attempts);
    } catch (error) {
      for (const item of (error?.errors || [])) {
        errors.push(String(item?.message || "Provider failed").slice(0, 160));
      }
      return null;
    }
  };

  if (looksLikeNews) {
    const news = await attemptGroup([
      parseGoogleNewsSearch(query).then(results => ({
        query, results, source: "Google News"
      }))
    ]);
    if (news?.results?.length) {
      return { ...news, results: news.results.slice(0, 5) };
    }
  }

  const providers = [
    { name: "DuckDuckGo", url: "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), parse: parseDuck },
    { name: "DuckDuckGo Lite", url: "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query), parse: parseDuckLite },
    { name: "Bing", url: "https://www.bing.com/search?q=" + encodeURIComponent(query), parse: parseBing }
  ];

  const webResult = await attemptGroup(providers.map(async provider => {
    const response = await fetch(provider.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(4500)
    });
    if (!response.ok) throw new Error(provider.name + " HTTP " + response.status);
    const results = provider.parse(await response.text());
    if (!results.length) throw new Error(provider.name + " returned no parseable results");
    return { query, results, source: provider.name };
  }));

  if (webResult?.results?.length) {
    return { ...webResult, results: webResult.results.slice(0, 5) };
  }

  const fallback = await attemptGroup([
    parseWikipedia(query).then(results => {
      if (!results.length) throw new Error("Wikipedia returned no results");
      return { query, results, source: "Wikipedia" };
    }),
    parseDuckApi(query).then(results => ({
      query, results, source: "DuckDuckGo Instant Answers"
    }))
  ]);

  if (fallback?.results?.length) {
    return { ...fallback, results: fallback.results.slice(0, 5) };
  }

  throw new Error("All search providers failed: " + errors.join("; ").slice(0, 300));
}


export async function searchAuroraWebMulti(rawQuery) {
  const query = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 240) : "";
  if (query.length < 2) throw new Error("Search query is too short.");
  const providers = [
    { name: "DuckDuckGo", url: "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), parse: parseDuck },
    { name: "DuckDuckGo Lite", url: "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query), parse: parseDuckLite },
    { name: "Bing", url: "https://www.bing.com/search?q=" + encodeURIComponent(query), parse: parseBing },
    { name: "Wikipedia", run: () => parseWikipedia(query) }
  ];
  if (/\b(news|headlines|breaking|latest|current|today|recent)\b/i.test(query)) {
    providers.push({ name: "Google News", run: () => parseGoogleNewsSearch(query) });
  }
  const settled = await Promise.allSettled(providers.map(async provider => {
    let results;
    if (provider.run) results = await provider.run();
    else {
      const response = await fetch(provider.url, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(5200)
      });
      if (!response.ok) throw new Error(provider.name + " HTTP " + response.status);
      results = provider.parse(await response.text());
    }
    if (!Array.isArray(results) || !results.length) throw new Error(provider.name + " returned no parseable results");
    return { source: provider.name, results: results.slice(0, 5) };
  }));
  const groups = [];
  const errors = [];
  for (let index = 0; index < settled.length; index++) {
    const item = settled[index];
    if (item.status === "fulfilled") groups.push(item.value);
    else errors.push(String(item.reason?.message || providers[index].name + " failed").slice(0, 180));
  }
  const results = groups.flatMap(group => group.results.map(item => ({ ...item, provider: group.source })));
  if (!results.length) throw new Error("All research search providers failed: " + errors.join("; ").slice(0, 300));
  return { query, source: "AURORA multi-source search", providers: groups, results: results.slice(0, 16), errors };
}


function timingSafeTokenMatch(a, b) { try { return timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; } }
function researchSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_API || "")
    .trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
  const key = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  return { url, key };
}
function bearerToken(req) {
  const match = String(req?.headers?.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}
async function researchUserRest(req, path, init = {}) {
  const { url, key } = researchSupabaseConfig();
  if (!url || !key) throw new Error("AURORA cloud research is not configured.");
  const response = await fetch(url + path, {
    ...init,
    headers: {
      apikey: key,
      Authorization: "Bearer " + bearerToken(req),
      "Content-Type": "application/json",
      ...(init.headers || {})
    },
    signal: init.signal || AbortSignal.timeout(12000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error("Supabase research storage returned HTTP " + response.status + ". " + detail.slice(0, 180));
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
function safeResearchSnapshot(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const pick = (item, fields) => Object.fromEntries(fields.filter(key => item?.[key] != null).map(key => [key, item[key]]));
  return {
    taskId: String(source.taskId || "").slice(0, 100),
    query: String(source.query || "").slice(0, 240),
    intent: String(source.intent || "quick").slice(0, 20),
    status: ["complete","completed","partial","failed"].includes(source.status) ? source.status : "complete",
    mediaTypes: Array.isArray(source.mediaTypes) ? source.mediaTypes.slice(0, 5) : ["web"],
    sources: (Array.isArray(source.sources) ? source.sources : []).slice(0, 24).map(item => pick(item, ["sourceId","title","url","domain","publisher","provider","retrievedAt","sourceType","trustAssessment"])),
    media: (Array.isArray(source.media) ? source.media : []).slice(0, 20).map(item => pick(item, ["mediaId","type","title","previewUrl","originalUrl","sourceUrl","provider","license","attribution","retrievedAt"])),
    extractedContent: (Array.isArray(source.extractedContent) ? source.extractedContent : []).slice(0, 24).map(item => ({ sourceId: String(item?.sourceId || "").slice(0, 120), text: String(item?.text || "").slice(0, 650), type: String(item?.type || "snippet").slice(0, 40) })),
    citations: (Array.isArray(source.citations) ? source.citations : []).slice(0, 24).map(item => pick(item, ["number","sourceId","title","url","domain"])),
    verification: source.verification && typeof source.verification === "object" ? pick(source.verification, ["level","diversityLevel","sourceCount","independentDomainCount","providerCount","corroborationEstablished","conflicts","note"]) : null,
    warnings: (Array.isArray(source.warnings) ? source.warnings : []).slice(0, 10).map(item => String(item).slice(0, 220)),
    startedAt: source.startedAt || null,
    completedAt: source.completedAt || null
  };
}
async function handleResearchCloudAction(req, res, action, body = {}) {
  const verified = await verifySupabaseUser(req);
  if (!verified.ok) return res.status(verified.status).json({ error: verified.error });
  const ownerId = verified.user.id;
  const id = String(req.query?.taskId || body.taskId || body.id || "");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const taskFields = "id,query,request,status,result,error,attempts,max_attempts,created_at,updated_at,started_at,completed_at";

  try {
    if (action === "task-status" || action === "task-list") {
      if (action === "task-status" && !uuidPattern.test(id)) return res.status(400).json({ error: "A valid research task ID is required." });
      const path = action === "task-status"
        ? "/rest/v1/aurora_research_tasks?select=" + taskFields + "&id=eq." + encodeURIComponent(id) + "&limit=1"
        : "/rest/v1/aurora_research_tasks?select=" + taskFields + "&order=created_at.desc&limit=20";
      const rows = await researchUserRest(req, path, { method: "GET" });
      if (action === "task-status" && !rows?.length) return res.status(404).json({ error: "Research task not found." });
      return res.status(200).json(action === "task-status" ? { task: rows[0] } : { tasks: rows || [] });
    }

    if (action === "create-task") {
      const request = inferResearchIntent(body.query, body);
      if (request.query.length < 2) return res.status(400).json({ error: "Enter a research query." });
      const rows = await researchUserRest(req, "/rest/v1/aurora_research_tasks", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ user_id: ownerId, query: request.query, request })
      });
      const task = Array.isArray(rows) ? rows[0] : null;
      if (!task?.id) return res.status(502).json({ error: "AURORA could not create the background research task." });

      const workerUrl = String(process.env.AURORA_RESEARCH_WORKER_URL || "").trim();
      const workerToken = String(process.env.AURORA_RESEARCH_WORKER_TOKEN || "").trim();
      if (workerUrl && workerToken) {
        try {
          await fetch(workerUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-aurora-worker-token": workerToken },
            body: JSON.stringify({ source: "task-created" }),
            signal: AbortSignal.timeout(30000)
          });
          const refreshed = await researchUserRest(req, "/rest/v1/aurora_research_tasks?select=" + taskFields + "&id=eq." + encodeURIComponent(task.id) + "&limit=1", { method: "GET" });
          if (refreshed?.[0]) return res.status(202).json({ task: refreshed[0] });
        } catch (wakeError) {
          console.warn("AURORA research task queued; immediate worker wake was unavailable:", wakeError?.message || "Worker wake failed");
        }
      }
      return res.status(202).json({ task });
    }

    if (action === "cancel-task") {
      if (!uuidPattern.test(id)) return res.status(400).json({ error: "A valid research task ID is required." });
      const rows = await researchUserRest(req, "/rest/v1/aurora_research_tasks?id=eq." + encodeURIComponent(id) + "&status=in.(queued,running)", {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "cancelled", error: "Cancelled by the user.", completed_at: new Date().toISOString(), lease_expires_at: null, updated_at: new Date().toISOString() })
      });
      return res.status(200).json({ cancelled: Boolean(rows?.length), task: rows?.[0] || null });
    }

    if (action === "library-list") {
      const rows = await researchUserRest(req, "/rest/v1/aurora_research_saved?select=id,title,query,result,tags,created_at,updated_at&order=created_at.desc&limit=40", { method: "GET" });
      return res.status(200).json({ items: rows || [] });
    }

    if (action === "save-research") {
      const result = safeResearchSnapshot(body.result);
      if (result.query.length < 2 || !result.sources.length) return res.status(400).json({ error: "Save a completed research result with at least one source." });
      const title = String(body.title || result.query).trim().slice(0, 160) || result.query;
      const savedId = uuidPattern.test(String(body.id || "")) ? String(body.id) : randomUUID();
      const tags = [...new Set((Array.isArray(body.tags) ? body.tags : []).map(tag => String(tag).trim().slice(0, 32).toLowerCase()).filter(Boolean))].slice(0, 8);
      if (JSON.stringify(result).length > 280000) return res.status(413).json({ error: "This research result is too large to save. Save a smaller result." });
      const rows = await researchUserRest(req, "/rest/v1/aurora_research_saved?on_conflict=user_id,id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ id: savedId, user_id: ownerId, title, query: result.query, result, tags, updated_at: new Date().toISOString() })
      });
      return res.status(201).json({ item: Array.isArray(rows) ? rows[0] : null });
    }

    if (action === "delete-research") {
      if (!uuidPattern.test(id)) return res.status(400).json({ error: "A valid saved research ID is required." });
      await researchUserRest(req, "/rest/v1/aurora_research_saved?id=eq." + encodeURIComponent(id), { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return res.status(200).json({ deleted: true, id });
    }
  } catch (error) {
    const status = Number(error?.status) || 502;
    console.error("AURORA research cloud action failed:", error?.message || "Unknown error");
    return res.status(status).json({ error: status === 404 ? "Research storage is not ready. Apply the AURORA research migration first." : "AURORA could not complete this cloud research action." });
  }
  return res.status(400).json({ error: "Unknown AURORA research action." });
}

export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "GET, POST, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({error:"Use GET or POST."});
  }

  let requestBody = req.body;
  if (typeof requestBody === "string") {
    try { requestBody = JSON.parse(requestBody); } catch { requestBody = null; }
  }
  const requestAction = req.method === "GET" ? String(req.query?.action || "") : String(requestBody?.action || "");
  if (["task-status","task-list","library-list"].includes(requestAction)) {
    return handleResearchCloudAction(req, res, requestAction, requestBody || {});
  }
  if (req.method === "POST" && ["create-task","cancel-task","save-research","delete-research"].includes(requestAction)) {
    return handleResearchCloudAction(req, res, requestAction, requestBody || {});
  }

  if (req.method === "POST" && requestBody?.research === true) {
    const queryText = typeof requestBody.query === "string" ? requestBody.query.trim().slice(0, 240) : "";
    if (queryText.length < 2) return res.status(400).json({ error: "Enter a research query." });
    if (requestBody.taskWorker === true) {
      const expected = String(process.env.AURORA_RESEARCH_WORKER_TOKEN || "");
      const supplied = String(req.headers["x-aurora-research-worker-token"] || "");
      if (!expected || supplied.length !== expected.length || !timingSafeTokenMatch(supplied, expected)) {
        return res.status(401).json({ error: "Research worker authorization failed." });
      }
    }
    try {
      const { runAuroraResearch } = await import("../src/research/research-coordinator.js");
      const result = await runAuroraResearch({ ...requestBody, query: queryText });
      return res.status(result.status === "failed" ? 502 : 200).json(result);
    } catch (error) {
      console.error("AURORA research task failed:", String(error?.message || error));
      return res.status(502).json({ error: "AURORA research is temporarily unavailable. Try again shortly." });
    }
  }

  let query = req.method === "GET" ? req.query?.q : requestBody?.query;
  const wantsImages = req.method === "GET" && req.query?.type === "images";
  if (wantsImages) {
    if (typeof query !== "string" || query.trim().length < 2) return res.status(400).json({error:"Enter an image search query."});
    try {
      const result = await searchBingImages(query.trim().slice(0, 200));
      return res.status(200).json(result);
    } catch (error) {
      console.error("AURORA image search failed:", String(error?.message || error));
      return res.status(502).json({error:"Image search is temporarily unavailable. Try again shortly."});
    }
  }
  if (typeof query !== "string") query = "";
  query = query.trim().slice(0, 240);
  if (query.length < 2) return res.status(400).json({error:"Enter a search query."});

  const looksLikeNews = /\b(news|headlines|breaking news|current affairs)\b|\b(latest|breaking|current|today'?s|recent)\b.{0,50}\b(naija|Nigeria|world|tech|sports|politics|updates)\b/i.test(query);
  const errors = [];
  const attemptGroup = async (attempts) => {
    try { return await Promise.any(attempts); }
    catch (error) {
      for (const item of (error?.errors || [])) errors.push(item?.message || "Provider failed");
      return null;
    }
  };

  // For current-news queries, use a news feed first so dated articles outrank encyclopedia pages.
  if (looksLikeNews) {
    const newsResult = await attemptGroup([
      parseGoogleNewsSearch(query).then(results => ({query,results,source:"Google News"}))
    ]);
    if (newsResult) return res.status(200).json(newsResult);
  }

  const providers = [
    {name:"DuckDuckGo",url:"https://html.duckduckgo.com/html/?q="+encodeURIComponent(query),parse:parseDuck},
    {name:"DuckDuckGo Lite",url:"https://lite.duckduckgo.com/lite/?q="+encodeURIComponent(query),parse:parseDuckLite},
    {name:"Bing",url:"https://www.bing.com/search?q="+encodeURIComponent(query),parse:parseBing}
  ];
  const webAttempts = providers.map(async provider => {
    const response = await fetch(provider.url, {
      headers:{"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36","Accept":"text/html,application/xhtml+xml"},
      signal:AbortSignal.timeout(4500)
    });
    if (!response.ok) throw new Error(provider.name+" HTTP "+response.status);
    const results = provider.parse(await response.text());
    if (!results.length) throw new Error(provider.name+" returned no parseable results");
    return {query,results,source:provider.name};
  });
  const webResult = await attemptGroup(webAttempts);
  if (webResult) return res.status(200).json(webResult);

  // Encyclopedia/instant-answer providers are fallbacks only, never allowed to beat real web results.
  const fallbackResult = await attemptGroup([
    parseWikipedia(query).then(results => {
      if (!results.length) throw new Error("Wikipedia returned no results");
      return {query,results,source:"Wikipedia"};
    }),
    parseDuckApi(query).then(results => ({query,results,source:"DuckDuckGo Instant Answers"}))
  ]);
  if (fallbackResult) return res.status(200).json(fallbackResult);
  console.error("AURORA search providers failed:", errors.join("; "));
  return res.status(502).json({error:"Search is temporarily unavailable. Please try again shortly.",details:errors});
}
