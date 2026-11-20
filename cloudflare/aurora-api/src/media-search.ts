interface MediaSearchEnv {
  [key: string]: any;
  AURORA_ALLOWED_ORIGIN?: string;
}

type MediaKind = "image" | "video";

const clean = (value: unknown, max = 180): string =>
  String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function safeHttpsUrl(value: unknown): string {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function corsHeaders(request: Request, env: MediaSearchEnv): Headers {
  const origin = request.headers.get("Origin") || "";
  const configured = (env.AURORA_ALLOWED_ORIGIN || "").split(",")
    .map((value: string) => value.trim().replace(/\/+$/, "")).filter(Boolean);
  const allowed = new Set([
    new URL(request.url).origin,
    "https://localhost", "http://localhost", "capacitor://localhost",
    "ionic://localhost", "https://aurora-ten-gold.vercel.app", ...configured
  ]);
  let preview = false;
  try {
    const parsed = new URL(origin);
    preview = parsed.protocol === "https:" &&
      /^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(parsed.hostname);
  } catch {}
  const headers = new Headers({
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Access-Control-Max-Age": "86400"
  });
  if (origin && (allowed.has(origin) || preview)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(body: unknown, headers: Headers, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function metadataText(value: any): string {
  return clean(value && typeof value === "object" ? value.value : value);
}

async function commonsSearch(query: string, type: string): Promise<any[]> {
  const params = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: query,
    gsrnamespace: "6", gsrwhat: "text", gsrlimit: "20",
    prop: "imageinfo", iiprop: "url|mime|extmetadata",
    iiurlwidth: "640", format: "json", origin: "*"
  });
  const response = await fetch("https://commons.wikimedia.org/w/api.php?" + params, {
    headers: { Accept: "application/json", "User-Agent": "AURORA/1.0 media discovery" },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error("Wikimedia Commons search failed");
  const data: any = await response.json();
  return Object.values(data?.query?.pages || {}).map((page: any) => {
    const info = page.imageinfo?.[0] || {};
    const mime = String(info.mime || "").toLowerCase();
    if (!/^(image|video)\//.test(mime) ||
        (type === "video" && !mime.startsWith("video/")) ||
        (type === "image" && !mime.startsWith("image/"))) return null;
    const downloadUrl = safeHttpsUrl(info.url);
    const previewUrl = safeHttpsUrl(info.thumburl || info.url);
    if (!downloadUrl || !previewUrl) return null;
    const meta = info.extmetadata || {};
    const title = clean(String(page.title || "").replace(/^File:/, "")) || "Commons media";
    return {
      id: "commons:" + downloadUrl, title,
      kind: mime.startsWith("video/") ? "video" : "image",
      mimeType: mime, previewUrl, downloadUrl,
      pageUrl: "https://commons.wikimedia.org/wiki/" + encodeURIComponent(page.title || ""),
      provider: "Wikimedia Commons",
      license: metadataText(meta.LicenseShortName) || "Check source licence",
      licenseUrl: safeHttpsUrl(meta.LicenseUrl?.value || ""),
      attribution: metadataText(meta.Artist) || "See original file page",
      downloadable: true
    };
  }).filter(Boolean);
}

async function archiveSearch(query: string): Promise<any[]> {
  const searchUrl = "https://archive.org/advancedsearch.php?q=" +
    encodeURIComponent(query + " AND mediatype:movies") +
    "&fl[]=identifier,title,mediatype&rows=8&page=1&output=json";
  const response = await fetch(searchUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error("Internet Archive search failed");
  const docs = (await response.json() as any)?.response?.docs || [];
  const items = await Promise.all(docs.slice(0, 6).map(async (doc: any) => {
    const id = String(doc.identifier || "").replace(/[^A-Za-z0-9._-]/g, "");
    if (!id) return null;
    try {
      const metadataResponse = await fetch("https://archive.org/metadata/" + encodeURIComponent(id), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(7000)
      });
      if (!metadataResponse.ok) return null;
      const metadata: any = await metadataResponse.json();
      const files = Array.isArray(metadata.files) ? metadata.files : [];
      const file = files.find((item: any) =>
        /\.(mp4|webm|mov)$/i.test(String(item.name || "")) &&
        !String(item.source || "").includes("derivative")
      );
      if (!file || typeof file.name !== "string" || file.name.length > 500 ||
          file.name.startsWith("/") || file.name.split("/").some((part: string) => part === "." || part === "..")) return null;
      const encodedPath = file.name.split("/").map(encodeURIComponent).join("/");
      const downloadUrl = safeHttpsUrl("https://archive.org/download/" + encodeURIComponent(id) + "/" + encodedPath);
      if (!downloadUrl) return null;
      const licenseUrl = safeHttpsUrl(metadata.metadata?.licenseurl || "");
      return {
        id: "archive:" + id, title: clean(doc.title) || id,
        kind: "video",
        mimeType: /\.webm$/i.test(file.name) ? "video/webm" : "video/mp4",
        previewUrl: "https://archive.org/services/img/" + encodeURIComponent(id),
        downloadUrl,
        pageUrl: "https://archive.org/details/" + encodeURIComponent(id),
        provider: "Internet Archive",
        license: clean(metadata.metadata?.licenseurl || metadata.metadata?.rights || "Check item rights and usage terms"),
        licenseUrl,
        attribution: clean(metadata.metadata?.creator || "See item details"),
        downloadable: true
      };
    } catch {
      return null;
    }
  }));
  return items.filter(Boolean);
}

export async function handleMediaSearch(request: Request, env: MediaSearchEnv): Promise<Response> {
  const headers = corsHeaders(request, env);
  const origin = request.headers.get("Origin") || "";
  if (origin && !headers.has("Access-Control-Allow-Origin")) return json({ error: "Origin not allowed." }, headers, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET") {
    headers.set("Allow", "GET, OPTIONS");
    return json({ error: "Use GET." }, headers, 405);
  }
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim().slice(0, 140);
  const requestedType = url.searchParams.get("type") || "all";
  const type = (["all", "image", "video"].includes(requestedType) ? requestedType : "all") as "all" | MediaKind;
  if (query.length < 2) return json({ error: "Describe the image or video you need." }, headers, 400);

  const jobs: Promise<any[]>[] = [commonsSearch(query, type)];
  if (type !== "image") jobs.push(archiveSearch(query));
  const settled = await Promise.allSettled(jobs);
  const results = settled.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const seen = new Set<string>();
  const unique = results.filter((item: any) => {
    if (seen.has(item.downloadUrl)) return false;
    seen.add(item.downloadUrl);
    return true;
  }).slice(0, 20);
  if (!unique.length) {
    return json({
      error: "No directly downloadable matching files were found. Try another description or open an official provider browser."
    }, headers, 502);
  }
  return json({
    query, type, source: "Wikimedia Commons and Internet Archive",
    results: unique,
    rightsNotice: "Check each item's licence, attribution and usage terms before reusing or publishing it. AURORA does not bypass restrictions."
  }, headers);
}
