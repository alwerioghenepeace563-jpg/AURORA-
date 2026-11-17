import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;
const clean = value => String(value||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,180);
const metaValue = value => clean(value && typeof value==="object" ? value.value : value);
function safeUrl(value) { try { const u=new URL(value); return u.protocol==="https:"&&!u.username&&!u.password?u.href:""; } catch { return ""; } }
async function commonsSearch(query,type) {
 const p=new URLSearchParams({action:"query",generator:"search",gsrsearch:query,gsrnamespace:"6",gsrlimit:"20",prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"640",format:"json",origin:"*"});
 const r=await fetch("https://commons.wikimedia.org/w/api.php?"+p,{headers:{"Accept":"application/json","User-Agent":"AURORA/1.0 media discovery"},signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw Error("Wikimedia Commons search failed");
 const d=await r.json();
 return Object.values(d?.query?.pages||{}).map(page=>{
  const info=page.imageinfo?.[0]||{},mime=String(info.mime||"");
  if(!/^(image|video)\//i.test(mime)||(type==="video"&&!mime.startsWith("video/"))||(type==="image"&&!mime.startsWith("image/")))return null;
  const downloadUrl=safeUrl(info.url),previewUrl=safeUrl(info.thumburl||info.url);if(!downloadUrl||!previewUrl)return null;
  const meta=info.extmetadata||{};
  return {id:"commons:"+downloadUrl,title:clean(String(page.title||"").replace(/^File:/,""))||"Commons media",kind:mime.startsWith("video/")?"video":"image",mimeType:mime,previewUrl,downloadUrl,pageUrl:"https://commons.wikimedia.org/wiki/"+encodeURIComponent(page.title||""),provider:"Wikimedia Commons",license:metaValue(meta.LicenseShortName)||"Check source licence",licenseUrl:safeUrl(meta.LicenseUrl?.value||""),attribution:metaValue(meta.Artist)||"See original file page",downloadable:true};
 }).filter(Boolean);
}
async function archiveSearch(query,type) {
 if(type==="image"||type==="diagram")return [];
 const archiveType=type==="document"?"texts":"movies";
 const r=await fetch("https://archive.org/advancedsearch.php?q="+encodeURIComponent(query+" AND mediatype:"+archiveType)+"&fl[]=identifier,title,mediatype&rows=8&page=1&output=json",{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw Error("Internet Archive search failed");
 const docs=(await r.json())?.response?.docs||[];
 const items=await Promise.all(docs.slice(0,6).map(async doc=>{
  const id=String(doc.identifier||"").replace(/[^A-Za-z0-9._-]/g,"");if(!id)return null;
  try{
   const mr=await fetch("https://archive.org/metadata/"+encodeURIComponent(id),{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(7000)});if(!mr.ok)return null;
   const meta=await mr.json(),files=Array.isArray(meta.files)?meta.files:[];
   const file=files.find(x=>type==="document"?/\.pdf$/i.test(String(x.name||"")):/\.(mp4|webm|mov)$/i.test(String(x.name||""))&&!String(x.source||"").includes("derivative"));if(!file)return null;
   const downloadUrl=safeUrl("https://archive.org/download/"+encodeURIComponent(id)+"/"+file.name.split("/").map(encodeURIComponent).join("/"));if(!downloadUrl)return null;
   return {id:"archive:"+id,title:clean(doc.title)||id,kind:type==="document"?"document":"video",mimeType:type==="document"?"application/pdf":/\.webm$/i.test(file.name)?"video/webm":"video/mp4",previewUrl:"https://archive.org/services/img/"+encodeURIComponent(id),downloadUrl,pageUrl:"https://archive.org/details/"+encodeURIComponent(id),provider:"Internet Archive",license:clean(meta.metadata?.licenseurl||meta.metadata?.rights||"Check item rights and usage terms"),licenseUrl:safeUrl(meta.metadata?.licenseurl||""),attribution:clean(meta.metadata?.creator||"See item details"),downloadable:true};
  }catch{return null;}
 }));
 return items.filter(Boolean);
}

export async function searchAuroraMedia(rawQuery, rawType = "all") {
 const query=typeof rawQuery==="string"?rawQuery.trim().slice(0,140):"";
 const type=["all","image","video","document","diagram"].includes(rawType)?rawType:"all";
 if(query.length<2)throw Error("Describe the media you need.");
 const jobs=[];
 if(type!=="document")jobs.push(commonsSearch(query,type==="diagram"?"image":type));
 if(type!=="image"&&type!=="diagram")jobs.push(archiveSearch(query,type));
 const settled=await Promise.allSettled(jobs);
 const results=settled.flatMap(item=>item.status==="fulfilled"?item.value:[]);
 const seen=new Set();
 const unique=results.filter(item=>{if(seen.has(item.downloadUrl))return false;seen.add(item.downloadUrl);return true;}).slice(0,20);
 const errors=settled.filter(item=>item.status==="rejected").map(item=>String(item.reason?.message||"Media provider unavailable").slice(0,160));
 return {query,type,source:"Wikimedia Commons and Internet Archive",results:unique,errors,
   rightsNotice:"Check each item's licence, attribution and usage terms before reusing or publishing it. AURORA does not bypass restrictions."};
}

export default async function handler(req,res) {
 if(applyAuroraCors(req,res,"GET, OPTIONS"))return;
 res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");
 if(req.method!=="GET"){res.setHeader("Allow","GET, OPTIONS");return res.status(405).json({error:"Use GET."});}
 const query=typeof req.query?.q==="string"?req.query.q.trim().slice(0,140):"",type=["all","image","video","document","diagram"].includes(req.query?.type)?req.query.type:"all";
 if(query.length<2)return res.status(400).json({error:"Describe the image, video, diagram or document you need."});
 try {
  const result=await searchAuroraMedia(query,type);
  if(!result.results.length)return res.status(502).json({error:"No matching public media was found. Try another description or open an official provider browser."});
  return res.status(200).json(result);
 } catch(error) {
  console.error("AURORA media discovery failed:",String(error?.message||error));
  return res.status(502).json({error:"Media discovery is temporarily unavailable."});
 }
}
