import cors from "../../lib/cors.cjs";
import chatHandler from "../chat.js";
const { applyAuroraCors } = cors;

export default async function handler(req, res) {
  try {
    if (applyAuroraCors(req, res, "POST, OPTIONS")) return;

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin, Authorization");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return res.status(405).json({ error: "Use POST." });
    }

    const authorization = String(req?.headers?.authorization || "");
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        error: "A valid Supabase sign-in token is required."
      });
    }

    const supabaseUrl = String(
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.VITE_SUPABASE_API ||
      ""
    ).trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");

    const supabaseKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "";

    if (!supabaseUrl || !supabaseKey) {
      return res.status(503).json({
        error: "Server authentication is not configured."
      });
    }

    let authResponse;

    try {
      authResponse = await fetch(supabaseUrl + "/auth/v1/user", {
        headers: {
          apikey: supabaseKey,
          Authorization: "Bearer " + match[1]
        },
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      return res.status(502).json({
        error: "Could not reach the authentication service."
      });
    }

    if (!authResponse.ok) {
      return res.status(401).json({
        error: "The sign-in token is invalid or expired."
      });
    }

    const user = await authResponse.json().catch(() => null);

    if (!user || typeof user.id !== "string" || !user.id) {
      return res.status(401).json({
        error: "The authentication service returned an invalid user."
      });
    }

    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = null;
      }
    }

    if (
      !body ||
      !Array.isArray(body.messages) ||
      body.messages.length < 1 ||
      body.messages.length > 20
    ) {
      return res.status(400).json({
        error: "Send between 1 and 20 messages."
      });
    }

    for (const message of body.messages) {
      if (
        !message ||
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        !message.content.trim() ||
        message.content.length > 6000
      ) {
        return res.status(400).json({
          error: "Each message needs a valid role and text up to 6000 characters."
        });
      }
    }

    return await chatHandler(req, res);
  } catch (error) {
    console.error(
      "AURORA Core endpoint error:",
      error?.message || "Unknown error"
    );

    if (!res.headersSent) {
      return res.status(500).json({
        error: "AURORA Core encountered an unexpected error."
      });
    }

    return res.end();
  }
}
