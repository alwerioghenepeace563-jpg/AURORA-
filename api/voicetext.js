import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;

const UPSTREAM = (process.env.AURORA_VOICETEXT_API_URL || "https://aurora-voicetext-qk8s.vercel.app/api/aurora-transcribe").trim();
const TOKEN = process.env.AURORA_VOICETEXT_TOKEN || "";

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: "4.5mb" } } };

export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "GET, POST, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method || "")) {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Use GET or POST." });
  }
  if (!TOKEN) return res.status(503).json({ error: "AURORA VoiceText connection is not configured on the server yet." });

  let target;
  try { target = new URL(UPSTREAM); } catch { return res.status(503).json({ error: "AURORA VoiceText endpoint URL is invalid." }); }
  if (target.protocol !== "https:" || !/\/api\/aurora-transcribe\/?$/.test(target.pathname)) {
    return res.status(503).json({ error: "A secure VoiceText transcription endpoint must be configured." });
  }
  if (req.method === "GET") {
    const requestId = typeof req.query.requestId === "string" ? req.query.requestId : "";
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return res.status(400).json({ error: "A valid requestId is required." });
    target.searchParams.set("requestId", requestId);
  }
  try {
    const response = await fetch(target.toString(), {
      method: req.method,
      headers: { Authorization: "Bearer " + TOKEN, ...(req.method === "POST" ? { "Content-Type": "application/json" } : {}) },
      ...(req.method === "POST" ? { body: JSON.stringify(req.body || {}) } : {}),
      signal: AbortSignal.timeout(55000)
    });
    const payload = await response.json().catch(() => ({ error: "VoiceText returned an unreadable response." }));
    return res.status(response.status).json(payload);
  } catch (error) {
    console.error("AURORA VoiceText proxy failed:", error?.message || error);
    return res.status(502).json({ error: "AURORA could not reach VoiceText. Your saved job remains available to resume." });
  }
}
