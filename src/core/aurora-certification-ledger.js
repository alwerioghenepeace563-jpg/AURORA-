/**
 * AURORA evidence-based release certification ledger.
 * Evidence is explicit, attributable and revocable; automated checks alone
 * cannot satisfy physical-device, live-connector or human sign-off gates.
 */
const GATES = Object.freeze([
  "automated_suites",
  "web_android_build",
  "physical_device_validation",
  "live_connector_roundtrips",
  "privacy_security_signoff",
  "release_integrity_rollback"
]);
const ID = /^[a-z][a-z0-9_.-]{2,64}$/;
const MAX_EVIDENCE = 12;
const MAX_TEXT = 500;
function createAuroraCertificationLedger(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const key = "aurora-certification-evidence-v1";
  const now = options.now || (() => new Date().toISOString());
  function read() {
    try {
      const data = JSON.parse(storage?.getItem?.(key) || "{}");
      if (!data || typeof data !== "object" || Array.isArray(data)) return {};
      return Object.fromEntries(GATES.filter(g => Array.isArray(data[g])).map(g => [g, data[g].filter(x =>
        x && typeof x.evidenceRef === "string" && x.evidenceRef.length <= MAX_TEXT &&
        typeof x.reviewer === "string" && x.reviewer.length <= 120 &&
        typeof x.verifiedAt === "string" && x.verified === true
      ).slice(-MAX_EVIDENCE)]));
    } catch { return {}; }
  }
  function write(data) {
    if (!storage?.setItem) throw new Error("Certification evidence storage is unavailable.");
    storage.setItem(key, JSON.stringify(data));
  }
  function record(gate, evidence = {}) {
    if (!GATES.includes(gate)) throw new Error("Unknown certification gate.");
    if (evidence.verified !== true) throw new Error("A gate requires explicit verified sign-off.");
    const evidenceRef = String(evidence.evidenceRef || "").trim();
    const reviewer = String(evidence.reviewer || "").trim();
    if (!evidenceRef || evidenceRef.length > MAX_TEXT || !reviewer || reviewer.length > 120) {
      throw new Error("A bounded evidence reference and reviewer are required.");
    }
    if (!ID.test(String(evidence.id || ""))) throw new Error("Evidence ID is invalid.");
    const data = read();
    const entry = Object.freeze({
      id: String(evidence.id), gate, evidenceRef, reviewer,
      verified: true, verifiedAt: now()
    });
    data[gate] = [...(data[gate] || []).filter(x => x.id !== entry.id), entry].slice(-MAX_EVIDENCE);
    write(data);
    options.events?.publish?.("certification.evidence_recorded", { gate, evidenceId: entry.id }, { source: "certification_ledger" });
    return entry;
  }
  function revoke(gate, evidenceId) {
    if (!GATES.includes(gate)) throw new Error("Unknown certification gate.");
    const data = read(), before = (data[gate] || []).length;
    data[gate] = (data[gate] || []).filter(x => x.id !== String(evidenceId));
    write(data);
    return data[gate].length !== before;
  }
  function inspect() {
    const data = read();
    const gates = GATES.map(gate => Object.freeze({
      id: gate, verified: (data[gate] || []).length > 0,
      evidenceCount: (data[gate] || []).length,
      latestEvidence: (data[gate] || []).at(-1) || null
    }));
    const missing = gates.filter(g => !g.verified).map(g => g.id);
    return Object.freeze({
      gates: Object.freeze(gates), missing: Object.freeze(missing),
      readyForFinalCertification: missing.length === 0,
      finalCertification: false,
      note: "Evidence completeness is not product certification; final approval requires an authorised release decision."
    });
  }
  function requestFinalApproval(decision = {}) {
    const status = inspect();
    if (!status.readyForFinalCertification) throw new Error("Certification gates remain unverified: " + status.missing.join(", "));
    if (decision.authorisedReleaseApproval !== true || !String(decision.approver || "").trim() || !String(decision.releaseCandidate || "").trim()) {
      throw new Error("An authorised release approver and release candidate are required.");
    }
    return Object.freeze({ finalCertification: true, approver: String(decision.approver).slice(0,120), releaseCandidate: String(decision.releaseCandidate).slice(0,160), approvedAt: now() });
  }
  return Object.freeze({ record, revoke, inspect, requestFinalApproval, gates: GATES });
}
export { GATES as AURORA_CERTIFICATION_GATES, createAuroraCertificationLedger };
