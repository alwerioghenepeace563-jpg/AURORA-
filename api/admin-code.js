export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (body.action !== "edit_code" || !prompt || prompt.length > 2500) return res.status(400).json({ error: "Provide action=edit_code and a prompt under 2500 characters." });
  const auth = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!auth) return res.status(401).json({ error: "Sign in as the administrator first." });
  const supabase = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_API || "").replace(/\/$/, "").replace(/\/(rest\/v1|auth\/v1)$/i, "");
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabase || !supabaseKey) return res.status(503).json({ error: "Supabase authentication is not configured." });
  const userResponse = await fetch(supabase + "/auth/v1/user", { headers: { apikey: supabaseKey, Authorization: "Bearer " + auth[1] } });
  const user = await userResponse.json().catch(() => ({}));
  const allowed = (process.env.ADMIN_EMAIL_ALLOWLIST || "alwerioghenepeace563@gmail.com").split(",").map(x => x.trim().toLowerCase());
  if (!userResponse.ok || !allowed.includes(String(user.email || "").toLowerCase())) return res.status(403).json({ error: "Administrator access required." });
  const githubToken = process.env.AURORA_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (!githubToken) return res.status(503).json({ error: "Setup needed: add AURORA_GITHUB_TOKEN in Vercel with repository Contents and Pull requests read/write access. The token stays on the server." });
  const providerKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!providerKey) return res.status(503).json({ error: "Configure GROQ_API_KEY or OPENROUTER_API_KEY before using code editing." });
  const repo = process.env.AURORA_GITHUB_REPO || "alwerioghenepeace563-jpg/AURORA-";
  const gh = async (path, options = {}) => {
    const response = await fetch("https://api.github.com/repos/" + repo + path, { ...options, headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + githubToken, "X-GitHub-Api-Version": "2022-11-28", ...(options.body ? { "Content-Type": "application/json" } : {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("GitHub HTTP " + response.status + ": " + (data.message || "request failed"));
    return data;
  };
  try {
    const branchBase = process.env.AURORA_GITHUB_BASE_BRANCH || "main";
    const ref = await gh("/git/ref/heads/" + encodeURIComponent(branchBase));
    const files = ["src/App.jsx", "src/styles.css", "api/chat.js"];
    const contexts = [];
    for (const path of files) {
      const file = await gh("/contents/" + path + "?ref=" + encodeURIComponent(branchBase));
      const content = Buffer.from(file.content || "", "base64").toString("utf8");
      let excerpt = content;
      const lines = content.split("\n");
      if (path === "src/App.jsx") {
        const anchors = [];
        // Include contiguous source windows, not isolated matching lines, so exact patches can be grounded.
        const patterns = [/home-screen|hero-title|hero-subtitle|hero-orb/i, /admin-executor|FormattedMessage|activityTab/i];
        for (const pattern of patterns) {
          lines.forEach((line, index) => {
            if (pattern.test(line)) anchors.push([Math.max(0, index - 8), Math.min(lines.length, index + 14)]);
          });
        }
        const ranges = anchors.sort((a, b) => a[0] - b[0]).reduce((acc, range) => {
          const last = acc[acc.length - 1];
          if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
          else acc.push(range.slice());
          return acc;
        }, []);
        excerpt = ranges.map(([start, end]) => "[lines " + (start + 1) + "-" + end + "]\n" + lines.slice(start, end).map((line, i) => String(start + i + 1).padStart(4, " ") + ": " + line).join("\n")).join("\n...\n").slice(0, 24000);
      }
      if (path === "src/styles.css") {
        const anchors = [];
        const pattern = /orb-|hero-orb|hero-subtitle|home-screen|admin-executor/i;
        lines.forEach((line, index) => { if (pattern.test(line)) anchors.push([Math.max(0, index - 5), Math.min(lines.length, index + 12)]); });
        const ranges = anchors.sort((a, b) => a[0] - b[0]).reduce((acc, range) => {
          const last = acc[acc.length - 1];
          if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
          else acc.push(range.slice());
          return acc;
        }, []);
        excerpt = ranges.map(([start, end]) => "[lines " + (start + 1) + "-" + end + "]\n" + lines.slice(start, end).map((line, i) => String(start + i + 1).padStart(4, " ") + ": " + line).join("\n")).join("\n...\n").slice(0, 22000);
      }
      contexts.push({ path, sha: file.sha, content, excerpt });
    }
    const system = "You are the AURORA code editor. Return ONLY JSON: {summary:string,changes:[{path:string,find:string,replace:string}],checks:string[]}. Make small safe exact search/replace patches based on the provided code excerpts. Allowed paths: src/App.jsx, src/styles.css, api/chat.js. Never alter authentication or secrets. Max 6 changes. Every find string must be an exact unique substring of the actual file. If unable, return changes as an empty array and explain in summary.";
    const messages = [{ role: "system", content: system }, { role: "user", content: "Requested code change: " + prompt + "\n\nCurrent code excerpts:\n" + contexts.map(f => "--- " + f.path + " ---\n" + f.excerpt).join("\n") }];
    const providers = [
      { key: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/chat/completions", model: process.env.GROQ_MODEL || "openai/gpt-oss-20b" },
      { key: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", model: process.env.OPENROUTER_MODEL || "openrouter/free" }
    ];
    let patch = null;
    for (const provider of providers) {
      if (!process.env[provider.key]) continue;
      const ai = await fetch(provider.url, { method: "POST", headers: { Authorization: "Bearer " + process.env[provider.key], "Content-Type": "application/json" }, body: JSON.stringify({ model: provider.model, messages, temperature: 0.1, max_tokens: 5000 }) });
      const data = await ai.json().catch(() => ({}));
      if (!ai.ok) continue;
      try { patch = JSON.parse(String(data.choices[0].message.content).replace(/^\s*```json\s*/i, "").replace(/\s*```\s*$/, "")); break; } catch {}
    }
    if (!patch || !Array.isArray(patch.changes) || !patch.changes.length) return res.status(422).json({ error: patch && patch.summary || "AI could not generate a safe code patch. Try a more specific request." });
    if (patch.changes.length > 6) return res.status(422).json({ error: "Too many edits in one request. Split the task into smaller changes." });
    const changed = [];
    for (const change of patch.changes) {
      const file = contexts.find(f => f.path === change.path);
      if (!file || typeof change.find !== "string" || !change.find || typeof change.replace !== "string") throw new Error("Invalid generated patch.");
      const at = file.content.indexOf(change.find);
      if (at < 0 || file.content.indexOf(change.find, at + 1) >= 0) throw new Error("Safety check failed: the exact code snippet was missing or ambiguous in " + change.path + ". No code was committed.");
      file.content = file.content.slice(0, at) + change.replace + file.content.slice(at + change.find.length);
      changed.push(change.path);
    }
    const branch = "aurora-executor/" + Date.now();
    await gh("/git/refs", { method: "POST", body: JSON.stringify({ ref: "refs/heads/" + branch, sha: ref.object.sha }) });
    for (const path of [...new Set(changed)]) {
      const file = contexts.find(f => f.path === path);
      await gh("/contents/" + path, { method: "PUT", body: JSON.stringify({ message: "AURORA Executor: " + String(patch.summary || "code change").slice(0, 90), content: Buffer.from(file.content).toString("base64"), branch, sha: file.sha }) });
    }
    const pr = await gh("/pulls", { method: "POST", body: JSON.stringify({ title: "AURORA Executor: " + String(patch.summary || "Code update").slice(0, 150), head: branch, base: branchBase, body: "Requested change: " + prompt + "\n\nSummary: " + String(patch.summary || "Code update") + "\n\nFiles: " + [...new Set(changed)].join(", ") + "\n\nPlease review and run the build before merging." }) });
    return res.status(200).json({ ok: true, summary: patch.summary || "Code changes prepared", filesChanged: [...new Set(changed)], pullRequest: { number: pr.number, url: pr.html_url, title: pr.title }, checks: patch.checks || [], message: "Changes are in a review pull request. Merge it to deploy." });
  } catch (error) { return res.status(500).json({ error: String(error.message || "Code editing failed").slice(0, 400) }); }
}