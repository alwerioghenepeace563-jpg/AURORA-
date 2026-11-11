import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;

const MODEL = "veo-3.1-generate-preview";
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const safeOperationName = value => typeof value === "string" && /^operations\/[A-Za-z0-9._-]{8,180}$/.test(value);
const json = (res, status, body) => res.status(status).json(body);
const recentVideoRequests = new Map();

async function authenticate(req) {
  const token = String(req.headers?.authorization || "").match(/^Bearer\\s+(.+)$/i)?.[1] || "";
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!token || !supabaseUrl || !anonKey) return null;
  try {
    const response = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: anonKey, Authorization: "Bearer " + token, Accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    return user && typeof user.id === "string" ? user : null;
  } catch { return null; }
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch {} }
  return {};
}

async function getOperation(operationName, key) {
  const response = await fetch(BASE + "/" + operationName, {
    headers: { "x-goog-api-key": key, Accept: "application/json" },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("VIDEO_STATUS_UNAVAILABLE");
  return data;
}

function getVideoUri(operation) {
  const samples = operation?.response?.generateVideoResponse?.generatedSamples;
  const uri = Array.isArray(samples) ? samples[0]?.video?.uri : "";
  if (typeof uri !== "string") return "";
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:" || !["generativelanguage.googleapis.com", "storage.googleapis.com"].includes(parsed.hostname)) return "";
    return parsed.href;
  } catch { return ""; }
}

export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "POST, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return json(res, 405, { error: "Use POST." });
  }

  const user = await authenticate(req);
  if (!user) return json(res, 401, { error: "Sign in to AURORA before using video generation." });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(res, 503, { error: "Video generation is not configured. Add the server-side Gemini API key." });
  const body = readBody(req);
  const action = String(body.action || "");

  if (action === "video:create") {
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const aspectRatio = ["16:9", "9:16"].includes(body.aspectRatio) ? body.aspectRatio : "16:9";
    const durationSeconds = [4, 6, 8].includes(Number(body.durationSeconds)) ? Number(body.durationSeconds) : 8;
    if (prompt.length < 8 || prompt.length > 1800) return json(res, 400, { error: "Describe the video in 8 to 1800 characters." });
    const lastRequest = recentVideoRequests.get(user.id) || 0;
    if (Date.now() - lastRequest < 60000) return json(res, 429, { error: "Please wait a minute before starting another video generation job." });
    recentVideoRequests.set(user.id, Date.now());
    try {
      const upstream = await fetch(BASE + "/models/" + MODEL + ":predictLongRunning", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { aspectRatio, durationSeconds, sampleCount: 1, resolution: "720p", personGeneration: "allow_adult" }
        }),
        signal: AbortSignal.timeout(25000)
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok || !safeOperationName(data.name)) {
        console.error("AURORA Veo submit failed:", upstream.status);
        return json(res, upstream.status === 429 ? 429 : 502, {
          error: upstream.status === 429
            ? "The video provider is busy or its usage limit has been reached. Try again later."
            : "The video provider could not start this job. Check Gemini video-model access and quota."
        });
      }
      return json(res, 202, { operationName: data.name, status: "queued", model: MODEL, aspectRatio, durationSeconds });
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      return json(res, timedOut ? 504 : 502, { error: timedOut ? "The video job could not be started before the request timed out." : "AURORA could not reach the video provider." });
    }
  }

  if (action === "video:status" || action === "video:download") {
    const operationName = body.operationName;
    if (!safeOperationName(operationName)) return json(res, 400, { error: "A valid video job ID is required." });
    try {
      const operation = await getOperation(operationName, key);
      if (operation.error) return json(res, 200, { status: "failed", error: "The video provider could not complete this generation." });
      if (!operation.done) return json(res, 200, { status: "running", done: false });
      const videoUri = getVideoUri(operation);
      if (!videoUri) return json(res, 200, { status: "failed", error: "The provider finished but did not return a downloadable video." });
      if (action === "video:status") return json(res, 200, { status: "completed", done: true, videoReady: true, model: MODEL });

      const parsed = new URL(videoUri);
      const headers = parsed.hostname === "generativelanguage.googleapis.com" ? { "x-goog-api-key": key } : {};
      const fileResponse = await fetch(videoUri, { headers, signal: AbortSignal.timeout(60000) });
      if (!fileResponse.ok) return json(res, 502, { error: "AURORA could not retrieve the completed video file. Try loading it again." });
      const bytes = Buffer.from(await fileResponse.arrayBuffer());
      if (!bytes.length || bytes.length > 48000000) return json(res, 502, { error: "The generated video is empty or exceeds the safe download limit." });
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", String(bytes.length));
      res.setHeader("Content-Disposition", 'attachment; filename="aurora-generated-video.mp4"');
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(bytes);
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      return json(res, timedOut ? 504 : 502, { error: timedOut ? "Checking or retrieving the video timed out. Try again." : "AURORA could not check this video job." });
    }
  }

  return json(res, 400, { error: "Unknown media job action." });
}
