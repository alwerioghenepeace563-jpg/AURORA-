import cors from "../lib/cors.cjs";
import auth from "../lib/supabase-auth.cjs";
const { applyAuroraCors } = cors;
const { verifySupabaseUser } = auth;

const ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4"]);

export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "POST, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin, Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Use POST." });
  }

  const authResult = await verifySupabaseUser(req);
  if (!authResult.ok) return res.status(authResult.status).json({ error: authResult.error, code: "AUTH_REQUIRED" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const aspectRatio = ASPECT_RATIOS.has(body?.aspectRatio) ? body.aspectRatio : "1:1";
  if (prompt.length < 8 || prompt.length > 1800) {
    return res.status(400).json({ error: "Describe the image in 8 to 1800 characters." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "Image generation is not configured. Add the Gemini API key on the server to enable it." });
  }

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3.1-flash-image",
        input: prompt,
        response_format: { type: "image", mime_type: "image/png", aspect_ratio: aspectRatio, image_size: "1K" }
      }),
      signal: AbortSignal.timeout(90000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status === 429 ? 429 : 502).json({
        error: response.status === 429
          ? "The image provider is busy or its quota is unavailable. Try again later."
          : "The image provider could not complete this request. Check Gemini access, model availability and quota."
      });
    }

    let image = result?.output_image;
    if (!image?.data && Array.isArray(result?.steps)) {
      for (const step of result.steps) {
        const block = (step?.content || []).find(item => item?.type === "image" && typeof item.data === "string");
        if (block) { image = { data: block.data, mime_type: block.mime_type }; break; }
      }
    }
    const data = typeof image?.data === "string" ? image.data : "";
    const mimeType = typeof image?.mime_type === "string" ? image.mime_type : "image/png";
    if (!data || data.length > 14000000 || !/^[A-Za-z0-9+/=]+$/.test(data) ||
        !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
      return res.status(502).json({ error: "The provider returned no supported image or the image exceeded the response limit." });
    }
    return res.status(200).json({ image: { data, mimeType }, model: "gemini-3.1-flash-image", aspectRatio, saved: false });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return res.status(504).json({
      error: timedOut
        ? "Image generation took too long. Try a shorter prompt or try again later."
        : "Image generation failed. Check the server connection and Gemini configuration."
    });
  }
}
