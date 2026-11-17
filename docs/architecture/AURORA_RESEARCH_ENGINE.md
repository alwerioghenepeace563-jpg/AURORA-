# AURORA Research Engine

## Locked architecture

- Execution: hybrid (server-first search and media discovery, isolated Android WebView fallback).
- Browser data: isolated from the main AURORA WebView and its authentication session.
- Visual discovery: images, diagrams, videos and public PDF documents.
- Research autonomy: automatic intent classification, provider fan-out and partial-result handling.
- Main Chat, the Search tool and Pulse use the same research API/coordinator.

## Runtime flow

1. Main Chat and Pulse send live research requests through `/api/chat`.
2. The Search tool and Pulse's explicit Search shortcut use `POST /api/search` with `research: true`.
3. `runAuroraResearch` classifies the request, starts web and media discovery concurrently, normalizes records, builds citations and labels evidence quality.
4. On Android, the Search tool can fall back to a dedicated research WebView if the server request fails.
5. Source links open in the isolated AURORA research browser. Video previews use an in-app video element; Android image/video/PDF downloads use the native Download Manager adapter.

## Module boundaries

- `intent-engine.js`: request classification and media intent.
- `source-registry.js`: provider capability metadata.
- `search-engine.js`: multi-provider public web discovery.
- `visual-engine.js`: image, diagram, video and document discovery.
- `browser-engine.js`: Android isolated browser adapter.
- `result-normalizer.js`: normalized source and media records.
- `verification-engine.js`: evidence-diversity assessment.
- `citation-engine.js`: source references and model context.
- `research-cache.js`: bounded in-memory cache for short-lived results.
- `research-client.js`: durable task lifecycle and local/cloud saved-library client.
- `research-coordinator.js`: shared task orchestration and result lifecycle.

## Android isolation

The native browser activity runs in the `:aurora_research` process. On Android 9+, it sets the WebView data-directory suffix to `aurora_research` before creating a WebView. Cookies are disabled, third-party cookies are disabled, file/content access is disabled, mixed content is blocked, and the activity rejects non-HTTPS or local/private network targets. No AURORA login token or main-browser cookie is passed to it.

The hidden extraction mode is a short-lived translucent activity. It extracts a bounded page title, URL and text excerpt, then closes. The visible mode opens the same isolated browser profile for the user. Clearing research browser data clears its cache, cookies and Web Storage without clearing the main app's login.

## Evidence and limitations

- Results are discovery records, not a guarantee that an article's full text has been independently verified.
- The verification module currently measures provider/domain diversity and explicitly reports `discovery_only`; it does not fabricate claim-level corroboration.
- Signed-in Search tool requests can be persisted in `aurora_research_tasks`, processed by a Supabase Edge Function worker, retried with bounded exponential backoff, and resumed from the Research Library after app closure.
- `aurora_research_saved` stores user-selected research snapshots under owner-only RLS. Guests retain a local-only library.
- Main Chat and Pulse retain synchronous research so they can answer within the same conversational turn.
- Diagram discovery currently uses image search results; PDF discovery is limited to public Internet Archive records.
- Media reuse remains subject to each item's licence and attribution requirements.


## Durable queue and saved library

- `POST /api/search` with `action: "create-task"` creates an authenticated user-owned job.
- `GET /api/search?action=task-status&taskId=<uuid>` reads one job; `action=task-list` lists the user's latest jobs.
- `POST /api/search` with `action: "cancel-task"` cancels a queued/running job.
- The Edge Function `aurora-research-worker` atomically claims tasks using `claim_aurora_research_task()`, runs the existing research coordinator, and persists complete/partial results.
- Expired leases are reclaimable. Transient failures retry with bounded exponential backoff and terminal failures are recorded after the attempt limit.
- `save-research`, `library-list` and `delete-research` actions provide the authenticated cloud library; guest saves remain local.

## One-time Supabase activation

The migration and Edge Function are committed but are not applied/deployed automatically.

1. Apply `supabase/migrations/202611170001_aurora_research_queue.sql` in the Supabase SQL Editor.
2. Generate one random secret (at least 32 bytes). Set it as `AURORA_RESEARCH_WORKER_TOKEN` in the AURORA Vercel server environment and as the same Edge Function secret.
3. Set `AURORA_RESEARCH_API_URL=https://aurora-ten-gold.vercel.app` and `AURORA_RESEARCH_WORKER_TOKEN=<same-secret>` with `supabase secrets set`.
4. Set `AURORA_RESEARCH_WORKER_URL=https://<project-ref>.supabase.co/functions/v1/aurora-research-worker` and the same worker token in the AURORA Vercel server environment.
5. Deploy with `supabase functions deploy aurora-research-worker`.
6. Enable `pg_cron`, `pg_net` and `vault` in Supabase if needed, then store the worker URL/token in Vault and schedule a one-minute worker wake-up:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/aurora-research-worker', 'aurora_research_worker_url');
select vault.create_secret('<same-worker-secret>', 'aurora_research_worker_token');
select cron.schedule('aurora-research-worker', '* * * * *', $
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'aurora_research_worker_url'),
    headers := jsonb_build_object('Content-Type','application/json','x-aurora-worker-token',(select decrypted_secret from vault.decrypted_secrets where name = 'aurora_research_worker_token')),
    body := '{"source":"cron"}'::jsonb
  );
$);
```

Do not commit or paste the worker secret into chat. The service-role key is used only inside the Edge Function runtime and never reaches the app.

## Regression and build checks

- `npm run test:aurora-research` includes durable task, RLS, worker retry/auth and saved-library assertions.
- `npm run test:core` includes the research regression suite.
- The Android compile workflow builds a debug APK artifact for inspection; it does not use the release signing key or publish an update.
- No Vercel deployment is performed.

## Regression checks

Run `npm run test:aurora-research`. The existing Vercel function-count test remains at its original API-function count because research routing is consolidated into `/api/search`.
