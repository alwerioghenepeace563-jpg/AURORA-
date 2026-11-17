export function assessResearchEvidence(sources = []) {
  const safeSources = Array.isArray(sources) ? sources : [];
  const domains = [...new Set(safeSources.map(source => String(source?.domain || "").toLowerCase().replace(/^www\./, "")).filter(Boolean))];
  const providers = [...new Set(safeSources.map(source => String(source?.provider || "").toLowerCase()).filter(Boolean))];
  const sourceCount = safeSources.length;
  const diversityLevel = domains.length >= 3 && providers.length >= 2
    ? "multi_source_discovery"
    : domains.length >= 2
      ? "cross_source_discovery"
      : "single_source_discovery";
  return {
    level: "discovery_only",
    diversityLevel,
    sourceCount,
    independentDomainCount: domains.length,
    providerCount: providers.length,
    corroborationEstablished: false,
    conflicts: [],
    note: "Source diversity helps prioritize follow-up, but search snippets are not independent claim verification. Open and compare original sources before treating a claim as corroborated."
  };
}
