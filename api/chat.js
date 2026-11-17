import cors from "../lib/cors.cjs";
import { runAuroraResearch } from "../src/research/research-coordinator.js";
const { applyAuroraCors } = cors;
import aiProvider from "../lib/ai-provider.cjs";
const { getPreferredProvider, setPreferredProvider, providerOrder } = aiProvider;
import auroraCore from "../lib/aurora-core.cjs";
const { createTaskPlan, buildCoreInstructions } = auroraCore;
import { buildVoiceIntelligenceInstructions } from "../src/core/aurora-voice-intelligence.js";

async function chatHandler(req, res) {
  if (applyAuroraCors(req, res, "POST, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");

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
    if (m.role === "user" && m.media && typeof m.media === "object") {
      const mimeType = typeof m.media.mimeType === "string" ? m.media.mimeType : "";
      const data = typeof m.media.data === "string" ? m.media.data : "";
      const supportedMedia = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg", "video/mp4"];
      if (!supportedMedia.includes(mimeType) || !data || data.length > 3600000 || !/^[A-Za-z0-9+/=]+$/.test(data)) {
        return res.status(400).json({ error: "Audio/video must be a supported MP3, MP4, WAV, WebM or OGG file under the 2.5 MB upload limit." });
      }
      parts.push({ inlineData: { mimeType, data } });
    }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts });
  }

  const corePlan = createTaskPlan({ messages: body.messages, profile: body.profile, toolContext: body.toolContext });

  const configuredModel = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim().replace(/^models\//, "");
  const candidates = [...new Set([configuredModel, "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"])];
  const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
  const clean = (value, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const styleGuidance = {
    warm: "Use a warm, direct, encouraging style.",
    strict: "Be firm, focused, and accountable without being rude or shaming. State the priority clearly, challenge avoidance constructively, and give practical next steps.",
    concise: "Keep answers short and direct unless more detail is requested.",
    teacher: "Teach clearly and step by step, with examples when useful.",
    calm: "Use a calm, structured style with clear next steps."
  };
  const activeScheduleInstructions = clean(profile.activeScheduleInstructions, 2400);
  const liveToolContext = clean(body.toolContext, 9000);

  // AURORA_LIVE_SEARCH_CONTEXT: automatically retrieve web results for explicit
  // online/current-information requests. Search failure must not block AI fallback.
  let liveSearchContext = "";
  try {
    const latestUserMessage = [...body.messages].reverse().find(
      message => message?.role === "user" && typeof message.content === "string"
    );
    const searchText = latestUserMessage?.content?.trim().slice(0, 240) || "";
    const asksForLiveInfo = /\b(search (?:the )?(?:web|internet|online)|look up online|find online|latest|current|today'?s news|recent news|breaking news|headlines|news about|as of (?:today|now)|this week|current price|price of|what happened (?:today|recently))\b/i.test(searchText);
    const hasUserAttachments = body.messages.some(message => message?.image || message?.document);

    if (asksForLiveInfo && !hasUserAttachments && searchText.length >= 2) {
      const researchResult = await runAuroraResearch({ query: searchText, intent: "deep", mediaTypes: ["web"] });
      if (Array.isArray(researchResult?.sources) && researchResult.sources.length) {
        liveSearchContext = String(researchResult.context || "").slice(0, 8500);
      }
    }
  } catch (searchError) {
    console.warn("AURORA live search unavailable; continuing with AI providers:", searchError?.message || "Search failed");
  }

  const profileContext = [
    clean(profile.nickname || profile.name, 80) ? "Preferred name: " + clean(profile.nickname || profile.name, 80) : "",
    clean(profile.wakeTime, 10) ? "Usual wake-up time: " + clean(profile.wakeTime, 10) : "",
    clean(profile.sleepTime, 10) ? "Usual sleep time: " + clean(profile.sleepTime, 10) : "",
    clean(profile.priorities, 500) ? "Daily priorities: " + clean(profile.priorities, 500) : "",
    clean(profile.foodPreferences, 250) ? "Food preferences: " + clean(profile.foodPreferences, 250) : "",
    clean(profile.dietaryRestrictions, 250) ? "Dietary restrictions: " + clean(profile.dietaryRestrictions, 250) : ""
  ].filter(Boolean).join("\n");
  const style = styleGuidance[clean(profile.assistantStyle, 20)] || styleGuidance.warm;
  const voiceIntelligenceInstructions = buildVoiceIntelligenceInstructions(body.voiceIntelligence && typeof body.voiceIntelligence === "object" ? body.voiceIntelligence : {});
  const systemText = voiceIntelligenceInstructions + "\n\n" + "You are AURORA, a thoughtful personal AI companion. Talk naturally, warmly, and directly, like a helpful conversation rather than a formal report. Match the user's tone respectfully, but stay clear and capable. " + style +
    "\nWRITING STYLE: Avoid unnecessary headings, excessive bold text, repetitive summaries, and long formal lists for simple questions. Use short conversational paragraphs by default. Use headings, bullets, numbered steps, tables, and **bold** only when they genuinely make a complicated answer easier to scan. Render Markdown syntax normally; never explain formatting syntax to the user. Teach difficult ideas step by step with a clear example when useful. Be concise first, then expand when asked. Be warm without being overfamiliar in serious situations.\n" +
    "VISUAL HELP: When a visual would genuinely clarify an idea, use structured cards where useful. For processes with 3 or more stages, prefer a fenced JSON block containing an object with type flow, a title, and steps containing title, text, and optional hex color; the chat renders this as connected visual cards. For useful summaries, use a fenced JSON block with type card, title, optional description, items, and optional buttonLabel/buttonUrl. Keep JSON valid and convert ASCII or text-box diagrams into a flow visual instead of leaving them as a wall of box characters. Keep the JSON valid; never invent links and omit buttonUrl unless verified. Use these visuals only when they genuinely help, not in every answer. Never claim an actual picture was generated unless an image tool actually returned one. Explain uncertainty honestly.\n" +
    "CHOICES: When the user would genuinely benefit from choosing a next step, offer 2–4 short, specific options as the final line using exactly this format: [[CHOICES: Option one | Option two | Option three]]. Use this only when useful, not after every answer. The app turns these into tappable choice cards. Never put this marker anywhere except the final line.\n" +
    "TRUTHFULNESS: Never invent which AI company, model, or provider is answering. Never claim a provider switch succeeded unless the backend confirms it. Separate facts found in a user document from suggestions or general knowledge, and say clearly when a document does not state something. Do not invent deadlines, fees, sources, capabilities, or actions. " + style +
    (profileContext ? "\nUse these user-provided preferences when relevant, without awkwardly repeating them:\n" + profileContext : "") +
    (activeScheduleInstructions ? "\nTEMPORARY SCHEDULE INSTRUCTIONS (only active during the scheduled time window; follow these for the current response unless they conflict with safety or the user’s latest explicit request):\n" + activeScheduleInstructions : "") +
    (liveToolContext ? "\nLIVE TOOL RESULTS (use these for the current request; they came from an AURORA capability that ran for this turn):\n" + liveToolContext + "\nUse this live result rather than claiming you cannot access the relevant information. Do not imply a tool ran when no result was supplied." : "") +

    (liveSearchContext ? "\nLIVE WEB SEARCH RESULTS (retrieved for this request):\n" + liveSearchContext +
      "\nUse these results for current claims, include relevant source links in Markdown, distinguish reported facts from inference, and mention uncertainty or conflicting results. Do not claim a source says more than its title/snippet supports." : "") +

    "\nTreat profile details as private context. Do not reveal them unless relevant to the user's request." +
    "\n\n" + buildCoreInstructions(corePlan);
  const hasMedia = body.messages.some((m) => m && m.media);

  const payload = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents,
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.7, maxOutputTokens: hasMedia ? 8192 : 1200 }
  };

  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const hasAttachments = body.messages.some((m) => m && (m.document || m.image || m.media));
  const hasImages = body.messages.some((m) => m && m.image);
  const hasPdfs = body.messages.some((m) => m && m.document);
  const configuredProviders = [
    groqKey ? "groq" : null,
    openRouterKey ? "openrouter" : null,
    geminiKey ? "gemini" : null
  ].filter(Boolean);

  try {
    const storedProvider = await getPreferredProvider();
    const requestedProvider = ["groq", "openrouter", "gemini"].includes(body.preferredProvider) && configuredProviders.includes(body.preferredProvider)
      ? body.preferredProvider
      : storedProvider;
    const orderedProviders = providerOrder(requestedProvider, configuredProviders);
    // Images can use any configured vision-capable provider. PDFs use OpenRouter file input or Gemini native PDF input.
    const availableProviders = hasMedia
      ? orderedProviders.filter((provider) => provider === "gemini")
      : hasPdfs
        ? orderedProviders.filter((provider) => provider === "openrouter" || provider === "gemini")
        : orderedProviders;
    const failures = [];

    for (const provider of availableProviders) {
      try {
        if (provider === "groq") {
          const groqMessages = [{ role: "system", content: systemText }, ...body.messages.map((m) => {
            if (m.image) return { role: m.role, content: [
              { type: "text", text: m.content },
              { type: "image_url", image_url: { url: "data:" + m.image.mimeType + ";base64," + m.image.data } }
            ] };
            return { role: m.role, content: m.content };
          })];
          const groqModel = hasImages ? (process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b").trim() : (process.env.GROQ_MODEL || "openai/gpt-oss-20b").trim();
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: "Bearer " + groqKey, "Content-Type": "application/json" },
            body: JSON.stringify({ model: groqModel, messages: groqMessages, temperature: 0.7, max_completion_tokens: 1200 }),
            signal: AbortSignal.timeout(18000)
          });
          const data = await response.json().catch(() => ({}));
          const reply = data?.choices?.[0]?.message?.content;
          if (response.ok && typeof reply === "string" && reply.trim()) {
            await setPreferredProvider("groq");
            return res.status(200).json({ reply: reply.trim(), model: data?.model || groqModel, provider: "groq" });
          }
          failures.push({ provider, status: response.status, message: data?.error?.message || "Provider returned no reply" });
          console.warn("AURORA Groq failed; trying next provider:", response.status, data?.error?.message || "");
          continue;
        }

        if (provider === "openrouter") {
          const openRouterMessages = [{ role: "system", content: systemText }, ...body.messages.map((m) => {
            if (m.image || m.document) {
              const parts = [{ type: "text", text: m.content }];
              if (m.image) parts.push({ type: "image_url", image_url: { url: "data:" + m.image.mimeType + ";base64," + m.image.data } });
              if (m.document) parts.push({ type: "file", file: { filename: "aurora-upload.pdf", file_data: "data:application/pdf;base64," + m.document.data } });
              return { role: m.role, content: parts };
            }
            return { role: m.role, content: m.content };
          })];
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
            if (![400, 404].includes(upstream.status)) break;
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
    // Return short, provider-specific diagnostics so a failed fallback can be repaired without exposing credentials.
    const providerDetails = failures.map(({ provider, status, message }) => {
      const safeMessage = String(message || "No details").replace(/[\\r\\n]+/g, " ").slice(0, 140);
      return provider + " HTTP " + status + ": " + safeMessage;
    });
    const troubleshooting = providerDetails.length ? " Provider checks: " + providerDetails.join(" | ").slice(0, 650) : "";
    return res.status(rateLimited ? 429 : timeout ? 504 : 502).json({
      error: (hasAttachments
        ? "AURORA couldn't process that file or image with the available AI providers. Check provider access and quota, or try again shortly."
        : "AURORA couldn't get a response from any configured AI provider.") + detail + troubleshooting,
      diagnostic: { providersTried: failures.map((failure) => failure.provider), failures: failures.map(({ provider, status }) => ({ provider, status })) }
    });
  } catch (error) {
    console.error("AURORA chat function error:", error);
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return res.status(504).json({ error: "AURORA's AI providers took too long to respond. Please try again in a moment." });
    }
    return res.status(502).json({ error: "Could not reach the AI service." });
  }
}


// Catch failures that occur before provider handling begins, so the client receives
// a diagnostic JSON response instead of Vercel's generic FUNCTION_INVOCATION_FAILED.
export default async function handler(req, res) {
  try {
    return await chatHandler(req, res);
  } catch (error) {
    console.error("AURORA chat handler crashed outside provider handling:", error?.stack || error?.message || "Unknown error");
    if (!res.headersSent) {
      return res.status(500).json({ error: "AURORA chat encountered an unexpected server error. Check the Vercel function logs." });
    }
    return res.end();
  }
}
