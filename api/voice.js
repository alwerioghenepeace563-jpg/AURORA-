import { applyAuroraCors } from "../lib/cors.js";
export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "POST, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Use POST." });
  }

  const key = process.env.ELEVENLAB_API_KEY || process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(503).json({ error: "Voice service is not configured." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const text = body?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 2500) {
    return res.status(400).json({ error: "Text must be between 1 and 2500 characters." });
  }

  const voiceName = typeof body?.voice === "string" ? body.voice.toLowerCase() : "jessica";
  const voiceIds = {
    jessica: process.env.ELEVENLABS_JESSICA_VOICE_ID || process.env.ELEVENLABS_VOICE_ID,
    bella: process.env.ELEVENLABS_BELLA_VOICE_ID,
    laura: process.env.ELEVENLABS_LAURA_VOICE_ID,
    lucian: process.env.ELEVENLAB_LUCIAN_VOICE_ID || process.env.ELEVENLABS_LUCIAN_VOICE_ID
  };
  if (!Object.prototype.hasOwnProperty.call(voiceIds, voiceName)) {
    return res.status(400).json({ error: "Choose Jessica, Bella, Laura, or Lucian." });
  }
  const voiceId = voiceIds[voiceName];
  if (!voiceId) {
    return res.status(503).json({ error: "The selected voice is not configured yet. Add its Voice ID in Vercel settings." });
  }

  try {
    const upstream = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voiceId), {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: text.trim(),
        model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        voice_settings: { stability: 0.55, similarity_boost: 0.78, style: 0.25, use_speaker_boost: true }
      })
    });

    if (!upstream.ok) {
      const providerDetails = await upstream.text().catch(() => "");
      console.error("Voice provider request failed, status:", upstream.status, providerDetails.slice(0, 500));
      let message = "Voice service could not generate audio.";
      if (upstream.status === 401 || upstream.status === 403) message = "ElevenLabs rejected the API key or this voice is not accessible to the account.";
      else if (upstream.status === 404) message = "ElevenLabs could not find this voice ID. Check the Lucian Voice ID in Vercel.";
      else if (upstream.status === 429) message = "Voice usage limit reached. Try again later.";
      else if (upstream.status === 400) message = "ElevenLabs rejected the voice request. Check the voice ID and model settings.";
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: message });
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(audio.length));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(audio);
  } catch (error) {
    console.error("AURORA voice function error:", error);
    return res.status(502).json({ error: "Could not reach the voice service." });
  }
}
