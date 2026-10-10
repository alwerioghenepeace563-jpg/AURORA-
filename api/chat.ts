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

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "AI service is not configured." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20) {
    return res.status(400).json({ error: "Send 1 to 20 messages." });
  }

  const messages = [];
  for (const m of body.messages) {
    if (!m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content.trim() || m.content.length > 6000) {
      return res.status(400).json({ error: "Messages must contain a valid role and text up to 6000 characters." });
    }
    messages.push({ role: m.role, content: m.content });
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are AURORA, a thoughtful personal AI assistant. Be warm, capable, clear, and honest about your limitations." },
          ...messages
        ],
        temperature: 0.7
      })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("AI provider request failed, status:", upstream.status);
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: upstream.status === 429 ? "AI usage limit reached. Try again later." : "AI service could not complete the request."
      });
    }
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) return res.status(502).json({ error: "AI returned an empty response." });
    return res.status(200).json({ reply });
  } catch {
    return res.status(502).json({ error: "Could not reach the AI service." });
  }
}
