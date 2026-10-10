export default async function handler(req, res) {
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

  const contents = [];
  for (const m of body.messages) {
    if (!m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content.trim() || m.content.length > 6000) {
      return res.status(400).json({ error: "Messages must contain a valid role and text up to 6000 characters." });
    }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }

  try {
    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "You are AURORA, a thoughtful personal AI assistant. Be warm, capable, clear, and honest about your limitations." }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
      })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const providerMessage = typeof data?.error?.message === "string" ? data.error.message : "";
      console.error("Gemini provider request failed:", upstream.status, providerMessage);
      let message = "Gemini couldn't complete the request. Check the deployment logs.";
      if (upstream.status === 400) message = "Gemini rejected the request or model setting. Check GEMINI_MODEL.";
      if (upstream.status === 401) message = "Gemini rejected the API key. Check GEMINI_API_KEY in Vercel.";
      if (upstream.status === 403) message = "Gemini access is forbidden. Check that the API key is valid and the Generative Language API is enabled for its Google project.";
      if (upstream.status === 404) message = "The Gemini model was not found. Check GEMINI_MODEL.";
      if (upstream.status === 429) message = "Gemini quota or rate limit reached. Check the API quota and billing limits.";
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: message,
        diagnostic: { providerStatus: upstream.status, providerMessage: providerMessage.slice(0, 240) }
      });
    }
    const reply = data?.candidates?.[0]?.content?.parts
      ?.map((part) => typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();
    if (typeof reply !== "string" || !reply) return res.status(502).json({ error: "AI returned an empty response." });
    return res.status(200).json({ reply });
  } catch (error) {
    console.error("AURORA chat function error:", error);
    return res.status(502).json({ error: "Could not reach the AI service." });
  }
}
