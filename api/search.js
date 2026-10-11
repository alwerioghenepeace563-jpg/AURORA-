function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
function stripTags(value) {
  return decodeHtml(value.replace(/<script[\\s\\S]*?<\\/script>/gi, " ").replace(/<style[\\s\\S]*?<\\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ")).trim();
}
function safeUrl(raw, base) {
  try {
    const u = new URL(decodeHtml(raw), base);
    if (u.hostname.includes("duckduckgo.com") && u.pathname === "/l/") {
      const target = u.searchParams.get("uddg");
      if (target) return safeUrl(target, base);
    }
    if (!["http:", "https:"].includes(u.protocol)) return "";
    if (/duckduckgo\\.com|bing\\.com|google\\.com/.test(u.hostname)) return "";
    return u.href;
  } catch { return ""; }
}
function parseDuck(html) {
  const results = [];
  const re = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 8) {
    const url = safeUrl(m[1], "https://duckduckgo.com");
    const title = stripTags(m[2]);
    if (!url || !title || results.some(x => x.url === url)) continue;
    const tail = html.slice(re.lastIndex, re.lastIndex + 1800);
    const sm = tail.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\\s\\S]*?)<\\/(?:a|div)>/i);
    results.push({title,url,snippet:sm ? stripTags(sm[1]) : ""});
  }
  return results;
}
function parseBing(html) {
  const results = [];
  const re = /<li class=["']b_algo["'][^>]*>[\\s\\S]*?<h2[^>]*>\\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>[\\s\\S]*?<\\/li>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 8) {
    const url = safeUrl(m[1], "https://www.bing.com");
    const title = stripTags(m[2]);
    const snippetMatch = m[0].match(/<p[^>]*>([\\s\\S]*?)<\\/p>/i);
    if (url && title && !results.some(x => x.url === url)) results.push({title,url,snippet:snippetMatch ? stripTags(snippetMatch[1]) : ""});
  }
  return results;
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Use GET or POST." });
  }
  let query = req.method === "GET" ? req.query?.q : req.body?.query;
  if (typeof query !== "string") query = "";
  query = query.trim().slice(0, 240);
  if (query.length < 2) return res.status(400).json({ error: "Enter a search query." });

  const providers = [
    {name:"DuckDuckGo", url:"https://html.duckduckgo.com/html/?q="+encodeURIComponent(query), parse:parseDuck, headers:{"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36","Accept":"text/html,application/xhtml+xml"}},
    {name:"DuckDuckGo Lite", url:"https://lite.duckduckgo.com/lite/?q="+encodeURIComponent(query), parse:parseDuck, headers:{"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36","Accept":"text/html,application/xhtml+xml"}},
    {name:"Bing", url:"https://www.bing.com/search?q="+encodeURIComponent(query), parse:parseBing, headers:{"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36","Accept":"text/html,application/xhtml+xml"}}
  ];
  const errors=[];
  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {headers:provider.headers,signal:AbortSignal.timeout(6500)});
      if (!response.ok) { errors.push(provider.name+" HTTP "+response.status); continue; }
      const html = await response.text();
      const results = provider.parse(html);
      if (results.length) return res.status(200).json({query,results,source:provider.name});
      errors.push(provider.name+" returned no parseable results");
    } catch(error) { errors.push(provider.name+": "+(error?.message||"request failed")); }
  }
  console.error("AURORA search providers failed:",errors.join("; "));
  return res.status(502).json({error:"Search providers are temporarily unavailable. Please try again shortly.",details:errors});
}