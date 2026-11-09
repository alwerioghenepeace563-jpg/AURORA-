import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: "4.5mb" } },
};

export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "POST, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Use POST." });
  }

  const baseUrl = (process.env.VOICETEXT_API_URL || "https://aurora-voicetext-qk8s.vercel.app").replace(/\/+$/, "");
  const token = process.env.VOICETEXT_PLUGIN_TOKEN || "";
  if (!token) return res.status(503).json({ error: "The VoiceText integration is not configured on the AURORA server." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const audioBase64 = typeof body?.audioBase64 === "string" ? body.audioBase64 : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType.toLowerCase() : "";
  if (!audioBase64 || audioBase64.length > 4000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64) || audioBase64.length % 4 !== 0) {
    return res.status(audioBase64.length > 4000000 ? 413 : 400).json({ error: "Choose a valid audio file up to approximately 3 MB. The hosting request-size limit prevents unlimited single-request uploads." });
  }
  const supported = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/mp4", "audio/aac", "audio/webm"]);
  if (!supported.has(mimeType)) return res.status(415).json({ error: "VoiceText currently accepts audio files only. Select an audio recording rather than a video." });

  try {
    const upstream = await fetch(baseUrl + "/api/aurora-transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        audioBase64,
        mimeType,
        languageHint: typeof body?.languageHint === "string" ? body.languageHint.slice(0, 120) : "Nigerian English and Nigerian Pidgin; preserve the language actually spoken",
        requestId: typeof body?.requestId === "string" ? body.requestId.slice(0, 80) : undefined,
      }),
      signal: AbortSignal.timeout(55000),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status === 401 ? 502 : upstream.status).json({
        error: typeof payload.error === "string" ? payload.error.slice(0, 420) : "VoiceText could not complete this transcription.",
        retryable: payload.retryable === true,
      });
    }
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) return res.status(502).json({ error: "VoiceText returned an empty transcript." });
    const segments = Array.isArray(payload.segments) ? payload.segments.slice(0, 5000).filter(item =>
      item && Number.isFinite(item.start) && Number.isFinite(item.end) && typeof item.text === "string"
    ).map(item => ({
      start: Math.max(0, Number(item.start)),
      end: Math.max(0, Number(item.end)),
      text: item.text.slice(0, 2000),
      ...(typeof item.speaker === "string" ? { speaker: item.speaker.slice(0, 80) } : {}),
    })) : [];
    return res.status(200).json({
      text,
      language: typeof payload.language === "string" ? payload.language : null,
      segments,
      provider: typeof payload.provider === "string" ? payload.provider : "aurora-voicetext",
      completedAt: payload.completedAt || new Date().toISOString(),
      source: "AURORA VoiceText",
    });
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return res.status(timeout ? 504 : 502).json({
      error: timeout ? "VoiceText took too long to respond. Try a shorter recording." : "AURORA could not reach VoiceText. Check the integration configuration and try again.",
      retryable: true,
    });
  }
}
