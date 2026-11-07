import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;
export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "POST, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Use POST." });
  }

  const key = process.env.ELEVENLAB_API_KEY || process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(503).json({ error: "Voice service is not configured.", code: "VOICE_KEY_MISSING" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const text = body?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 2500) {
    return res.status(400).json({ error: "Text must be between 1 and 2500 characters.", code: "INVALID_TEXT" });
  }

  const voiceName = typeof body?.voice === "string" ? body.voice.toLowerCase() : "jessica";
  const voiceIds = {
    // A configured default voice keeps cloud speech working even when an
    // optional named voice has not been given its own Voice ID yet.
    jessica: process.env.ELEVENLABS_JESSICA_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLAB_VOICE_ID,
    bella: process.env.ELEVENLABS_BELLA_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLAB_VOICE_ID,
    laura: process.env.ELEVENLABS_LAURA_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLAB_VOICE_ID,
    lucian: process.env.ELEVENLABS_LUCIAN_VOICE_ID || process.env.ELEVENLAB_LUCIAN_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLAB_VOICE_ID
  };
  if (!Object.prototype.hasOwnProperty.call(voiceIds, voiceName)) {
    return res.status(400).json({ error: "Choose Jessica, Bella, Laura, or Lucian.", code: "INVALID_VOICE" });
  }
  const voiceId = voiceIds[voiceName];
  if (!voiceId) {
    return res.status(503).json({ error: "The selected voice is not configured yet. Check the voice ID mapping for " + voiceName + ".", code: "VOICE_ID_MISSING", voice: voiceName });
  }

  try {
    const upstream = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voiceId), {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: text.trim(),
        model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        voice_settings: { stability: 0.55, similarity_boost: 0.78, style: 0.25, use_speaker_boost: true }
      }),
      signal: AbortSignal.timeout(18000)
    });

    if (!upstream.ok) {
      const providerBody = await upstream.text().catch(() => "");
      let providerPayload = null;
      try { providerPayload = JSON.parse(providerBody); } catch { providerPayload = null; }

      // Return only short, sanitized diagnostic fields. Never echo request headers,
      // API keys, the full provider response, or arbitrary nested provider data.
      const detail = providerPayload?.detail;
      const providerErrorType = typeof detail?.status === "string"
        ? detail.status
        : typeof detail?.type === "string" ? detail.type : undefined;
      let providerMessage = typeof detail?.message === "string"
        ? detail.message
        : typeof detail === "string" ? detail
        : typeof providerPayload?.message === "string" ? providerPayload.message
        : undefined;
      if (providerMessage) {
        providerMessage = providerMessage
          .replace(/xi-api-key|authorization/gi, "[credential header]")
          .replace(/(Bearer\\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
          .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
          .replace(/https?:\\/\\/\\S+/gi, "[provider link]")
          .slice(0, 240);
      }
      console.error("Voice provider request failed:", JSON.stringify({
        status: upstream.status,
        type: providerErrorType,
        message: providerMessage
      }));

      let message = "Voice service could not generate audio.";
      if (upstream.status === 401) message = "ElevenLabs rejected the API key. Check the active ELEVENLAB_API_KEY or ELEVENLABS_API_KEY value in Vercel.";
      else if (upstream.status === 402) message = "ElevenLabs returned HTTP 402. Check the provider details below; this response alone does not tell us which account or billing condition caused it.";
      else if (upstream.status === 403) message = "This ElevenLabs API key does not have permission to use the selected voice or text-to-speech service.";
      else if (upstream.status === 404) message = "ElevenLabs could not find the selected Voice ID. Check the Voice ID assigned to this voice in Vercel.";
      else if (upstream.status === 429) message = "Voice usage limit reached. Try again later.";
      else if (upstream.status === 400) message = "ElevenLabs rejected the voice request. Check the voice ID and model settings.";
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: message,
        code: "ELEVENLABS_HTTP_ERROR",
        providerStatus: upstream.status,
        ...(providerErrorType ? { providerErrorType } : {}),
        ...(providerMessage ? { providerMessage } : {}),
        voice: voiceName
      });
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    if (!audio.length) {
      console.error("ElevenLabs returned an empty audio response.");
      return res.status(502).json({ error: "ElevenLabs accepted the request but returned an empty audio file.", code: "EMPTY_AUDIO_RESPONSE", voice: voiceName });
    }
    res.setHeader("X-AURORA-VOICE-PROVIDER", "elevenlabs");
    res.setHeader("X-AURORA-VOICE", voiceName);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(audio.length));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(audio);
  } catch (error) {
    console.error("AURORA voice function error:", error);
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return res.status(502).json({
      error: timedOut ? "ElevenLabs timed out before returning audio." : "AURORA could not reach ElevenLabs. Check the deployment network and provider availability.",
      code: timedOut ? "ELEVENLABS_TIMEOUT" : "VOICE_NETWORK_ERROR"
    });
  }
}
