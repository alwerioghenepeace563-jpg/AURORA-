import { useEffect, useState } from "react";
import { CalendarDays, Cloud, RefreshCw, ShieldCheck, Unplug } from "lucide-react";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly"
].join(" ");

function loadGoogleIdentity() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google);
    const existing = document.querySelector('script[data-aurora-google-identity="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.auroraGoogleIdentity = "true";
    script.onload = () => window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new Error("Google Identity Services did not initialise."));
    script.onerror = () => reject(new Error("Could not load Google sign-in services."));
    document.head.appendChild(script);
  });
}

export default function GoogleWorkspaceConnector() {
  const clientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID || "";
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [files, setFiles] = useState([]);
  const [loaded, setLoaded] = useState({ calendar: false, drive: false });

  useEffect(() => () => { setToken(""); }, []);

  async function connect() {
    if (!clientId) {
      setError("Google API OAuth client ID is not configured yet. Add VITE_GOOGLE_CLIENT_ID in the deployment environment.");
      return;
    }
    setBusy("connect"); setError("");
    try {
      const google = await loadGoogleIdentity();
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        include_granted_scopes: true,
        callback: response => {
          if (response.error || !response.access_token) {
            setError(response.error_description || response.error || "Google did not grant access.");
            setBusy("");
            return;
          }
          setToken(response.access_token);
          setExpiresAt(Date.now() + Number(response.expires_in || 3600) * 1000);
          setEvents([]); setFiles([]); setLoaded({ calendar: false, drive: false });
          setBusy("");
        },
        error_callback: response => { setError(response?.message || "Google authorisation was cancelled."); setBusy(""); }
      });
      client.requestAccessToken({ prompt: "consent" });
    } catch (e) { setError(e.message || "Google connection failed."); setBusy(""); }
  }

  async function googleGet(url) {
    if (!token || Date.now() >= expiresAt) throw new Error("Google access has expired. Reconnect to continue.");
    const response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || "Google API request failed (" + response.status + ").");
    return data;
  }

  async function loadCalendar() {
    setBusy("calendar"); setError("");
    try {
      const now = new Date().toISOString();
      const data = await googleGet("https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true&timeMin=" + encodeURIComponent(now));
      setEvents(data.items || []); setLoaded(x => ({ ...x, calendar: true }));
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function loadDrive() {
    setBusy("drive"); setError("");
    try {
      const data = await googleGet("https://www.googleapis.com/drive/v3/files?pageSize=12&orderBy=modifiedTime%20desc&fields=files(id,name,mimeType,modifiedTime,webViewLink)");
      setFiles(data.files || []); setLoaded(x => ({ ...x, drive: true }));
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  function disconnect() {
    if (token && window.google?.accounts?.oauth2) {
      try { window.google.accounts.oauth2.revoke(token, () => {}); } catch {}
    }
    setToken(""); setExpiresAt(0); setEvents([]); setFiles([]);
    setLoaded({ calendar: false, drive: false }); setError("");
  }

  const connected = Boolean(token && Date.now() < expiresAt);
  return <section style={{ display: "grid", gap: 12, padding: 16, border: "1px solid var(--border, rgba(255,255,255,.12))", borderRadius: 16, background: "var(--surface, rgba(255,255,255,.035))" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div><strong>Google Workspace connections</strong><p className="knowledge-import-meta">Your existing AURORA Google sign-in stays unchanged. This separately asks for Calendar and Drive read-only access.</p></div>
      <span className="knowledge-record-type">{connected ? "Authorised" : "Not connected"}</span>
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {!connected ? <button type="button" className="primary-action" onClick={connect} disabled={Boolean(busy)}><ShieldCheck size={15}/> Authorise Calendar + Drive</button> : <button type="button" className="outline-action" onClick={disconnect}><Unplug size={15}/> Disconnect Google services</button>}
      {connected && <span className="knowledge-import-meta">Temporary access token · not saved by AURORA · expires {new Date(expiresAt).toLocaleTimeString()}</span>}
    </div>
    {error && <p role="alert" className="knowledge-message">{error}</p>}
    {connected && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
      <div className="activity-record" style={{ display: "grid", gap: 8 }}>
        <strong><CalendarDays size={15}/> Google Calendar</strong>
        <p className="knowledge-import-meta">Upcoming events · read-only</p>
        <button type="button" className="outline-action" disabled={Boolean(busy)} onClick={loadCalendar}><RefreshCw size={14}/> {busy === "calendar" ? "Loading…" : "Load upcoming events"}</button>
        {loaded.calendar && (events.length ? events.map(item => <div key={item.id}><strong>{item.summary || "Untitled event"}</strong><small>{item.start?.dateTime || item.start?.date || "Time not set"}</small></div>) : <small>No upcoming events found.</small>)}
      </div>
      <div className="activity-record" style={{ display: "grid", gap: 8 }}>
        <strong><Cloud size={15}/> Google Drive</strong>
        <p className="knowledge-import-meta">Recent file names and metadata · read-only</p>
        <button type="button" className="outline-action" disabled={Boolean(busy)} onClick={loadDrive}><RefreshCw size={14}/> {busy === "drive" ? "Loading…" : "Load recent files"}</button>
        {loaded.drive && (files.length ? files.map(file => <div key={file.id}><strong>{file.name}</strong><small>{file.mimeType} · {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : "Date unavailable"}</small>{file.webViewLink && <a href={file.webViewLink} target="_blank" rel="noreferrer">Open in Drive</a>}</div>) : <small>No Drive files returned.</small>)}
      </div>
    </div>}
    <small className="knowledge-import-meta">AURORA requests only Calendar events read-only and Drive metadata read-only. It does not send email, edit events, upload files or read file contents. Google Cloud OAuth consent-screen and authorised-origin setup are still required.</small>
  </section>;
}
