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
5. Source links open in the isolated AURORA research browser. Video previews use an in-app video element; Android image/video downloads use the existing native Download Manager adapter.

## Module boundaries

- `intent-engine.js`: request classification and media intent.
- `source-registry.js`: provider capability metadata.
- `search-engine.js`: multi-provider public web discovery.
- `visual-engine.js`: image, diagram, video and document discovery.
- `browser-engine.js`: Android isolated browser adapter.
- `result-normalizer.js`: normalized source and media records.
- `verification-engine.js`: evidence-diversity assessment.
- `citation-engine.js`: source references and model context.
- `research-cache.js`: bounded in-memory cache; no persistent query history.
- `research-coordinator.js`: shared task orchestration and result lifecycle.

## Android isolation

The native browser activity runs in the `:aurora_research` process. On Android 9+, it sets the WebView data-directory suffix to `aurora_research` before creating a WebView. Cookies are disabled, third-party cookies are disabled, file/content access is disabled, mixed content is blocked, and the activity rejects non-HTTPS or local/private network targets. No AURORA login token or main-browser cookie is passed to it.

The hidden extraction mode is a short-lived translucent activity. It extracts a bounded page title, URL and text excerpt, then closes. The visible mode opens the same isolated browser profile for the user. Clearing research browser data clears its cache, cookies and Web Storage without clearing the main app's login.

## Evidence and limitations

- Results are discovery records, not a guarantee that an article's full text has been independently verified.
- The verification module currently measures provider/domain diversity and explicitly reports `discovery_only`; it does not fabricate claim-level corroboration.
- The current server task is synchronous request/response. Durable server task queues, background continuation after process death, and persistent research history are not implemented in this first slice.
- Diagram discovery currently uses image search results; PDF discovery is limited to public Internet Archive records.
- Media reuse remains subject to each item's licence and attribution requirements.

## Regression checks

Run `npm run test:aurora-research`. The existing Vercel function-count test remains at its original API-function count because research routing is consolidated into `/api/search`.
