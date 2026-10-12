export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Use GET." });
  }

  const repository = String(process.env.AURORA_GITHUB_REPOSITORY || "alwerioghenepeace563-jpg/AURORA-").trim();
  const token = process.env.AURORA_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AURORA-Android-Update-Checker"
  };
  if (token) headers.Authorization = "Bearer " + token;

  try {
    const upstream = await fetch("https://api.github.com/repos/" + repository + "/releases/latest", {
      method: "GET",
      headers,
      cache: "no-store"
    });
    const raw = await upstream.text();
    let release;
    try { release = raw ? JSON.parse(raw) : {}; } catch { release = {}; }
    if (!upstream.ok) {
      console.error("AURORA update metadata request failed:", upstream.status, String(release.message || "").slice(0, 250));
      const status = upstream.status === 404 ? 404 : upstream.status === 403 ? 503 : 502;
      return res.status(status).json({
        error: upstream.status === 404
          ? "No accessible GitHub release was found. For a private repository, configure AURORA_GITHUB_TOKEN in the server environment."
          : "The release service is temporarily unavailable."
      });
    }

    const assets = Array.isArray(release.assets) ? release.assets : [];
    if (String(req.query?.download || "") === "1") {
      const apk = assets.find((asset) => typeof asset.name === "string" && asset.name.toLowerCase().endsWith(".apk"));
      if (!apk) return res.status(404).json({ error: "The latest release does not include an APK yet." });
      if (!token) return res.status(503).json({ error: "AURORA_GITHUB_TOKEN must be configured on the server to retrieve private release assets." });
      const assetResponse = await fetch("https://api.github.com/repos/" + repository + "/releases/assets/" + encodeURIComponent(apk.id), {
        method: "GET",
        headers: {
          Accept: "application/octet-stream",
          Authorization: "Bearer " + token,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "AURORA-Android-Updater"
        },
        redirect: "manual",
        cache: "no-store"
      });
      const temporaryUrl = assetResponse.headers.get("location");
      if (assetResponse.status >= 300 && assetResponse.status < 400 && temporaryUrl) {
        return res.status(200).json({
          tag_name: release.tag_name || "",
          asset_name: apk.name,
          size: Number(apk.size || 0),
          download_url: temporaryUrl
        });
      }
      console.error("AURORA APK download URL request returned:", assetResponse.status);
      return res.status(502).json({ error: "GitHub did not provide a temporary APK download link. Try opening the release page." });
    }

    return res.status(200).json({
      tag_name: release.tag_name || "",
      name: release.name || release.tag_name || "AURORA release",
      body: typeof release.body === "string" ? release.body.slice(0, 5000) : "",
      html_url: release.html_url || "",
      published_at: release.published_at || null,
      assets: assets.map((asset) => ({
        name: asset.name || "",
        size: Number(asset.size || 0),
        browser_download_url: asset.browser_download_url || ""
      })) : []
    });
  } catch (error) {
    console.error("AURORA update checker error:", error);
    return res.status(502).json({ error: "Could not reach the release service." });
  }
}
