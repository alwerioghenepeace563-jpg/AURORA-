const fs = require("node:fs");
const path = require("node:path");

const searchFile = path.resolve("api/search.js");
const chatFile = path.resolve("api/chat.js");

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  return fs.readFileSync(file, "utf8");
}
function backup(file) {
  const target = file + ".before-live-search.bak";
  if (!fs.existsSync(target)) fs.copyFileSync(file, target);
  console.log("Backup:", path.relative(process.cwd(), target));
}
function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

let search = read(searchFile);
let chat = read(chatFile);

const searchMarker = "export default async function handler(req, res) {";
const chatImportMarker = 'import cors from "../lib/cors.cjs";';
const contextMarker = "  const liveToolContext = clean(body.toolContext, 9000);";
const systemMarker = '    (liveToolContext ?';
const profileMarker = '"\\nTreat profile details as private context.';

if (!search.includes(searchMarker)) throw new Error("Search handler marker missing.");
if (!chat.includes(chatImportMarker)) throw new Error("Chat import marker missing.");
if (!chat.includes(contextMarker)) throw new Error("Chat context marker missing.");
if (!chat.includes(systemMarker) || !chat.includes(profileMarker)) {
  throw new Error("Chat system-prompt markers missing.");
}

if (search.includes("export async function searchAuroraWeb(") ||
    chat.includes("AURORA_LIVE_SEARCH_CONTEXT")) {
  throw new Error("Live search patch markers already exist. Stopping to avoid duplicate edits.");
}

const sharedSearch = String.raw`
export async function searchAuroraWeb(rawQuery) {
  const query = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 240) : "";
  if (query.length < 2) throw new Error("Search query is too short.");

  const looksLikeNews = /\b(news|headlines|breaking news|current affairs)\b|\b(latest|breaking|current|today'?s|recent)\b.{0,50}\b(naija|Nigeria|world|tech|sports|politics|updates)\b/i.test(query);
  const errors = [];
  const attemptGroup = async (attempts) => {
    try {
      return await Promise.any(attempts);
    } catch (error) {
      for (const item of (error?.errors || [])) {
        errors.push(String(item?.message || "Provider failed").slice(0, 160));
      }
      return null;
    }
  };

  if (looksLikeNews) {
    const news = await attemptGroup([
      parseGoogleNewsSearch(query).then(results => ({
        query, results, source: "Google News"
      }))
    ]);
    if (news?.results?.length) {
      return { ...news, results: news.results.slice(0, 5) };
    }
  }

  const providers = [
    { name: "DuckDuckGo", url: "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), parse: parseDuck },
    { name: "DuckDuckGo Lite", url: "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query), parse: parseDuckLite },
    { name: "Bing", url: "https://www.bing.com/search?q=" + encodeURIComponent(query), parse: parseBing }
  ];

  const webResult = await attemptGroup(providers.map(async provider => {
    const response = await fetch(provider.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(4500)
    });
    if (!response.ok) throw new Error(provider.name + " HTTP " + response.status);
    const results = provider.parse(await response.text());
    if (!results.length) throw new Error(provider.name + " returned no parseable results");
    return { query, results, source: provider.name };
  }));

  if (webResult?.results?.length) {
    return { ...webResult, results: webResult.results.slice(0, 5) };
  }

  const fallback = await attemptGroup([
    parseWikipedia(query).then(results => {
      if (!results.length) throw new Error("Wikipedia returned no results");
      return { query, results, source: "Wikipedia" };
    }),
    parseDuckApi(query).then(results => ({
      query, results, source: "DuckDuckGo Instant Answers"
    }))
  ]);

  if (fallback?.results?.length) {
    return { ...fallback, results: fallback.results.slice(0, 5) };
  }

  throw new Error("All search providers failed: " + errors.join("; ").slice(0, 300));
}

`;

backup(searchFile);
backup(chatFile);

// Export a reusable function built from the search endpoint's existing parsers.
search = search.replace(searchMarker, sharedSearch + searchMarker);

// Connect it to the chat API without changing provider request/response handling.
chat = chat.replace(
  chatImportMarker,
  chatImportMarker + '\nimport { searchAuroraWeb } from "./search.js";'
);

const contextLine = contextMarker;
const liveSearchCode = String.raw`
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
      const searchResult = await searchAuroraWeb(searchText);
      const rows = Array.isArray(searchResult?.results) ? searchResult.results.slice(0, 5) : [];
      if (rows.length) {
        liveSearchContext = [
          "Search query: " + searchText,
          "Search source: " + String(searchResult.source || "web search"),
          ...rows.map((item, index) =>
            String(index + 1) + ". " + String(item.title || "Untitled").slice(0, 220) +
            "\nURL: " + String(item.url || "").slice(0, 500) +
            "\nSnippet: " + String(item.snippet || "").slice(0, 700)
          )
        ].join("\n\n").slice(0, 6500);
      }
    }
  } catch (searchError) {
    console.warn("AURORA live search unavailable; continuing with AI providers:", searchError?.message || "Search failed");
  }
`;

chat = chat.replace(contextLine, contextLine + "\n" + liveSearchCode);

const liveToolStart = chat.indexOf(systemMarker);
const liveToolEnd = chat.indexOf(': "") +', liveToolStart);
if (liveToolEnd < 0) throw new Error("Could not locate end of live-tool context expression.");

const insertionPoint = liveToolEnd + ': "") +'.length;
const searchPromptAddition = String.raw`
    (liveSearchContext ? "\nLIVE WEB SEARCH RESULTS (retrieved for this request):\n" + liveSearchContext +
      "\nUse these results for current claims, include relevant source links in Markdown, distinguish reported facts from inference, and mention uncertainty or conflicting results. Do not claim a source says more than its title/snippet supports." : "") +
`;
chat = chat.slice(0, insertionPoint) + "\n" + searchPromptAddition + chat.slice(insertionPoint);

write(searchFile, search);
write(chatFile, chat);

console.log("\nPatch applied. Checking JavaScript syntax...");
