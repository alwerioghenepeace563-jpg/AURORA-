import { useEffect, useMemo, useState } from "react";
import { BellRing, Eye, Pause, Play, Plus, ShieldCheck, Trash2, Clock3, RadioTower } from "lucide-react";
import { createAuroraWatchtower } from "../core/aurora-watchtower.js";
const watchtower=createAuroraWatchtower(), intervals=[1,3,6,12,24];
const formatTime=value=>value?new Date(value).toLocaleString():"Not checked yet";
export default function WatchtowerPanel(){
 const [items,setItems]=useState(()=>watchtower.list()),[title,setTitle]=useState(""),[query,setQuery]=useState(""),[sourceUrl,setSourceUrl]=useState(""),[category,setCategory]=useState("announcements"),[intervalHours,setIntervalHours]=useState("6"),[approved,setApproved]=useState(false),[message,setMessage]=useState(""),[showForm,setShowForm]=useState(false);
 const refresh=()=>setItems(watchtower.list());
 useEffect(()=>{const timer=window.setInterval(refresh,30000);return()=>window.clearInterval(timer);},[]);
 const active=useMemo(()=>items.filter(item=>item.status==="active").length,[items]),due=useMemo(()=>items.filter(item=>item.due).length,[items]);
 function create(event){event.preventDefault();try{watchtower.create({title,query,sourceUrl,category,intervalHours,approved});setTitle("");setQuery("");setSourceUrl("");setApproved(false);setShowForm(false);setMessage("Monitor saved. Automatic source verification will be connected in the next stage.");refresh();}catch(error){setMessage(error.message||"Could not save monitor.");}}
 function act(action){try{action();refresh();setMessage("Watchtower updated.");}catch(error){setMessage(error.message||"Could not update Watchtower.");}}
 return <section className="watchtower-panel">
  <div className="watchtower-heading"><div><p className="watchtower-eyebrow"><RadioTower size={14}/> AURORA WATCHTOWER</p><h3>Smart monitoring</h3><p>Track announcements, important events and topics you care about.</p></div><button type="button" className="primary-action" onClick={()=>setShowForm(v=>!v)}><Plus size={15}/> Add monitor</button></div>
  <div className="watchtower-stats"><div><small>Active monitors</small><strong>{active}</strong></div><div><small>Check windows due</small><strong>{due}</strong></div><div><small>Total saved</small><strong>{items.length}</strong></div></div>
  <div className="watchtower-privacy"><ShieldCheck size={17}/><span>Monitors are saved only with your approval. A scheduled window does not mean a source was checked or an announcement confirmed.</span></div>
  {showForm&&<form className="watchtower-form" onSubmit={create}>
   <label>Monitor name<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="WAEC GCE result announcement" maxLength={120} required/></label>
   <label>Topic or phrase<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="WAEC GCE Second Series results" maxLength={500} required/></label>
   <label>Trusted source URL (optional)<input type="url" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://www.waecnigeria.org"/></label>
   <div className="watchtower-form-row"><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="announcements">Announcements</option><option value="education">Education</option><option value="news">News</option><option value="deadlines">Deadlines</option><option value="general">General</option></select></label><label>Check interval<select value={intervalHours} onChange={e=>setIntervalHours(e.target.value)}>{intervals.map(value=><option key={value} value={value}>{value} hour{value===1?"":"s"}</option>)}</select></label></div>
   <label className="watchtower-consent"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I approve saving this schedule and enabling notifications.</label>
   <div className="watchtower-form-actions"><button className="primary-action" type="submit" disabled={!approved}>Save monitor</button><button className="outline-action" type="button" onClick={()=>setShowForm(false)}>Cancel</button></div>
  </form>}
  {items.length?<div className="watchtower-list">{items.map(item=><article className="watchtower-item" key={item.id}><div className="watchtower-item-main"><div className="watchtower-item-title"><strong>{item.title}</strong><span className={"watchtower-state "+(item.status==="active"?"active":"paused")}>{item.status}</span></div><p>{item.query}</p>{item.sourceUrl&&<a href={item.sourceUrl} target="_blank" rel="noreferrer">{new URL(item.sourceUrl).hostname}</a>}<small><Clock3 size={12}/> Next scheduled window: {formatTime(item.nextCheckAt)}</small><small>Last checked: {formatTime(item.lastCheckedAt)}</small></div><div className="watchtower-item-actions"><button type="button" className="outline-action" onClick={()=>act(()=>watchtower.update(item.id,{status:item.status==="active"?"paused":"active"}))}>{item.status==="active"?<Pause size={14}/>:<Play size={14}/>} {item.status==="active"?"Pause":"Resume"}</button><button type="button" className="record-delete" aria-label={"Delete "+item.title} onClick={()=>act(()=>watchtower.remove(item.id))}><Trash2 size={15}/></button></div></article>)}</div>:<div className="watchtower-empty"><Eye size={22}/><strong>No monitors yet</strong><span>Add a topic such as WAEC results, application deadlines or important announcements.</span></div>}
  <div className="watchtower-footer"><BellRing size={14}/> Stage 1: shared monitor registry and consent controls. Automatic source checks and call delivery are later stages.</div>
  {message&&<p className="watchtower-message" role="status" aria-live="polite">{message}</p>}
 </section>;
}
