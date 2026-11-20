interface ResearchEnv {
  [key: string]: string | undefined;
  AURORA_EXA_ENABLED?: string; AURORA_EXA_MCP_URL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string; AURORA_CLOUDFLARE_BROWSER_ENABLED?: string;
  AURORA_ALLOWED_ORIGIN?: string;
}
const MCP_VERSION = '2025-03-26';
const TIMEOUT = 10000;
const MAX_TEXT = 7000;
function json(body: unknown, headers: Headers, status = 200): Response {
  headers.set('Content-Type','application/json; charset=utf-8'); headers.set('Cache-Control','no-store');
  return new Response(JSON.stringify(body),{status,headers});
}
function cors(request:Request,env:ResearchEnv):Headers {
  const origin=request.headers.get('Origin')||'';
  const configured=(env.AURORA_ALLOWED_ORIGIN||'').split(',').map(v=>v.trim().replace(/\/+$/,'')).filter(Boolean);
  const allowed=new Set(['https://localhost','http://localhost','capacitor://localhost','ionic://localhost','https://aurora-ten-gold.vercel.app',...configured]);
  let preview=false; try { const u=new URL(origin); preview=u.protocol==='https:' && /^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(u.hostname); } catch {}
  const h=new Headers({'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, apikey, x-client-info','Access-Control-Max-Age':'86400','Cache-Control':'no-store'});
  const sameOrigin=origin===new URL(request.url).origin;
  if(origin&&(sameOrigin||allowed.has(origin)||preview))h.set('Access-Control-Allow-Origin',origin); return h;
}
function safeUrl(raw:string):string|null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    if (host.includes(':')) return null; // Reject IPv6 literals, including loopback and IPv4-mapped forms.
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        host === 'metadata.google.internal') return null;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      const octets = host.split('.').map(Number);
      if (octets.some(value => value < 0 || value > 255)) return null;
      const [a, b, c] = octets;
      if (a === 0 || a === 10 || a === 127 || a >= 224 ||
          (a === 100 && b >= 64 && b <= 127) ||
          (a === 169 && b === 254) ||
          (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && (b === 0 || b === 168)) ||
          (a === 192 && b === 0 && c === 2) ||
          (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
          (a === 203 && b === 0 && c === 113)) return null;
    }
    return u.href;
  } catch {
    return null;
  }
}
async function parseMcp(response:Response):Promise<any>{
  if(!response.ok)throw new Error('Research connector HTTP '+response.status);
  const body=await response.text(); if(!body)return null;
  if(response.headers.get('content-type')?.includes('text/event-stream')||body.startsWith('event:')||body.startsWith('data:')){
    for(const event of body.split(/\r?\n\r?\n/)){const data=event.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).join('\n');if(data&&data!=='[DONE]'){try{return JSON.parse(data)}catch{}}} return null;
  } return JSON.parse(body);
}
async function exaSearch(query:string,env:ResearchEnv):Promise<any|null>{
  if(env.AURORA_EXA_ENABLED==='false')return null;
  const endpoint=env.AURORA_EXA_MCP_URL||'https://mcp.exa.ai/mcp'; let sid='';let id=0;
  const rpc=async(method:string,params:Record<string,unknown>={})=>{
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',...(sid?{'Mcp-Session-Id':sid}:{})},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(TIMEOUT)});
    sid=r.headers.get('mcp-session-id')||sid;const p=await parseMcp(r);if(p?.error)throw new Error('Exa MCP request failed');return p?.result??null;
  };
  await rpc('initialize',{protocolVersion:MCP_VERSION,capabilities:{},clientInfo:{name:'AURORA Cloudflare',version:'1.0.0'}});
  const notice=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',...(sid?{'Mcp-Session-Id':sid}:{})},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized',params:{}}),signal:AbortSignal.timeout(TIMEOUT)});
  if(!notice.ok&&notice.status!==202)throw new Error('Exa MCP initialization failed');sid=notice.headers.get('mcp-session-id')||sid;
  const list=await rpc('tools/list'),tools=Array.isArray(list?.tools)?list.tools:[];
  const tool=tools.find((t:any)=>/search|research/i.test(String(t?.name||'')+' '+String(t?.description||''))&&t?.annotations?.destructiveHint!==true&&t?.annotations?.readOnlyHint!==false);
  if(!tool)return null;const schema=tool.inputSchema||{},props=schema.properties||{},args:Record<string,unknown>={};
  for(const key of Object.keys(props)){if(/query|search.?term|prompt|question|input/i.test(key))args[key]=query;else if(/limit|max.?results|num.?results/i.test(key))args[key]=5;}
  if((schema.required||[]).some((key:string)=>!(key in args)))return null;
  const result=await rpc('tools/call',{name:tool.name,arguments:args});if(result?.isError)throw new Error('Exa search failed');
  const parts=Array.isArray(result?.content)?result.content:[],text=parts.filter((p:any)=>p?.type==='text'&&typeof p.text==='string').map((p:any)=>p.text).join('\n').slice(0,MAX_TEXT);
  return text?{source:'Exa MCP',results:[{title:'Exa research results',url:'',snippet:text}]}:null;
}
async function fallbackSearch(query:string):Promise<any|null>{
  const r=await fetch('https://html.duckduckgo.com/html/?q='+encodeURIComponent(query),{headers:{'User-Agent':'Mozilla/5.0 (compatible; AURORA/1.0)','Accept':'text/html'},signal:AbortSignal.timeout(6500)});
  if(!r.ok)return null;const html=await r.text(),results:any[]=[];
  const re=/<a[^>]+class=[\"'][^\"']*result__a[^\"']*[\"'][^>]+href=[\"']([^\"']+)[\"'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(html))&&results.length<5){const title=m[2].replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'\\"').replace(/\s+/g,' ').trim();let target='';try{const u=new URL(m[1],'https://duckduckgo.com');target=u.searchParams.get('uddg')||u.href;target=safeUrl(target)||'';}catch{}if(target&&title&&!results.some(x=>x.url===target))results.push({title,url:target,snippet:''});}
  return results.length?{source:'DuckDuckGo',results}:null;
}
async function readPage(url:string,env:ResearchEnv):Promise<any|null>{
  if(!env.CLOUDFLARE_ACCOUNT_ID||!env.CLOUDFLARE_API_TOKEN||env.AURORA_CLOUDFLARE_BROWSER_ENABLED==='false')return null;
  const endpoint='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)+'/browser-run/markdown';
  const r=await fetch(endpoint,{method:'POST',headers:{'Authorization':'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(16000)});
  if(!r.ok)throw new Error('Cloudflare page reader HTTP '+r.status);const p:any=await r.json();
  const md=typeof p?.result==='string'?p.result:typeof p?.result?.markdown==='string'?p.result.markdown:typeof p?.markdown==='string'?p.markdown:'';
  return md.trim()?{source:'Cloudflare Browser Run',results:[{title:url,url,snippet:md.slice(0,MAX_TEXT)}]}:null;
}
export async function handleResearch(request:Request,env:ResearchEnv):Promise<Response>{
  const h=cors(request,env),origin=request.headers.get('Origin')||'';
  if(origin&&!h.has('Access-Control-Allow-Origin'))return json({error:'Origin not allowed.'},h,403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:h});
  if(request.method!=='GET'&&request.method!=='POST'){h.set('Allow','GET, POST');return json({error:'Use GET or POST.'},h,405)}
  let input:any={};if(request.method==='GET'){const u=new URL(request.url);input={query:u.searchParams.get('q')||'',url:u.searchParams.get('url')||''}}else input=await request.json().catch(()=>({}));
  const query=typeof input?.query==='string'?input.query.trim().slice(0,240):'',raw=typeof input?.url==='string'?input.url:'',url=raw?safeUrl(raw):null;
  if(raw&&!url)return json({error:'Only public HTTP or HTTPS webpage URLs can be read.'},h,400);
  if(query.length<2&&!url)return json({error:'Provide a search query or a public webpage URL.'},h,400);
  const failures:string[]=[];
  if(url){try{const page=await readPage(url,env);if(page)return json({query,source:page.source,results:page.results},h)}catch(e:any){failures.push(String(e?.message||'Browser reader unavailable').slice(0,120))}}
  if(query.length>=2){try{const exa=await exaSearch(query,env);if(exa)return json({query,...exa},h)}catch(e:any){failures.push(String(e?.message||'Exa unavailable').slice(0,120))}
    try{const fallback=await fallbackSearch(query);if(fallback)return json({query,...fallback},h)}catch(e:any){failures.push(String(e?.message||'Search fallback unavailable').slice(0,120))}}
  return json({error:'Research is temporarily unavailable.',providersTried:failures},h,502);
}
