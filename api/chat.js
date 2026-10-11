export default async function handler(req, res) {
  const allowedOrigin = process.env.AURORA_ALLOWED_ORIGIN;
  const origin = req.headers.origin;

  if (allowedOrigin && origin && origin !== allowedOrigin) return res.status(403).json({ error: "Origin not allowed." });
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
    const parts = [{ text: m.content }];
    if (m.role === "user" && m.document && typeof m.document === "object") {
      const mimeType = typeof m.document.mimeType === "string" ? m.document.mimeType : "";
      const data = typeof m.document.data === "string" ? m.document.data : "";
      if (mimeType !== "application/pdf" || !data || data.length > 9000000 || !/^[A-Za-z0-9+/=]+$/.test(data)) {
        return res.status(400).json({ error: "PDF must be a valid document under the upload limit." });
      }
      parts.push({ inlineData: { mimeType, data } });
    }
    if (m.role === "user" && m.image && typeof m.image === "object") {
      const mimeType = typeof m.image.mimeType === "string" ? m.image.mimeType : "";
      const data = typeof m.image.data === "string" ? m.image.data : "";
      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType) || !data || data.length > 4500000 || !/^[A-Za-z0-9+/=]+$/.test(data)) {
        return res.status(400).json({ error: "Image must be a supported JPEG, PNG, or WebP file under the upload limit." });
      }
      parts.push({ inlineData: { mimeType, data } });
    }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts });
  }

  const configuredModel = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim().replace(/^models\//, "");
  const candidates = [...new Set([configuredModel, "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"])];
  const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
  const clean = (value, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const styleGuidance = {
    warm: "Use a warm, direct, encouraging style.",
    concise: "Keep answers short and direct unless more detail is requested.",
    teacher: "Teach clearly and step by step, with examples when useful.",
    calm: "Use a calm, structured style with clear next steps."
  };
  const profileContext = [
    clean(profile.nickname || profile.name, 80) ? "Preferred name: " + clean(profile.nickname || profile.name, 80) : "",
    clean(profile.wakeTime, 10) ? "Usual wake-up time: " + clean(profile.wakeTime, 10) : "",
    clean(profile.sleepTime, 10) ? "Usual sleep time: " + clean(profile.sleepTime, 10) : "",
    clean(profile.priorities, 500) ? "Daily priorities: " + clean(profile.priorities, 500) : "",
    clean(profile.foodPreferences, 250) ? "Food preferences: " + clean(profile.foodPreferences, 250) : "",
    clean(profile.dietaryRestrictions, 250) ? "Dietary restrictions: " + clean(profile.dietaryRestrictions, 250) : ""
  ].filter(Boolean).join("\n");
  const style = styleGuidance[clean(profile.assistantStyle, 20)] || styleGuidance.warm;
  const systemText = "You are AURORA, a thoughtful personal AI assistant. Be capable, clear, and honest about your limitations. " + style +
    (profileContext ? "\nUse these user-provided preferences when relevant, without awkwardly repeating them:\n" + profileContext : "") +
    "\nTreat profile details as private context. Do not reveal them unless relevant to the user's request.";
  const payload = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents,
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
  };

  try {
    let upstream;
    let data = {};
    let usedModel = configuredModel;

    for (const model of candidates) {
      usedModel = model;
      upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(18000)
      });
      data = await upstream.json().catch(() => ({}));
      if (upstream.ok) break;
      if (![404, 429, 503].includes(upstream.status)) break;
      console.warn("Gemini model unavailable; trying fallback model:", model, "HTTP", upstream.status);
    }

    if (!upstream.ok) {
      const providerMessage = typeof data?.error?.message === "string" ? data.error.message : "";
      console.error("Gemini provider request failed:", upstream.status, providerMessage, "Model:", usedModel);
      let message = "Gemini request failed. Check the API key, model access, quota, and deployment logs.";
      if (upstream.status === 400) message = "Gemini rejected the request. Check the request format.";
      if (upstream.status === 401) message = "Gemini rejected the API key. Check GEMINI_API_KEY in Vercel.";
      if (upstream.status === 403) message = "Gemini access is forbidden. Check the API key and Generative Language API access.";
      if (upstream.status === 404) message = "None of the available Gemini fallback models could be found for this API key.";
      if (upstream.status === 429) message = "Gemini quota or rate limit reached. Check the API quota.";
      const diagnosticText = providerMessage ? ` (HTTP ${upstream.status}: ${providerMessage.slice(0, 180)})` : ` (HTTP ${upstream.status})`;
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: message + diagnosticText,
        diagnostic: { model: usedModel, providerStatus: upstream.status, providerMessage: providerMessage.slice(0, 240) }
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.map((part) => typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();
    if (typeof reply !== "string" || !reply) return res.status(502).json({ error: "AI returned an empty response." });
    return res.status(200).json({ reply, model: usedModel });
  } catch (error) {
    console.error("AURORA chat function error:", error);
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return res.status(504).json({ error: "Gemini took too long to respond. Please try again in a moment." });
    }
    return res.status(502).json({ error: "Could not reach the AI service." });
  }
}
