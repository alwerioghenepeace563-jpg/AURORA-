import { getPreferredProvider, setPreferredProvider, providerOrder } from "../lib/ai-provider.js";

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

  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const hasAttachments = body.messages.some((m) => m && (m.document || m.image));
  const configuredProviders = [
    groqKey ? "groq" : null,
    openRouterKey ? "openrouter" : null,
    geminiKey ? "gemini" : null
  ].filter(Boolean);

  try {
    const preferredProvider = await getPreferredProvider();
    const availableProviders = hasAttachments
      ? (geminiKey ? ["gemini"] : [])
      : providerOrder(preferredProvider, configuredProviders);
    const failures = [];

    for (const provider of availableProviders) {
      try {
        if (provider === "groq") {
          const groqMessages = [{ role: "system", content: systemText }, ...body.messages.map((m) => ({ role: m.role, content: m.content }))];
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: "Bearer " + groqKey, "Content-Type": "application/json" },
            body: JSON.stringify({ model: (process.env.GROQ_MODEL || "openai/gpt-oss-20b").trim(), messages: groqMessages, temperature: 0.7, max_completion_tokens: 1200 }),
            signal: AbortSignal.timeout(18000)
          });
          const data = await response.json().catch(() => ({}));
          const reply = data?.choices?.[0]?.message?.content;
          if (response.ok && typeof reply === "string" && reply.trim()) {
            await setPreferredProvider("groq");
            return res.status(200).json({ reply: reply.trim(), model: data?.model || process.env.GROQ_MODEL || "openai/gpt-oss-20b", provider: "groq" });
          }
          failures.push({ provider, status: response.status, message: data?.error?.message || "Provider returned no reply" });
          console.warn("AURORA Groq failed; trying next provider:", response.status, data?.error?.message || "");
          continue;
        }

        if (provider === "openrouter") {
          const openRouterMessages = [{ role: "system", content: systemText }, ...body.messages.map((m) => ({ role: m.role, content: m.content }))];
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: "Bearer " + openRouterKey, "Content-Type": "application/json", "X-Title": "AURORA" },
            body: JSON.stringify({ model: "openrouter/free", messages: openRouterMessages, temperature: 0.7, max_tokens: 1200 }),
            signal: AbortSignal.timeout(18000)
          });
          const data = await response.json().catch(() => ({}));
          const reply = data?.choices?.[0]?.message?.content;
          if (response.ok && typeof reply === "string" && reply.trim()) {
            await setPreferredProvider("openrouter");
            return res.status(200).json({ reply: reply.trim(), model: data?.model || "openrouter/free", provider: "openrouter" });
          }
          failures.push({ provider, status: response.status, message: data?.error?.message || "Provider returned no reply" });
          console.warn("AURORA OpenRouter failed; trying next provider:", response.status, data?.error?.message || "");
          continue;
        }

        if (provider === "gemini") {
          let upstream;
          let data = {};
          let usedModel = configuredModel;
          for (const model of candidates) {
            usedModel = model;
            upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
              method: "POST",
              headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(18000)
            });
            data = await upstream.json().catch(() => ({}));
            if (upstream.ok) break;
            if (![404, 429, 503].includes(upstream.status)) break;
            console.warn("Gemini model unavailable; trying fallback model:", model, "HTTP", upstream.status);
          }

          if (upstream?.ok) {
            const reply = data?.candidates?.[0]?.content?.parts?.map((part) => typeof part.text === "string" ? part.text : "").join("").trim();
            if (typeof reply === "string" && reply) {
              await setPreferredProvider("gemini");
              return res.status(200).json({ reply, model: usedModel, provider: "gemini" });
            }
            failures.push({ provider, status: 502, message: "AI returned an empty response." });
          } else {
            const providerMessage = typeof data?.error?.message === "string" ? data.error.message : "";
            failures.push({ provider, status: upstream?.status || 502, message: providerMessage || "Gemini request failed" });
            console.error("Gemini provider request failed:", upstream?.status, providerMessage, "Model:", usedModel);
          }
        }
      } catch (providerError) {
        failures.push({ provider, status: 0, message: providerError?.message || "Provider request failed" });
        console.warn("AURORA provider threw an error; trying next provider:", provider, providerError?.message || "Unknown error");
      }
    }

    if (!configuredProviders.length) {
      return res.status(503).json({ error: "AI service is not configured. Add GROQ_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY in Vercel." });
    }
    const lastFailure = failures[failures.length - 1];
    const rateLimited = failures.some((failure) => failure.status === 429);
    const timeout = failures.some((failure) => failure.status === 0);
    const detail = lastFailure?.message ? " " + String(lastFailure.message).slice(0, 180) : "";
    return res.status(rateLimited ? 429 : timeout ? 504 : 502).json({
      error: hasAttachments
        ? "AURORA couldn't process that file or image with Gemini. Check Gemini access and quota." + detail
        : "AURORA couldn't get a response from any configured AI provider." + detail,
      diagnostic: { providersTried: failures.map((failure) => failure.provider), failures: failures.map(({ provider, status }) => ({ provider, status })) }
    });
  } catch (error) {
    console.error("AURORA chat function error:", error);
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return res.status(504).json({ error: "Gemini took too long to respond. Please try again in a moment." });
    }
    return res.status(502).json({ error: "Could not reach the AI service." });
  }
}
