const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../api/search.js"), "utf8");
assert.doesNotMatch(source, /fetch\(articleUrl\.href/, "Search must not fetch arbitrary result URLs from the server.");
assert.doesNotMatch(source, /async function attachArticleImages/, "Arbitrary article-page image scraping must stay disabled.");
assert.match(source, /return \{query,results,source:provider\.name\}/, "Web results should be returned without server-side page fetching.");
assert.match(source, /return results;\s*}\s*async function parseWikipedia/, "Google News RSS results should be returned without following article links.");
assert.match(source, /https:\/\/www\.bing\.com\/images\/search/, "Public visual retrieval should remain available through Bing Images.");
const mediaSearch = fs.readFileSync(path.join(__dirname, "../api/media-search.js"), "utf8");
assert.match(mediaSearch, /https:\/\/commons\.wikimedia\.org\/w\/api\.php/, "Licensed Commons media search should remain available.");
assert.match(mediaSearch, /https:\/\/archive\.org\/advancedsearch\.php/, "Internet Archive media search should remain available.");
console.log("AURORA search SSRF regression checks passed.");
