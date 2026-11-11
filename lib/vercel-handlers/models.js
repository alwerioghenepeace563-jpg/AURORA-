import cors from "../cors.cjs";
const { applyAuroraCors } = cors;
export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "GET, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Use GET." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "GEMINI_API_KEY is not configured in Vercel." });

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
      headers: { "x-goog-api-key": key }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data?.error?.message === "string" ? data.error.message : "Could not list Gemini models.";
      return res.status(502).json({
        error: "Gemini model listing failed.",
        diagnostic: { providerStatus: response.status, providerMessage: message.slice(0, 240) }
      });
    }

    const models = (Array.isArray(data.models) ? data.models : [])
      .filter((model) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes("generateContent"))
      .map((model) => ({
        name: typeof model.baseModelId === "string" ? model.baseModelId : String(model.name || "").replace(/^models\//, ""),
        displayName: model.displayName || ""
      }))
      .filter((model) => model.name);

    return res.status(200).json({ count: models.length, models });
  } catch (error) {
    console.error("Gemini model listing failed:", error);
    return res.status(502).json({ error: "Could not reach Gemini to list models." });
  }
}
