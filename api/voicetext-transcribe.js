import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: "4.5mb" } },
};

const DEFAULT_LANGUAGE = "Nigerian English and Nigerian Pidgin; preserve the language actually spoken";
const AUDIO_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/mp4", "audio/aac", "audio/webm"]);
const safeText = (value, max = 420) => typeof value === "string" ? value.slice(0, max) : "";

function parseBody(body) {
  if (typeof body === "string") { try { return JSON.parse(body); } catch { return {}; } }
  return body && typeof body === "object" ? body : {};
}

export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "GET, POST, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Use GET or POST." });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_API || "").trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!supabaseUrl || !supabaseAnonKey || !accessToken) return res.status(401).json({ error: "Sign in to AURORA before using persistent VoiceText jobs." });
  let owner;
  try {
    const identity = await fetch(supabaseUrl + "/auth/v1/user", { headers: { apikey: supabaseAnonKey, Authorization: "Bearer " + accessToken }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!identity.ok) return res.status(401).json({ error: "Your AURORA session is invalid or expired. Sign in again." });
    owner = await identity.json();
  } catch {
    return res.status(503).json({ error: "AURORA could not verify your sign-in session." });
  }
  const ownerId = typeof owner?.id === "string" ? owner.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) return res.status(401).json({ error: "A verified AURORA account is required." });

  const baseUrl = (process.env.VOICETEXT_API_URL || "https://aurora-voicetext-qk8s.vercel.app").replace(/\/+$/, "");
  const token = process.env.VOICETEXT_PLUGIN_TOKEN || "";
  if (!token) return res.status(503).json({ error: "The VoiceText integration is not configured on the AURORA server." });

  const body = parseBody(req.body);
  const action = req.method === "GET" ? "status" : (body.action || "transcribe");
  const requestId = safeText(req.query?.requestId || body.requestId, 80);
  const userToken = accessToken;
  let upstreamUrl = baseUrl + "/api/aurora-transcribe";
  let upstreamMethod = "POST";
  let upstreamBody = null;

  if (action === "status") {
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return res.status(400).json({ error: "A valid transcription requestId is required." });
    upstreamUrl += "?requestId=" + encodeURIComponent(requestId);
    upstreamMethod = "GET";
  } else if (action === "create") {
    const totalChunks = Number(body.totalChunks);
    const sizeBytes = Number(body.sizeBytes);
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 2000 ||
        !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      return res.status(400).json({ error: "A valid recording size and section count are required." });
    }
    const mimeType = safeText(body.mimeType, 100).toLowerCase();
    if (!/^audio\/[a-z0-9.+-]+$/.test(mimeType)) return res.status(415).json({ error: "A supported audio MIME type is required." });
    upstreamBody = {
      action: "create",
      filename: safeText(body.filename || "recording", 180).split(/[\\/]/).pop(),
      mimeType, sizeBytes, totalChunks,
      durationSeconds: Number.isFinite(Number(body.durationSeconds)) ? Math.max(0, Number(body.durationSeconds)) : undefined,
      requestId: /^[0-9a-f-]{36}$/i.test(body.requestId || "") ? body.requestId : undefined,
    };
  } else if (action === "process") {
    const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
    const mimeType = safeText(body.mimeType, 100).toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(requestId) || !Number.isInteger(Number(body.chunkNumber)) ||
        !Number.isInteger(Number(body.totalChunks)) || !audioBase64 ||
        audioBase64.length > 4000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64) || audioBase64.length % 4 !== 0) {
      return res.status(400).json({ error: "A valid job ID, section number and audio section are required." });
    }
    if (!AUDIO_TYPES.has(mimeType)) return res.status(415).json({ error: "Unsupported audio section format." });
    upstreamBody = {
      action: "process", requestId, chunkNumber: Number(body.chunkNumber), totalChunks: Number(body.totalChunks),
      audioBase64, mimeType,
      languageHint: safeText(body.languageHint || DEFAULT_LANGUAGE, 120),
    };
  } else if (action === "transcribe") {
    const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
    const mimeType = safeText(body.mimeType, 100).toLowerCase();
    if (!audioBase64 || audioBase64.length > 4000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64) || audioBase64.length % 4 !== 0) {
      return res.status(audioBase64.length > 4000000 ? 413 : 400).json({ error: "Choose a valid audio file up to approximately 3 MB. Use persistent jobs for longer recordings." });
    }
    if (!AUDIO_TYPES.has(mimeType)) return res.status(415).json({ error: "VoiceText currently accepts audio files only. Select an audio recording rather than a video." });
    upstreamBody = {
      audioBase64, mimeType,
      languageHint: safeText(body.languageHint || DEFAULT_LANGUAGE, 120),
      requestId: safeText(body.requestId, 80) || undefined,
    };
  } else {
    return res.status(400).json({ error: "Unknown action. Use create, process, or status." });
  }

  if (action !== "transcribe" && !userToken) return res.status(401).json({ error: "Sign in to AURORA to create or resume a private cloud transcription job." });

  try {
    const upstream = await fetch(upstreamUrl, {
      method: upstreamMethod,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(userToken ? { "X-AURORA-USER-TOKEN": userToken } : {}) },
      ...(upstreamBody ? { body: JSON.stringify(upstreamBody) } : {}),
      signal: AbortSignal.timeout(55000),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status === 401 ? 502 : upstream.status).json({
      error: safeText(payload.error, 420) || "VoiceText could not complete this request.",
      retryable: payload.retryable === true,
      ...(payload.requestId ? { requestId: payload.requestId } : {}),
      ...(Number.isInteger(payload.completedChunks) ? { completedChunks: payload.completedChunks } : {}),
      ...(Number.isInteger(payload.totalChunks) ? { totalChunks: payload.totalChunks } : {}),
    });

    if (action === "transcribe") {
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) return res.status(502).json({ error: "VoiceText returned an empty transcript." });
      const segments = Array.isArray(payload.segments) ? payload.segments.slice(0, 5000).filter(item =>
        item && Number.isFinite(item.start) && Number.isFinite(item.end) && typeof item.text === "string"
      ).map(item => ({
        start: Math.max(0, Number(item.start)), end: Math.max(0, Number(item.end)), text: item.text.slice(0, 2000),
        ...(typeof item.speaker === "string" ? { speaker: item.speaker.slice(0, 80) } : {}),
      })) : [];
      return res.status(200).json({ text, language: typeof payload.language === "string" ? payload.language : null,
        segments, provider: safeText(payload.provider, 80) || "aurora-voicetext",
        completedAt: payload.completedAt || new Date().toISOString(), source: "AURORA VoiceText" });
    }
    return res.status(action === "create" ? 201 : 200).json({ ...payload, source: "AURORA VoiceText" });
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return res.status(timeout ? 504 : 502).json({
      error: timeout ? "VoiceText took too long to respond. Resume from the last saved section." : "AURORA could not reach VoiceText. Check the integration configuration and try again.",
      retryable: true,
    });
  }
}
