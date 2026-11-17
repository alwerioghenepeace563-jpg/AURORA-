const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = file => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const migration = read("supabase/migrations/202611170001_aurora_research_queue.sql");
const worker = read("supabase/functions/aurora-research-worker/index.ts");
const config = read("supabase/config.toml");
const api = read("api/search.js");
const client = read("src/research/research-client.js");
const app = read("src/App.jsx");
const env = read(".env.example");
const envGuide = read("docs/integrations/AURORA_API_KEYS_AND_SECRETS_SETUP.md");
const workflow = read(".github/workflows/aurora-android-compile.yml");

assert.match(migration, /create table if not exists public\.aurora_research_tasks/);
assert.match(migration, /create table if not exists public\.aurora_research_saved/);
assert.match(migration, /enable row level security/);
assert.match(migration, /auth\.uid\(\) = user_id/);
assert.match(migration, /for update skip locked/i);
assert.match(migration, /grant execute on function public\.claim_aurora_research_task\(\) to service_role/);
assert.match(migration, /with check \(auth\.uid\(\) = user_id and status = 'cancelled'\)/);

assert.match(worker, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(worker, /AURORA_RESEARCH_WORKER_TOKEN/);
assert.match(worker, /claim_aurora_research_task/);
assert.match(worker, /AbortSignal\.timeout\(45000\)/);
assert.match(worker, /next_attempt_at/);
assert.match(worker, /MAX_PER_INVOCATION/);
assert.match(config, /\[functions\.aurora-research-worker\]/);
assert.match(config, /verify_jwt = false/);

assert.ok(api.indexOf("let requestBody") < api.indexOf("const requestAction"), "API body must be parsed before action dispatch");
for (const action of ["create-task", "task-status", "task-list", "cancel-task", "save-research", "library-list", "delete-research"]) {
  assert.ok(api.includes(action), "Missing research API action: " + action);
}
assert.match(api, /verifySupabaseUser\(req\)/);
assert.match(api, /Research worker authorization failed/);
assert.match(api, /safeResearchSnapshot/);

for (const method of [
  "createAuroraResearchTask", "getAuroraResearchTask", "listAuroraResearchTasks",
  "cancelAuroraResearchTask", "saveAuroraResearchResult", "listAuroraSavedResearch",
  "deleteAuroraSavedResearch"
]) assert.ok(client.includes("function " + method), "Missing client method: " + method);
assert.match(client, /LOCAL_LIBRARY_KEY/);
assert.match(client, /localOnly: true/);
assert.match(app, /createAuroraResearchTask/);
assert.match(app, /Research library/);
assert.match(app, /Background tasks/);
assert.match(app, /refreshBackgroundResearch/);
assert.match(env, /AURORA_RESEARCH_WORKER_TOKEN=/);
assert.match(env, /AURORA_RESEARCH_WORKER_URL=/);
assert.match(envGuide, /AURORA_RESEARCH_WORKER_URL/);
assert.match(envGuide, /AURORA_RESEARCH_WORKER_TOKEN/);
assert.match(workflow, /npm run test:aurora-research/);

console.log("AURORA durable research queue, worker, owner isolation, saved library and UI contracts passed.");
