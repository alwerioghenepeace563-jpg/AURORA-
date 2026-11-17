export function assessResearchEvidence(sources = []) {
  const domains = [...new Set((Array.isArray(sources) ? sources : []).map(source => String(source?.domain || "").toLowerCase()).filter(Boolean))];
  const providers = [...new Set((Array.isArray(sources) ? sources : []).map(source => String(source?.provider || "").toLowerCase()).filter(Boolean))];
  return {
    level: "discovery_only",
    independentDomainCount: domains.length,
    providerCount: providers.length,
    corroborationEstablished: false,
    conflicts: [],
    note: "Search results and snippets are discovery leads. Full-page claim verification has not been performed."
  };
}
