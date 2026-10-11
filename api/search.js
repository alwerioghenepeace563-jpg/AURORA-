function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
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

  try {
    const response = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AURORA/1.0; +https://github.com/alwerioghenepeace563-jpg/AURORA-)" },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return res.status(502).json({ error: "The search service is temporarily unavailable. Please try again." });
    const html = await response.text();
    const results = [];
    const pattern = /<div class="result[^"]*"[^>]*>[\s\S]*?<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div class="result__snippet"[^>]*>([\s\S]*?)<\/div>)/g;
    let match;
    while ((match = pattern.exec(html)) && results.length < 8) {
      let url = decodeHtml(match[1]);
      if (url.startsWith("//")) url = "https:" + url;
      if (url.startsWith("/l/?")) {
        try { const parsed = new URL(url, "https://duckduckgo.com"); url = parsed.searchParams.get("uddg") || url; } catch {}
      }
      if (!/^https?:\/\//i.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
      const title = stripTags(match[2]);
      const snippet = stripTags(match[3] || match[4] || "");
      if (title && !results.some((item) => item.url === url)) results.push({ title, url, snippet });
    }
    if (!results.length) {
      const fallback = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      while ((match = fallback.exec(html)) && results.length < 8) {
        let url = decodeHtml(match[1]);
        if (url.startsWith("//")) url = "https:" + url;
        if (!/^https?:\/\//i.test(url)) continue;
        const title = stripTags(match[2]);
        if (title && !results.some((item) => item.url === url)) results.push({ title, url, snippet: "" });
      }
    }
    return res.status(200).json({ query, results, source: "DuckDuckGo" });
  } catch (error) {
    console.error("AURORA search failed:", error?.message || error);
    return res.status(504).json({ error: "Web search timed out. Please try again." });
  }
}
