import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;

function decode(value="") {
  return String(value).replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function httpsUrl(value) {
  try {
    const url=new URL(decode(value));
    if(url.protocol!=="https:" || /(^|\\.)(localhost|local|internal)$/.test(url.hostname)) return "";
    return url.href;
  } catch { return ""; }
}
function parseImageResults(payload) {
  const rows=Array.isArray(payload?.results)?payload.results:[];
  const seen=new Set();
  return rows.map(row=>{
    const image= httpsUrl(row.image || row.thumbnail);
    const page= httpsUrl(row.url || row.source);
    const title=String(row.title||"Image result").replace(/<[^>]*>/g," ").replace(/\\s+/g," ").trim().slice(0,180);
    const source=String(row.source||"").slice(0,100);
    if(!image||!page||!title||seen.has(image)) return null;
    seen.add(image);
    return {id:image,title,imageUrl:image,pageUrl:page,source};
  }).filter(Boolean).slice(0,12);
}
export default async function handler(req,res) {
  if(applyAuroraCors(req,res,"GET, OPTIONS")) return;
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="GET") {res.setHeader("Allow","GET, OPTIONS");return res.status(405).json({error:"Use GET."});}
  const query=typeof req.query?.q==="string"?req.query.q.trim().slice(0,180):"";
  if(query.length<2) return res.status(400).json({error:"Enter what kind of media you need."});
  try {
    const url="https://duckduckgo.com/i.js?o=json&q="+encodeURIComponent(query+" high quality image");
    const response=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0 (compatible; AURORA Media Search/1.0)","Referer":"https://duckduckgo.com/"},signal:AbortSignal.timeout(9000)});
    if(!response.ok) throw new Error("Image search returned HTTP "+response.status);
    const payload=await response.json();
    const results=parseImageResults(payload);
    if(!results.length) throw new Error("No usable image results were returned.");
    return res.status(200).json({query,source:"DuckDuckGo image search",results,rightsNotice:"These are web search results, not automatically licensed downloads. Open the source page and check its licence/usage terms before publishing or reusing."});
  } catch(error) {
    console.warn("AURORA media search unavailable:",error?.message||"Search failed");
    return res.status(502).json({error:"Media search is temporarily unavailable. Try again or use a more specific description."});
  }
}
