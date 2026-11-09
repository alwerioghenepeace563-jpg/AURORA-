import { useMemo, useState } from "react";
import { auroraRuntime } from "../core/aurora-runtime";
import { auroraNative as AuroraNative } from "../lib/aurora-native";
import { BookOpen, Search, Plus, Pencil, Trash2, Link2, Clock3, X, Check, RefreshCw } from "lucide-react";

const TYPES = ["all", "note", "document", "project", "task", "conversation", "website", "recording", "image", "event"];

export default function KnowledgeUniverseWorkspace() {
  const [records, setRecords] = useState(() => auroraRuntime.knowledgeTimeline({ limit: 100 }));
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmAction, setConfirmAction] = useState("");
  const [related, setRelated] = useState([]);
  const [message, setMessage] = useState("");
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [importDescription, setImportDescription] = useState("");

  const visible = useMemo(() => {
    const filters = type === "all" ? {} : { types: [type] };
    return query.trim()
      ? auroraRuntime.searchKnowledge(query.trim(), { ...filters, limit: 50 })
      : auroraRuntime.knowledgeTimeline({ ...(type === "all" ? {} : { type }), limit: 100 });
  }, [query, type, records]);

  const selected = records.find(item => item.id === selectedId) || null;
  function refresh(nextId = selectedId) {
    const next = auroraRuntime.knowledgeTimeline({ limit: 100 });
    setRecords(next);
    setSelectedId(nextId && next.some(item => item.id === nextId) ? nextId : "");
    setRelated([]);
  }
  async function chooseImport() {
    if (!AuroraNative.isAndroid()) { setMessage("File import is available in the Android app. You can still add notes here."); return; }
    setPickerBusy(true); setMessage("");
    try {
      const result = await AuroraNative.pickDocument();
      if (result?.cancelled) { setMessage("Import cancelled. No knowledge record was created."); return; }
      const mime = String(result?.mimeType || "application/octet-stream").toLowerCase();
      const sourceType = mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "recording" : "document";
      const text = result?.textIncluded ? String(result.text || "").slice(0, 12000) : "";
      setPendingImport({ type: sourceType, title: String(result?.name || "Selected source"), uri: result?.contentUri || "", mimeType: mime, content: text, capturedAt: new Date().toISOString() });
      setImportDescription("");
      setMessage(text ? "Review the selected text before saving it to your local Knowledge Universe." : "Selected file metadata only. Add your own description; AURORA has not analysed or copied the file.");
    } catch (error) { setMessage(error.message || "Could not open the Android file picker."); }
    finally { setPickerBusy(false); }
  }
  function saveImportedSource() {
    if (!pendingImport) return;
    const content = pendingImport.content || importDescription.trim();
    if (!content) { setMessage("Add a short description before saving this selected source."); return; }
    try {
      const result = auroraRuntime.addKnowledgeSource({ type: pendingImport.type, title: pendingImport.title, content, uri: pendingImport.uri, sourceLabel: pendingImport.title, capturedAt: pendingImport.capturedAt, sourceMethod: "android_document_picker_user_confirmed", userApproved: true });
      setPendingImport(null); setImportDescription(""); setMessage(result.duplicate ? "That source is already saved." : "Selected source saved locally with provenance."); refresh(result.record.id);
    } catch (error) { setMessage(error.message || "Could not save the selected source."); }
  }
  function saveNote(event) {
    event.preventDefault();
    if (!draftTitle.trim() || !draftContent.trim()) return;
    try {
      const result = auroraRuntime.addKnowledgeSource({
        type: "note", title: draftTitle, content: draftContent,
        sourceLabel: "AURORA Knowledge Workspace", sourceMethod: "explicit_workspace_save",
        userApproved: true
      });
      setMessage(result.duplicate ? "That note is already saved." : "Saved locally to your Knowledge Universe.");
      setDraftTitle(""); setDraftContent(""); setAdding(false); refresh(result.record.id);
    } catch (error) { setMessage(error.message || "Could not save this note."); }
  }
  function beginEdit(item) {
    setEditTitle(item.title); setEditContent(item.content); setEditing(true); setConfirmAction("");
  }
  function saveEdit() {
    if (!selected || !editTitle.trim() || !editContent.trim()) return;
    try {
      auroraRuntime.correctKnowledge(selected.id, { title: editTitle, content: editContent }, { confirmed: true });
      setEditing(false); setConfirmAction(""); setMessage("Correction saved. Previous revisions remain in the record history."); refresh(selected.id);
    } catch (error) { setMessage(error.message || "Could not update this source."); }
  }
  function deleteSelected() {
    if (!selected) return;
    try {
      auroraRuntime.forgetKnowledge(selected.id, { confirmed: true });
      setMessage("Source deleted from this device's Knowledge Universe.");
      setConfirmAction(""); setEditing(false); refresh("");
    } catch (error) { setMessage(error.message || "Could not delete this source."); }
  }
  function showRelated(item) {
    const result = auroraRuntime.relatedKnowledge(item.id);
    setRelated(result?.related || []); setSelectedId(item.id);
  }

  return <section className="knowledge-workspace">
    <div className="knowledge-workspace-head">
      <div><p className="panel-eyebrow">PERSONAL KNOWLEDGE</p><h2><BookOpen size={22}/> Knowledge Universe</h2><p>Browse, search and manage sources you explicitly save. Stored locally on this device.</p></div>
      <div className="knowledge-head-actions"><button type="button" className="outline-action" onClick={chooseImport} disabled={pickerBusy}><BookOpen size={15}/>{pickerBusy ? "Opening picker…" : "Import source"}</button><button type="button" className="primary-action" onClick={() => { setAdding(v => !v); setEditing(false); setMessage(""); }}><Plus size={16}/> Add note</button></div>
    </div>
    <div className="knowledge-privacy-line"><span/> Local storage · No automatic capture · No cloud sync</div>
    {message && <div className="knowledge-message" role="status">{message}<button type="button" onClick={() => setMessage("")} aria-label="Dismiss"><X size={14}/></button></div>}
    {pendingImport && <div className="knowledge-editor"><strong>Review selected source</strong><p className="knowledge-import-meta">{pendingImport.title} · {pendingImport.mimeType} · {pendingImport.type}</p>{pendingImport.content ? <label>Selected text preview<textarea value={pendingImport.content} readOnly rows={7}/></label> : <label>Your description<textarea value={importDescription} onChange={e=>setImportDescription(e.target.value)} maxLength={12000} rows={5} placeholder="Describe what this file contains. AURORA has not analysed the binary file."/></label>}<p className="knowledge-import-meta">Nothing is saved until you confirm. The original file is not uploaded or copied into the knowledge index.</p><div className="knowledge-editor-actions"><button type="button" className="primary-action" onClick={saveImportedSource}><Check size={15}/> Confirm and save locally</button><button type="button" className="outline-action" onClick={()=>{setPendingImport(null);setImportDescription("");setMessage("Import discarded. No knowledge record was created.");}}>Cancel import</button></div></div>}
    {adding && <form className="knowledge-editor" onSubmit={saveNote}>
      <label>Note title<input value={draftTitle} onChange={e=>setDraftTitle(e.target.value)} maxLength={160} placeholder="Give this source a title" required/></label>
      <label>Content<textarea value={draftContent} onChange={e=>setDraftContent(e.target.value)} maxLength={12000} rows={5} placeholder="Write the information you want AURORA to remember..." required/></label>
      <div className="knowledge-editor-actions"><button className="primary-action" type="submit"><Check size={15}/> Save locally</button><button type="button" className="outline-action" onClick={()=>{setAdding(false);setDraftTitle("");setDraftContent("");}}>Cancel</button></div>
    </form>}
    <div className="knowledge-browser">
      <div className="knowledge-list-column">
        <div className="knowledge-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your saved knowledge..."/><button type="button" onClick={()=>refresh()} aria-label="Refresh knowledge"><RefreshCw size={15}/></button></div>
        <div className="knowledge-type-filter"><select value={type} onChange={e=>setType(e.target.value)} aria-label="Filter by source type">{TYPES.map(item=><option key={item} value={item}>{item==="all"?"All source types":item[0].toUpperCase()+item.slice(1)}</option>)}</select><span>{visible.length} sources</span></div>
        <div className="knowledge-record-list">{visible.length ? visible.map(item=><button type="button" key={item.id} className={"knowledge-record-item "+(selectedId===item.id?"is-selected":"")} onClick={()=>{setSelectedId(item.id);setEditing(false);setRelated([]);setConfirmAction("");}}><span className="knowledge-record-type">{item.type}</span><strong>{item.title}</strong><small>{item.summary || item.content.slice(0,110)}</small><time>{new Date(item.updatedAt).toLocaleDateString()}</time></button>) : <p className="activity-muted">No matching sources yet. Save a note or import supported content when available.</p>}</div>
      </div>
      <div className="knowledge-detail-column">
        {selected ? <article className="knowledge-detail">
          <div className="knowledge-detail-top"><span className="knowledge-record-type">{selected.type}</span><span><Clock3 size={13}/> {new Date(selected.updatedAt).toLocaleString()}</span></div>
          {editing ? <div className="knowledge-editor"><label>Title<input value={editTitle} onChange={e=>setEditTitle(e.target.value)} maxLength={160}/></label><label>Content<textarea value={editContent} onChange={e=>setEditContent(e.target.value)} maxLength={12000} rows={9}/></label><div className="knowledge-editor-actions"><button type="button" className="primary-action" onClick={()=>setConfirmAction("edit")}><Check size={15}/> Review correction</button><button type="button" className="outline-action" onClick={()=>setEditing(false)}>Cancel</button></div></div> : <>
            <h3>{selected.title}</h3><p className="knowledge-detail-content">{selected.content}</p>
            <div className="knowledge-provenance"><strong>Source provenance</strong><span>{selected.source?.label || "User saved"}</span><span>Method: {selected.source?.method || "Not recorded"}</span><span>Captured: {selected.source?.capturedAt ? new Date(selected.source.capturedAt).toLocaleString() : "Unknown"}</span>{selected.source?.uri && <a href={selected.source.uri} target="_blank" rel="noreferrer">Open original source</a>}</div>
            {selected.revisions?.length>0 && <small className="knowledge-revision-note">{selected.revisions.length} previous revision(s) retained.</small>}
            <div className="knowledge-detail-actions"><button type="button" className="outline-action" onClick={()=>beginEdit(selected)}><Pencil size={14}/> Edit</button><button type="button" className="outline-action" onClick={()=>showRelated(selected)}><Link2 size={14}/> Related</button><button type="button" className="outline-action danger-action" onClick={()=>setConfirmAction("delete")}><Trash2 size={14}/> Delete</button></div>
          </>}
          {confirmAction && <div className="knowledge-confirm" role="alert"><strong>{confirmAction==="delete"?"Delete this saved source?":"Save this correction?"}</strong><p>{confirmAction==="delete"?"This removes the local record and its relationship links.":"This replaces the current title and content while retaining a bounded revision history."}</p><button type="button" className="primary-action" onClick={confirmAction==="delete"?deleteSelected:saveEdit}>Confirm</button><button type="button" className="outline-action" onClick={()=>setConfirmAction("")}>Keep as is</button></div>}
          {related.length>0 && <div className="knowledge-related"><strong>Related sources</strong>{related.map(item=><button type="button" key={item.id} onClick={()=>{setSelectedId(item.id);setRelated([]);}}>{item.title} <span>{item.type}</span></button>)}</div>}
        </article> : <div className="knowledge-empty"><BookOpen size={30}/><strong>Select a saved source</strong><span>Its content, provenance, revision history and related records will appear here.</span></div>}
      </div>
    </div>
  </section>;
}
