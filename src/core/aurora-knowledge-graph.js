/**
 * Local-first personal knowledge graph. Only explicitly supplied records
 * are indexed; this module never scans notifications, contacts or screens.
 */
const KEY = "aurora-knowledge-graph-v1";
const MAX_NODES = 1000;
const MAX_EDGES = 4000;
const clean = (v, n = 500) => String(v ?? "").replace(/\u0000/g, "").trim().slice(0, n);
function createAuroraKnowledgeGraph(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const id = options.createId || (() => globalThis.crypto?.randomUUID?.() || "kg-" + Date.now().toString(36) + Math.random().toString(36).slice(2));
  function read() {
    try { const x = JSON.parse(storage?.getItem(KEY) || "{}"); return { nodes: Array.isArray(x.nodes) ? x.nodes : [], edges: Array.isArray(x.edges) ? x.edges : [] }; }
    catch { return { nodes: [], edges: [] }; }
  }
  function write(data) { if (!storage?.setItem) throw new Error("Knowledge graph storage unavailable."); storage.setItem(KEY, JSON.stringify({ nodes: data.nodes.slice(-MAX_NODES), edges: data.edges.slice(-MAX_EDGES) })); }
  function addNode(input = {}) {
    const label = clean(input.label, 120), type = clean(input.type || "concept", 32).toLowerCase();
    if (!label || !/^[a-z][a-z0-9_.-]{1,31}$/.test(type)) throw new Error("A valid node label and type are required.");
    const data = read(), key = label.toLowerCase() + "|" + type;
    const existing = data.nodes.find(n => n.key === key);
    if (existing) { existing.description = clean(input.description || existing.description, 1000); existing.updatedAt = new Date().toISOString(); write(data); return existing; }
    const node = { id: clean(input.id || id(), 100), key, label, type, description: clean(input.description, 1000), tags: [...new Set((input.tags || []).map(x => clean(x, 32).toLowerCase()).filter(Boolean))].slice(0, 12), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    data.nodes.push(node); write(data); return node;
  }
  function relate(input = {}) {
    const data = read(), from = String(input.from || ""), to = String(input.to || ""), relation = clean(input.relation, 48).toLowerCase();
    if (!data.nodes.some(n => n.id === from) || !data.nodes.some(n => n.id === to) || from === to || !/^[a-z][a-z0-9_.-]{1,47}$/.test(relation)) throw new Error("Relationship endpoints and type must be valid existing nodes.");
    if (data.edges.some(e => e.from === from && e.to === to && e.relation === relation)) return data.edges.find(e => e.from === from && e.to === to && e.relation === relation);
    const edge = { id: clean(input.id || id(), 100), from, to, relation, createdAt: new Date().toISOString() };
    data.edges.push(edge); write(data); return edge;
  }
  function search(query, limit = 20) {
    const terms = clean(query, 300).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (!terms.length) return [];
    return read().nodes.map(node => {
      const hay = (node.label + " " + node.description + " " + node.tags.join(" ")).toLowerCase();
      return { ...node, score: terms.filter(t => hay.includes(t)).length / terms.length };
    }).filter(n => n.score > 0).sort((a,b) => b.score-a.score).slice(0, Math.max(1, Math.min(50, Number(limit)||20)));
  }
  function neighborhood(nodeId) {
    const data = read(), node = data.nodes.find(n => n.id === String(nodeId));
    if (!node) return null;
    const edges = data.edges.filter(e => e.from === node.id || e.to === node.id);
    const ids = new Set(edges.flatMap(e => [e.from, e.to]));
    return { node, edges, related: data.nodes.filter(n => ids.has(n.id) && n.id !== node.id) };
  }
  function removeNode(nodeId) {
    const data = read(), nodes = data.nodes.filter(n => n.id !== String(nodeId));
    if (nodes.length === data.nodes.length) return false;
    const keep = new Set(nodes.map(n => n.id)); data.nodes = nodes; data.edges = data.edges.filter(e => keep.has(e.from) && keep.has(e.to)); write(data); return true;
  }
  return Object.freeze({ addNode, relate, search, neighborhood, removeNode, list: () => read(), clear: () => storage?.removeItem?.(KEY), status: () => ({ nodeCount: read().nodes.length, edgeCount: read().edges.length, storage: "local" }) });
}
const auroraKnowledge = createAuroraKnowledgeGraph();
export { KEY as AURORA_KNOWLEDGE_STORAGE_KEY, createAuroraKnowledgeGraph, auroraKnowledge };
