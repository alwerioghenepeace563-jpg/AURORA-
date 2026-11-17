import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;
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
async function searchBingImages(query) {
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
  if (req.method === "POST" && requestBody?.research === true) {
    const queryText = typeof requestBody.query === "string" ? requestBody.query.trim().slice(0, 240) : "";
    if (queryText.length < 2) return res.status(400).json({ error: "Enter a research query." });
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
