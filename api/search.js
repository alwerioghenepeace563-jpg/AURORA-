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

  const providers = [
    {name:"DuckDuckGo",url:"https://html.duckduckgo.com/html/?q="+encodeURIComponent(query),parse:parseDuck},
    {name:"DuckDuckGo Lite",url:"https://lite.duckduckgo.com/lite/?q="+encodeURIComponent(query),parse:parseDuckLite},
    {name:"Bing",url:"https://www.bing.com/search?q="+encodeURIComponent(query),parse:parseBing}
  ];
  const attempts = providers.map(async provider => {
    const response = await fetch(provider.url, {
      headers:{"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36","Accept":"text/html,application/xhtml+xml"},
      signal:AbortSignal.timeout(4500)
    });
    if (!response.ok) throw new Error(provider.name+" HTTP "+response.status);
    const results = provider.parse(await response.text());
    if (!results.length) throw new Error(provider.name+" returned no parseable results");
    return {query,results,source:provider.name};
  });
  const wikiAttempt = parseWikipedia(query).then(results => {
    if (!results.length) throw new Error("Wikipedia returned no results");
    return {query,results,source:"Wikipedia"};
  });
  const errors = [];
  const allAttempts = [...attempts, wikiAttempt];
  const result = await Promise.any(allAttempts).catch(error => {
    for (const item of (error?.errors || [])) errors.push(item?.message || "Provider failed");
    return null;
  });
  if (result) return res.status(200).json(result);
  console.error("AURORA search providers failed:", errors.join("; "));
  return res.status(502).json({error:"Search is temporarily unavailable. Please try again shortly.",details:errors});
}
