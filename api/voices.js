import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;

export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "GET, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Use GET." });
  }

  const key = process.env.ELEVENLAB_API_KEY || process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return res.status(503).json({ error: "Voice service is not configured.", code: "VOICE_KEY_MISSING" });
  }

  try {
    const upstream = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false", {
      method: "GET",
      headers: { "xi-api-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(12000)
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = payload?.detail;
      const providerMessage = typeof detail?.message === "string" ? detail.message : typeof detail === "string" ? detail : "";
      console.error("ElevenLabs voice list failed:", JSON.stringify({ status: upstream.status, type: detail?.type, code: detail?.code }));
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: "AURORA could not load voices from the connected ElevenLabs account.",
        code: "VOICE_LIST_PROVIDER_ERROR",
        providerStatus: upstream.status,
        ...(typeof detail?.type === "string" ? { providerErrorType: detail.type } : {}),
        ...(typeof detail?.code === "string" ? { providerErrorCode: detail.code } : {}),
        ...(providerMessage ? { providerMessage: providerMessage.replace(/xi-api-key|authorization/gi, "[credential header]").replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]").slice(0, 200) } : {})
      });
    }

    const voices = (Array.isArray(payload?.voices) ? payload.voices : [])
      .filter((voice) => voice && typeof voice.voice_id === "string" && typeof voice.name === "string")
      .map((voice) => ({
        voice_id: voice.voice_id,
        name: voice.name,
        category: typeof voice.category === "string" ? voice.category : "",
        labels: voice.labels && typeof voice.labels === "object" ? voice.labels : {},
        description: typeof voice.description === "string" ? voice.description.slice(0, 240) : "",
        preview_url: typeof voice.preview_url === "string" && /^https:\/\//i.test(voice.preview_url) ? voice.preview_url : ""
      }));

    return res.status(200).json({
      voices,
      hasMore: Boolean(payload?.has_more),
      nextPageToken: typeof payload?.next_page_token === "string" ? payload.next_page_token : null
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error("AURORA voice-list route failed:", timedOut ? "timeout" : "network error");
    return res.status(502).json({
      error: timedOut ? "Loading voices from ElevenLabs timed out." : "AURORA could not reach ElevenLabs to load voices.",
      code: timedOut ? "VOICE_LIST_TIMEOUT" : "VOICE_LIST_NETWORK_ERROR"
    });
  }
}
