function getSupabaseConfig() {
  const supabaseUrl = String(
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.VITE_SUPABASE_API ||
    ""
  ).trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  return { supabaseUrl, supabaseKey };
}

async function verifySupabaseUser(req) {
  const authorization = String(req?.headers?.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, error: "Sign in to use this AURORA service." };

  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseKey) {
    return { ok: false, status: 503, error: "AURORA sign-in verification is not configured on the server." };
  }

  try {
    const response = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: supabaseKey, Authorization: "Bearer " + match[1] },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return { ok: false, status: 401, error: "Your sign-in session is invalid or expired. Please sign in again." };
    const user = await response.json().catch(() => null);
    if (!user || typeof user.id !== "string" || !user.id) {
      return { ok: false, status: 401, error: "AURORA could not verify your signed-in account." };
    }
    return { ok: true, user: { id: user.id, email: typeof user.email === "string" ? user.email : "" } };
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return { ok: false, status: 502, error: timedOut ? "Sign-in verification timed out. Please try again." : "AURORA could not reach its sign-in service." };
  }
}

module.exports = { verifySupabaseUser };
