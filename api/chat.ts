import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.AURORA_ALLOWED_ORIGIN;
  const origin = req.headers.origin;

  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return res.status(403).json({ error: "Origin not allowed." });
  }
  if (allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Use POST." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "AI service is not configured." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20) {
    return res.status(400).json({ error: "Send 1 to 20 messages." });
  }

  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const m of body.messages) {
    if (!m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content.trim() || m.content.length > 6000) {
      return res.status(400).json({ error: "Messages must contain a valid role and text up to 6000 characters." });
    }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }

  try {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are AURORA, a thoughtful personal AI assistant. Be warm, capable, clear, and honest about your limitations." }]
        },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
      })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("Gemini provider request failed, status:", upstream.status);
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: upstream.status === 429 ? "AI usage limit reached. Try again later." : "AI service could not complete the request."
      });
    }
    const reply = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();
    if (typeof reply !== "string" || !reply) return res.status(502).json({ error: "AI returned an empty response." });
    return res.status(200).json({ reply });
  } catch {
    return res.status(502).json({ error: "Could not reach the AI service." });
  }
}
