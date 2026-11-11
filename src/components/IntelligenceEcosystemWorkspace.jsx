import { useMemo, useState } from "react";
import { auroraRuntime } from "../core/aurora-runtime";
import { Activity, Plug, FlaskConical, ShieldCheck, Plus, CheckCircle2, Circle, Trash2, Play, PauseCircle } from "lucide-react";

// This adapter is deliberately deterministic and side-effect free. It exercises
// the sandbox workflow without pretending to connect to a live provider/device.
try {
  auroraRuntime.experimentalIntelligence.registerAdapter("aurora.local-simulation", {
    async simulate(input) {
      return {
        executed: false,
        sideEffects: false,
        findings: [
          "Simulation completed locally for: " + input.summary,
          "No device, account, external service or production setting was changed.",
          "Review the supplied hypothesis and evidence before making any implementation decision."
        ]
      };
    }
  });
} catch {}

const GATE_LABELS = {
  automated_suites: "Automated test suites",
  web_android_build: "Web + Android build",
  physical_device_validation: "Physical-device validation",
  live_connector_roundtrips: "Live connector round-trips",
  privacy_security_signoff: "Privacy + security sign-off",
  release_integrity_rollback: "Release integrity + rollback"
};
const inputStyle = { width: "100%", minWidth: 0, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border, rgba(255,255,255,.16))", background: "var(--surface, rgba(255,255,255,.04))", color: "inherit" };
const panelStyle = { display: "grid", gap: 12, padding: 16, border: "1px solid var(--border, rgba(255,255,255,.12))", borderRadius: 16, background: "var(--surface, rgba(255,255,255,.035))" };

export default function IntelligenceEcosystemWorkspace() {
  const [tab, setTab] = useState("experiments");
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [risk, setRisk] = useState("low");
  const [reviewer, setReviewer] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [gate, setGate] = useState("automated_suites");
  const [verified, setVerified] = useState(false);
  const [manifestId, setManifestId] = useState("custom.connector");
  const [manifestName, setManifestName] = useState("");
  const [scopes, setScopes] = useState("profile.read");
  const [capabilities, setCapabilities] = useState("");
  const experiments = auroraRuntime.experimentalIntelligence;
  const connectors = auroraRuntime.connectedEcosystem;
  const ledger = auroraRuntime.certificationLedger;
  const experimentList = useMemo(() => experiments.list(), [refresh]);
  const connectorList = useMemo(() => connectors.list(), [refresh]);
  const certification = useMemo(() => ledger.inspect(), [refresh]);
  const connectorStatus = connectors.status();
  const readiness = experiments.certificationReadiness();
  const availableCapabilities = useMemo(() => auroraRuntime.actions.listCapabilities().map(x => x.id), []);

  function createExperiment(event) {
    event.preventDefault();
    try {
      const id = "experiment." + Date.now().toString(36);
      experiments.create({ id, type: "hypothesis", title, summary, risk });
      setTitle(""); setSummary(""); setNotice("Experiment created. It remains a draft until you explicitly approve simulation."); setRefresh(x => x + 1);
    } catch (error) { setNotice(error.message); }
  }
  function prepareExperiment(id) {
    try { experiments.prepare(id, { approved: true, consent: true, simulationOnly: true }); setNotice("Simulation approved. It is still isolated from real device and service actions."); setRefresh(x => x + 1); }
    catch (error) { setNotice(error.message); }
  }
  async function runExperiment(id) {
    try { await experiments.run(id); setNotice("Local simulation completed. Review the findings before drawing conclusions."); setRefresh(x => x + 1); }
    catch (error) { setNotice(error.message); }
  }
  function evaluateExperiment(item) {
    try {
      experiments.evaluate(item.id, { evaluator: "User review", criteria: [{ id: "evidence.review", title: "Findings reviewed", evidence: "Reviewed the local simulation findings in AURORA.", weight: 1, passed: true }] });
      setNotice("Evaluation saved. This is a self-review record, not independent verification."); setRefresh(x => x + 1);
    } catch (error) { setNotice(error.message); }
  }
  function previewConnector(event) {
    event.preventDefault();
    try {
      const result = connectors.preview({ id: manifestId, name: manifestName, version: "1.0", description: "User-defined connector manifest preview", scopes: scopes.split(",").map(x => x.trim()).filter(Boolean), capabilities: capabilities.split(",").map(x => x.trim()).filter(Boolean) });
      setNotice("Manifest validated for review: " + result.name + ". No account has been connected and no credentials were requested.");
    } catch (error) { setNotice(error.message); }
  }
  function saveEvidence(event) {
    event.preventDefault();
    try {
      ledger.record(gate, { id: evidenceId, evidenceRef, reviewer, verified });
      setEvidenceId(""); setEvidenceRef(""); setVerified(false); setNotice("Evidence recorded. A reviewer must verify the reference; this does not certify AURORA."); setRefresh(x => x + 1);
    } catch (error) { setNotice(error.message); }
  }

  return <section className="activity-tool-panel" style={{ display: "grid", gap: 16 }}>
    <div className="activity-panel-title"><div><h2><Activity size={20}/> Intelligence & ecosystem</h2><p>Manage approved connections, safe experiments and release evidence in one place.</p></div></div>
    <div className="activity-tabs" role="tablist" aria-label="Intelligence workspace">
      <button type="button" role="tab" aria-selected={tab === "experiments"} className={tab === "experiments" ? "activity-tab activity-tab-active" : "activity-tab"} onClick={() => setTab("experiments")}><FlaskConical size={15}/>Experiments</button>
      <button type="button" role="tab" aria-selected={tab === "connectors"} className={tab === "connectors" ? "activity-tab activity-tab-active" : "activity-tab"} onClick={() => setTab("connectors")}><Plug size={15}/>Connections</button>
      <button type="button" role="tab" aria-selected={tab === "certification"} className={tab === "certification" ? "activity-tab activity-tab-active" : "activity-tab"} onClick={() => setTab("certification")}><ShieldCheck size={15}/>Release evidence</button>
    </div>
    {notice && <div className="knowledge-message" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
    {tab === "experiments" && <>
      <div style={panelStyle}><strong>Safe experiment lab</strong><p>Simulation-only. No production changes, device actions, downloaded code or external service calls.</p>
        <form onSubmit={createExperiment} style={{ display: "grid", gap: 10 }}>
          <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Experiment title" maxLength={120} required/>
          <textarea style={inputStyle} value={summary} onChange={e => setSummary(e.target.value)} placeholder="What idea do you want to test?" maxLength={500} rows={3} required/>
          <select style={inputStyle} value={risk} onChange={e => setRisk(e.target.value)}><option value="low">Low risk</option><option value="medium">Medium risk</option><option value="high">High risk — review only</option><option value="critical">Critical — review only</option></select>
          <button className="primary-action" type="submit"><Plus size={15}/> Create experiment</button>
        </form>
      </div>
      {experimentList.length ? experimentList.map(item => <article key={item.id} style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>{item.title}</strong><span className="knowledge-record-type">{item.status} · {item.risk} risk</span></div>
        <p>{item.summary}</p>
        {item.findings?.length > 0 && <ul>{item.findings.map((finding, i) => <li key={i}>{finding}</li>)}</ul>}
        {item.evaluation && <p>Evaluation: {item.evaluation.score}% · {item.evaluation.passed ? "Passed" : "Needs review"}</p>}
        <div className="knowledge-detail-actions">
          {item.status === "draft" && <button className="outline-action" type="button" onClick={() => prepareExperiment(item.id)}><CheckCircle2 size={14}/> Approve simulation</button>}
          {item.status === "ready" && <button className="primary-action" type="button" onClick={() => runExperiment(item.id)}><Play size={14}/> Run local simulation</button>}
          {item.status === "completed" && !item.evaluation && <button className="outline-action" type="button" onClick={() => evaluateExperiment(item)}><CheckCircle2 size={14}/> Save self-review</button>}
          {["draft","ready","paused"].includes(item.status) && <button className="outline-action" type="button" onClick={() => { experiments.pause(item.id); setRefresh(x => x + 1); }}><PauseCircle size={14}/> Pause / revoke consent</button>}
          {item.evaluation && <span className="knowledge-import-meta">Regression: {experiments.regressionReport(item.id).status}</span>}
        </div>
      </article>) : <p className="activity-muted">No experiments yet. Create one to begin.</p>}
      <p className="knowledge-import-meta">{readiness.experimentCount} experiments · {readiness.completedSimulations} completed simulations · high-risk execution blocked.</p>
    </>}
    {tab === "connectors" && <>
      <div style={panelStyle}><strong>Connected services</strong><p>{connectorStatus.connected} connected · {connectorStatus.availableAdapters} live adapters available · credentials stored by AURORA: no.</p>
        {connectorList.length ? connectorList.map(item => <div key={item.id} className="activity-record"><span>{item.name}</span><span className="knowledge-record-type">{item.status}</span></div>) : <p className="activity-muted">No external accounts are connected yet. Provider-specific OAuth/API adapters must be configured before a live connection can be made.</p>}
      </div>
      <form onSubmit={previewConnector} style={panelStyle}>
        <strong>Validate a connector manifest</strong>
        <input style={inputStyle} value={manifestId} onChange={e => setManifestId(e.target.value)} placeholder="connector.id" maxLength={65} required/>
        <input style={inputStyle} value={manifestName} onChange={e => setManifestName(e.target.value)} placeholder="Service name" maxLength={100} required/>
        <input style={inputStyle} value={scopes} onChange={e => setScopes(e.target.value)} placeholder="Scopes, comma separated" required/>
        <textarea style={inputStyle} value={capabilities} onChange={e => setCapabilities(e.target.value)} placeholder="AURORA capability IDs, comma separated (optional)" rows={3}/>
        <button className="primary-action" type="submit"><CheckCircle2 size={15}/> Validate manifest</button>
        <small>Available capability IDs: {availableCapabilities.slice(0, 18).join(", ")}{availableCapabilities.length > 18 ? "…" : ""}</small>
        <small>Validation only. This does not sign in, request credentials or claim a live connection.</small>
      </form>
    </>}
    {tab === "certification" && <>
      <div style={panelStyle}><strong>Release certification gates</strong><p>{certification.gates.filter(x => x.verified).length} of {certification.gates.length} gates have evidence recorded.</p>
        {certification.gates.map(item => <div key={item.id} className="activity-record"><span>{item.verified ? <CheckCircle2 size={15}/> : <Circle size={15}/>} {GATE_LABELS[item.id]}</span><span className="knowledge-record-type">{item.evidenceCount ? item.evidenceCount + " evidence item(s)" : "Open"}</span></div>)}
        <p className="knowledge-import-meta">{certification.note} Final certification remains false until all evidence is reviewed by an authorised release approver.</p>
      </div>
      <form onSubmit={saveEvidence} style={panelStyle}>
        <strong>Record verified evidence</strong>
        <select style={inputStyle} value={gate} onChange={e => setGate(e.target.value)}>{Object.entries(GATE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <input style={inputStyle} value={evidenceId} onChange={e => setEvidenceId(e.target.value)} placeholder="Evidence ID (e.g. evidence.android-build)" required/>
        <input style={inputStyle} value={evidenceRef} onChange={e => setEvidenceRef(e.target.value)} placeholder="Evidence reference (run URL, report, device record)" maxLength={500} required/>
        <input style={inputStyle} value={reviewer} onChange={e => setReviewer(e.target.value)} placeholder="Reviewer" maxLength={120} required/>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)}/> I have personally checked this evidence and confirm it supports this gate.</label>
        <button className="primary-action" type="submit" disabled={!verified}><ShieldCheck size={15}/> Record evidence</button>
      </form>
    </>}
  </section>;
}
