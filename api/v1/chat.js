import cors from "../../lib/cors.cjs";
import auth from "../../lib/supabase-auth.cjs";
import chatHandler from "../chat.js";
const { applyAuroraCors } = cors;
const { verifySupabaseUser } = auth;

export default async function handler(req, res) {
  try {
    if (applyAuroraCors(req, res, "POST, OPTIONS")) return;

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin, Authorization");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return res.status(405).json({ error: "Use POST." });
    }

    const authResult = await verifySupabaseUser(req);
    if (!authResult.ok) {
      return res.status(authResult.status).json({
        error: authResult.error,
        code: "AUTH_REQUIRED"
      });
    }

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = null; }
    }

    if (!body || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20) {
      return res.status(400).json({ error: "Send between 1 and 20 messages." });
    }

    for (const message of body.messages) {
      if (!message || !["user", "assistant"].includes(message.role) ||
          typeof message.content !== "string" || !message.content.trim() ||
          message.content.length > 6000) {
        return res.status(400).json({
          error: "Each message needs a valid role and text up to 6000 characters."
        });
      }
    }

    return await chatHandler(req, res);
  } catch (error) {
    console.error("AURORA Core endpoint error:", error?.message || "Unknown error");
    if (!res.headersSent) {
      return res.status(500).json({ error: "AURORA Core encountered an unexpected error." });
    }
    return res.end();
  }
}
