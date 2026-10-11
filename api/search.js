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
    if (/duckduckgo\.com|bing\.com|google\.com/.test(u.hostname)) return "";
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
  const re = /<item>([\\s\\S]*?)<\\/item>/gi;
  let m;
  const field = (block, name) => {
    const found = block.match(new RegExp("<" + name + "(?:\\\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + ">", "i"));
    return found ? found[1].replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : "";
  };
  while ((m = re.exec(xml)) && items.length < 8) {
    const block = m[1];
    const title = stripTags(field(block, "title"));
    const url = safeUrl(field(block, "link"), "https://news.google.com");
    const description = stripTags(field(block, "description"));
    const pubDate = stripTags(field(block, "pubDate"));
    if (title && url && !items.some(x => x.url === url)) {
      items.push({ title, url, snippet: [description, pubDate ? "Published: " + pubDate : ""].filter(Boolean).join(" · ") });
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
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({error:"Use GET or POST."});
  }
  let query = req.method === "GET" ? req.query?.q : req.body?.query;
  if (typeof query !== "string") query = "";
  query = query.trim().slice(0, 240);
  if (query.length < 2) return res.status(400).json({error:"Enter a search query."});

  const looksLikeNews = /\\b(latest|breaking|current|today'?s|recent)\\b.{0,35}\\b(news|headlines|updates)\\b|\\b(news|headlines|updates)\\b.{0,35}\\b(today|latest|Nigeria)\\b/i.test(query);
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
  if (result) return res.status(200).json(result);
  console.error("AURORA search providers failed:", errors.join("; "));
  return res.status(502).json({error:"Search is temporarily unavailable. Please try again shortly.",details:errors});
}
