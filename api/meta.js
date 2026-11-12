import healthHandler from "../lib/vercel-handlers/health.js";
import modelsHandler from "../lib/vercel-handlers/models.js";
import publicConfigHandler from "../lib/vercel-handlers/public-config.js";

// Keep lightweight metadata endpoints behind one Hobby-plan function.
export default async function handler(req, res) {
  const route = String(req.query?.handler || "");
  if (route === "health") return healthHandler(req, res);
  if (route === "models") return modelsHandler(req, res);
  if (route === "public-config") return publicConfigHandler(req, res);
  return res.status(404).json({ error: "Unknown AURORA metadata route." });
}
