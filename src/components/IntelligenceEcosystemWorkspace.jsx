import { useEffect, useMemo, useState } from "react";
import { auroraRuntime } from "../core/aurora-runtime";
import { auroraEvents } from "../core/aurora-event-bus";
import GoogleWorkspaceConnector from "./GoogleWorkspaceConnector";
import { Activity, Plug, FlaskConical, ShieldCheck, Plus, CheckCircle2, Circle, Trash2, Play, PauseCircle, Bluetooth, Smartphone, Radio, Link2 } from "lucide-react";

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
  const [proposalFor, setProposalFor] = useState("");
  const [proposalSummary, setProposalSummary] = useState("");
  const [proposalScope, setProposalScope] = useState("");
  const [proposalEvidence, setProposalEvidence] = useState("");
  const [promotionReviewer, setPromotionReviewer] = useState("");
  const [cloudConsent, setCloudConsent] = useState(false);
  const [cloudConnecting, setCloudConnecting] = useState(false);
  const [nearbyScanning, setNearbyScanning] = useState(false);
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const [nearbyEndpoints, setNearbyEndpoints] = useState([]);
  const [nearbyRequests, setNearbyRequests] = useState([]);
  const [nearbyReadyPeers, setNearbyReadyPeers] = useState([]);
  const [pairConsent, setPairConsent] = useState(false);
  const [handoffConsent, setHandoffConsent] = useState(false);
  const [handoffDeviceId, setHandoffDeviceId] = useState("");
  const [handoffTitle, setHandoffTitle] = useState("");
  const [handoffSourceId, setHandoffSourceId] = useState("");
  const nearby = auroraRuntime.nearbyDeviceTransport;
  const experiments = auroraRuntime.experimentalIntelligence;
  const connectors = auroraRuntime.connectedEcosystem;
  const ledger = auroraRuntime.certificationLedger;
  const experimentList = useMemo(() => experiments.list(), [refresh]);
  const connectorList = useMemo(() => connectors.list(), [refresh]);
  const certification = useMemo(() => ledger.inspect(), [refresh]);
  const connectorStatus = connectors.status();
  const readiness = experiments.certificationReadiness();
  const availableCapabilities = useMemo(() => auroraRuntime.actions.listCapabilities().map(x => x.id), []);
  const trustedDevices = useMemo(() => auroraRuntime.deviceContinuity.list(), [refresh]);

  useEffect(() => auroraEvents.subscribe("device.nearby.*", event => {
    const item = event.payload || {};
    if (event.type === "device.nearby.endpoint.found") {
      setNearbyEndpoints(current => [...current.filter(x => x.endpointId !== item.endpointId), item]);
    } else if (event.type === "device.nearby.endpoint.lost") {
      setNearbyEndpoints(current => current.filter(x => x.endpointId !== item.endpointId));
    } else if (event.type === "device.nearby.connection.request") {
      setNearbyRequests(current => [...current.filter(x => x.endpointId !== item.endpointId), item]);
    } else if (event.type === "device.nearby.peer.ready") {
      setNearbyReadyPeers(current => [...current.filter(x => x.endpointId !== item.endpointId), item]);
    } else if (event.type === "device.nearby.peer.authenticated") {
      setNearbyReadyPeers(current => current.map(peer => peer.deviceId === item.deviceId ? { ...peer, authenticated: true } : peer));
    } else if (event.type === "device.nearby.peer.disconnected") {
      setNearbyReadyPeers(current => current.filter(x => x.deviceId !== item.deviceId));
    } else if (event.type === "device.nearby.connection.failed") {
      setNotice("The nearby connection could not be established. Check both phones and try again.");
    } else if (event.type === "device.nearby.transport.error") {
      setNotice("Nearby connection notice: " + String(item.code || "transport error"));
    } else if (event.type === "device.nearby.session.paused") {
      setNearbyScanning(false);
      setNearbyReadyPeers([]);
      setNearbyRequests([]);
      setNotice("AURORA moved to the background, so nearby discovery and connections were stopped. Start discovery again when the app is open.");
    } else if (event.type === "device.nearby.payload.received") {
      setNotice("Received a device handoff reference from " + String(item.name || "a trusted device") + ". Review it before opening anything.");
    }
    setRefresh(value => value + 1);
  }), []);

  async function startNearbyDiscovery() {
    if (nearbyBusy) return;
    setNearbyBusy(true);
    try {
      const result = await nearby.start();
      setNearbyScanning(result.started);
      setNotice(result.started ? "AURORA is advertising and discovering nearby devices. Keep this screen open while pairing." : "Nearby discovery did not start on both channels.");
    } catch (error) { setNotice(error.message || "Nearby discovery could not start."); }
    finally { setNearbyBusy(false); }
  }
  async function stopNearbyDiscovery() {
    try { await nearby.stop(); setNearbyScanning(false); setNotice("Nearby discovery stopped. Existing trusted-device records remain saved."); }
    catch (error) { setNotice(error.message || "Nearby discovery could not stop."); }
  }
  async function requestNearbyConnection(endpointId) {
    try { await nearby.requestConnection(endpointId); setNotice("Connection requested. Compare the authentication code shown on both phones before accepting."); }
    catch (error) { setNotice(error.message || "Connection request failed."); }
  }
  async function approveNearbyConnection(request) {
    try {
      await nearby.approveConnection(request.endpointId, true);
      setNearbyRequests(current => current.filter(item => item.endpointId !== request.endpointId));
      setNotice("Connection approval sent. AURORA is checking the other device's identity key.");
    } catch (error) { setNotice(error.message || "Connection approval failed."); }
  }
  async function rejectNearbyConnection(request) {
    try {
      await nearby.rejectConnection(request.endpointId);
      setNearbyRequests(current => current.filter(item => item.endpointId !== request.endpointId));
      setNotice("Nearby connection rejected.");
    } catch (error) { setNotice(error.message || "Could not reject the connection."); }
  }
  async function trustNearbyPeer(peer) {
    if (!pairConsent || nearbyBusy) return;
    setNearbyBusy(true);
    try {
      const trusted = await nearby.pair(peer.endpointId, { approved: true, consent: true });
      setPairConsent(false);
      setNotice("Trusted device saved: " + trusted.name + ". The private identity key remains protected by Android Keystore.");
      setRefresh(value => value + 1);
    } catch (error) { setNotice(error.message || "Device identity verification failed."); }
    finally { setNearbyBusy(false); }
  }
  async function revokeNearbyDevice(device) {
    try {
      await nearby.revoke(device.id);
      setNotice("Local trust removed for " + device.name + " and any active connection closed. Remove its trust separately on the other phone too.");
      setRefresh(value => value + 1);
    } catch (error) { setNotice(error.message || "Device revocation failed."); }
  }
  async function sendNearbyReference(event) {
    event.preventDefault();
    if (!handoffConsent || !handoffDeviceId) return;
    try {
      await nearby.handoff(handoffDeviceId, {
        type: "knowledge_reference",
        sourceId: handoffSourceId.trim(),
        title: handoffTitle.trim()
      }, { approved: true, consent: true });
      setHandoffConsent(false);
      setHandoffTitle("");
      setHandoffSourceId("");
      setNotice("Knowledge reference delivered over the encrypted nearby connection. The receiving phone must review it before opening.");
    } catch (error) { setNotice(error.message || "The reference could not be delivered."); }
  }

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
  function createPromotionProposal(event, item) {
    event.preventDefault();
    try {
      experiments.proposePromotion(item.id, { id: "proposal." + Date.now().toString(36), summary: proposalSummary, changeScope: proposalScope, testEvidence: proposalEvidence });
      setProposalSummary(""); setProposalScope(""); setProposalEvidence(""); setProposalFor("");
      setNotice("Proposal submitted for human review. No production code, model or capability has changed."); setRefresh(x => x + 1);
    } catch (error) { setNotice(error.message); }
  }
  function reviewPromotion(item, proposal, outcome) {
    try {
      experiments.reviewPromotion(item.id, proposal.id, { reviewer: promotionReviewer, outcome });
      setNotice(outcome === "rejected" ? "Proposal rejected. Production remains unchanged." : "Approved for a separate implementation review only. Nothing has been merged or activated."); setRefresh(x => x + 1);
    } catch (error) { setNotice(error.message); }
  }
  async function connectAuroraCloud() {
    if (!cloudConsent || cloudConnecting) return;
    setCloudConnecting(true);
    try {
      auroraRuntime.consents.grant({
        scope: "memory.cloud_sync",
        source: "supabase",
        purpose: "Allow only individually selected AURORA memories to sync to the signed-in AURORA cloud account."
      });
      await connectors.connect({
        id: "aurora.supabase",
        name: "AURORA Cloud Sync",
        version: "1.0",
        description: "Consent-gated, per-record memory sync",
        scopes: ["memory.cloud_sync"],
        capabilities: []
      }, { approved: true, consent: true });
      setCloudConsent(false);
      setNotice("AURORA Cloud is connected. No memories were uploaded; you can sync individual records when you choose.");
      setRefresh(x => x + 1);
    } catch (error) {
      auroraRuntime.consents.revoke("memory.cloud_sync", "supabase");
      setNotice(error.message || "AURORA Cloud could not connect.");
    } finally { setCloudConnecting(false); }
  }
  async function disconnectAuroraCloud() {
    try {
      await connectors.disconnect("aurora.supabase");
      setNotice("AURORA Cloud disconnected. Memory cloud sync is disabled; local memories remain on this device.");
      setRefresh(x => x + 1);
    } catch (error) { setNotice(error.message || "AURORA Cloud could not disconnect."); }
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
      <button type="button" role="tab" aria-selected={tab === "devices"} className={tab === "devices" ? "activity-tab activity-tab-active" : "activity-tab"} onClick={() => setTab("devices")}><Bluetooth size={15}/>Devices</button>
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
        {item.evaluation?.passed && <div style={panelStyle}>
          <strong>Implementation review proposals</strong>
          <p className="knowledge-import-meta">A passing simulation can propose work for a separate review. Approval here never changes production.</p>
          {(item.promotionProposals || []).map(proposal => <div key={proposal.id} className="activity-record" style={{ display: "grid", gap: 6 }}>
            <strong>{proposal.summary}</strong>
            <span className="knowledge-record-type">{proposal.status.replaceAll("_", " ")}</span>
            <small>Scope: {proposal.changeScope}</small><small>Test evidence: {proposal.testEvidence}</small>
            {proposal.status === "awaiting_review" && <div className="knowledge-detail-actions">
              <button type="button" className="primary-action" disabled={!promotionReviewer.trim()} onClick={() => reviewPromotion(item, proposal, "approved_for_implementation_review")}>Approve review</button>
              <button type="button" className="outline-action" disabled={!promotionReviewer.trim()} onClick={() => reviewPromotion(item, proposal, "rejected")}>Reject</button>
            </div>}
            {proposal.reviewer && <small>Reviewed by {proposal.reviewer} · {proposal.reviewedAt}</small>}
          </div>)}
          {(item.promotionProposals || []).some(proposal => proposal.status === "awaiting_review") && <input style={inputStyle} value={promotionReviewer} onChange={e => setPromotionReviewer(e.target.value)} placeholder="Reviewer name for proposal decisions" maxLength={120}/>}
          {proposalFor === item.id ? <form onSubmit={event => createPromotionProposal(event, item)} style={{ display: "grid", gap: 8 }}>
            <input style={inputStyle} value={proposalSummary} onChange={e => setProposalSummary(e.target.value)} placeholder="Proposal summary" maxLength={500} required/>
            <textarea style={inputStyle} value={proposalScope} onChange={e => setProposalScope(e.target.value)} placeholder="Exact implementation scope" maxLength={500} rows={2} required/>
            <input style={inputStyle} value={proposalEvidence} onChange={e => setProposalEvidence(e.target.value)} placeholder="Test/evidence reference" maxLength={500} required/>
            <div className="knowledge-detail-actions"><button type="submit" className="primary-action">Submit for review</button><button type="button" className="outline-action" onClick={() => setProposalFor("")}>Cancel</button></div>
          </form> : <button type="button" className="outline-action" onClick={() => setProposalFor(item.id)}>Propose implementation review</button>}
        </div>}
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
        {connectorList.length ? connectorList.map(item => <div key={item.id} className="activity-record"><span>{item.name}</span><span className="knowledge-record-type">{item.status}</span></div>) : <p className="activity-muted">No accounts connected yet. AURORA Cloud Sync is ready to connect below.</p>}
        {connectorList.some(item => item.id === "aurora.supabase" && item.status === "connected") ? <button type="button" className="outline-action" onClick={disconnectAuroraCloud}>Disconnect AURORA Cloud</button> : <div style={{ display: "grid", gap: 10 }}>
          <strong>AURORA Cloud Sync</strong>
          <p className="knowledge-import-meta">Uses the existing signed-in AURORA account. Only memories you individually choose to sync can be uploaded. Connecting does not bulk-upload anything. Your local memories remain available if disconnected.</p>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><input type="checkbox" checked={cloudConsent} onChange={e => setCloudConsent(e.target.checked)}/> I consent to enable per-record cloud sync for memories I explicitly select.</label>
          <button type="button" className="primary-action" disabled={!cloudConsent || cloudConnecting} onClick={connectAuroraCloud}>{cloudConnecting ? "Connecting…" : "Connect AURORA Cloud"}</button>
        </div>}
        <GoogleWorkspaceConnector />
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
    {tab === "devices" && <>
      <div style={panelStyle}>
        <strong><Bluetooth size={16}/> Trusted Android devices</strong>
        <p className="knowledge-import-meta">Nearby Connections uses Bluetooth and Wi-Fi to find AURORA devices without requiring internet. Both phones must approve the same authentication code. Pairing is available in the Android app only.</p>
        {!nearby.isAvailable() ? <p className="activity-muted">Open this workspace inside the AURORA Android app to use nearby pairing.</p> : <>
          <div className="knowledge-detail-actions">
            <button type="button" className="primary-action" disabled={nearbyBusy || nearbyScanning} onClick={startNearbyDiscovery}><Radio size={15}/>{nearbyBusy ? "Starting…" : "Find nearby devices"}</button>
            <button type="button" className="outline-action" disabled={!nearbyScanning} onClick={stopNearbyDiscovery}>Stop discovery</button>
          </div>
          <p className="knowledge-import-meta">{nearbyScanning ? "Discovery is active. Keep AURORA open on both phones." : "Discovery is stopped."}</p>
        </>}
      </div>
      {nearbyEndpoints.length > 0 && <div style={panelStyle}>
        <strong>Nearby AURORA devices</strong>
        {nearbyEndpoints.map(item => <div key={item.endpointId} className="activity-record">
          <span><Smartphone size={15}/> {item.name}</span>
          <button type="button" className="outline-action" onClick={() => requestNearbyConnection(item.endpointId)}>Connect</button>
        </div>)}
      </div>}
      {nearbyRequests.length > 0 && <div style={panelStyle}>
        <strong>Connection approval</strong>
        {nearbyRequests.map(item => <div key={item.endpointId} style={{ display: "grid", gap: 8 }}>
          <strong>{item.name} is requesting a connection</strong>
          <p className="knowledge-import-meta">Compare this code with the other phone. Only approve if both screens show exactly the same code.</p>
          <div style={{ fontSize: 28, letterSpacing: 5, fontWeight: 800, textAlign: "center", padding: 14, borderRadius: 12, background: "var(--surface, rgba(255,255,255,.05))" }}>{item.authenticationDigits}</div>
          <div className="knowledge-detail-actions">
            <button type="button" className="primary-action" onClick={() => approveNearbyConnection(item)}>The codes match — approve</button>
            <button type="button" className="outline-action" onClick={() => rejectNearbyConnection(item)}>Reject</button>
          </div>
        </div>)}
      </div>}
      {nearbyReadyPeers.length > 0 && <div style={panelStyle}>
        <strong>Connected devices awaiting trust</strong>
        {nearbyReadyPeers.map(peer => <div key={peer.endpointId} style={{ display: "grid", gap: 8 }}>
          <span><Smartphone size={15}/> {peer.name || "Android device"}</span>
          <small className="knowledge-import-meta">Fingerprint: {peer.publicKeyFingerprint || "Verifying…"}</small>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="checkbox" checked={pairConsent} onChange={e => setPairConsent(e.target.checked)}/> I approve pairing this device and saving its public-key fingerprint as trusted on this phone.</label>
          <button type="button" className="primary-action" disabled={!pairConsent || nearbyBusy} onClick={() => trustNearbyPeer(peer)}>{nearbyBusy ? "Verifying…" : "Verify identity and trust device"}</button>
        </div>)}
      </div>}
      <div style={panelStyle}>
        <strong>Trusted devices ({trustedDevices.length})</strong>
        {trustedDevices.length ? trustedDevices.map(device => <div key={device.id} className="activity-record" style={{ display: "grid", gap: 6 }}>
          <strong>{device.name}</strong>
          <small>{device.platform} · {device.trust}</small>
          <small className="knowledge-import-meta">{device.publicKeyFingerprint}</small>
          <button type="button" className="outline-action" onClick={() => revokeNearbyDevice(device)}>Revoke trust</button>
        </div>) : <p className="activity-muted">No trusted devices yet.</p>}
      </div>
      {trustedDevices.length > 0 && <form onSubmit={sendNearbyReference} style={panelStyle}>
        <strong><Link2 size={16}/> Send a knowledge reference</strong>
        <p className="knowledge-import-meta">This sends a reference ID and title, not the contents of your private files or notes. The receiving device should review it before opening.</p>
        <select style={inputStyle} value={handoffDeviceId} onChange={e => setHandoffDeviceId(e.target.value)} required>
          <option value="">Choose a trusted device</option>
          {trustedDevices.map(device => <option key={device.id} value={device.id}>{device.name}{nearbyReadyPeers.some(peer => peer.deviceId === device.id && peer.authenticated) ? " · connected" : " · offline"}</option>)}
        </select>
        <input style={inputStyle} value={handoffTitle} onChange={e => setHandoffTitle(e.target.value)} placeholder="Reference title" maxLength={120} required/>
        <input style={inputStyle} value={handoffSourceId} onChange={e => setHandoffSourceId(e.target.value)} placeholder="Saved knowledge reference ID" maxLength={120} required/>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="checkbox" checked={handoffConsent} onChange={e => setHandoffConsent(e.target.checked)}/> I reviewed this reference and approve sending it to the selected trusted device.</label>
        <small className="knowledge-import-meta">The destination must be connected and identity-authenticated. Pairing and handoff are foreground-only; AURORA does not scan in the background.</small>
        <button type="submit" className="primary-action" disabled={!handoffConsent || !handoffDeviceId || !nearbyReadyPeers.some(peer => peer.deviceId === handoffDeviceId && peer.authenticated)}>Send approved reference</button>
      </form>}
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
