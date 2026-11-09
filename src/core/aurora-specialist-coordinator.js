/**
 * Bounded specialist registry. Specialists return structured advice/proposals;
 * they never execute Android actions. Execution remains in the Action Engine.
 * Each specialist has an isolated timeout and a small circuit breaker so one
 * unstable provider cannot repeatedly stall unrelated specialist work.
 */
const SAFE_ID = /^[a-z][a-z0-9_.-]{1,47}$/;
function createAuroraSpecialistCoordinator(options = {}) {
  const specialists = new Map();
  const health = new Map();
  const maxParallel = Math.max(1, Math.min(4, Number(options.maxParallel) || 3));
  const failureThreshold = Math.max(1, Math.min(8, Number(options.failureThreshold) || 3));
  const cooldownMs = Math.max(1000, Math.min(300000, Number(options.cooldownMs) || 30000));
  const defaultTimeoutMs = Math.max(250, Math.min(30000, Number(options.timeoutMs) || 12000));
  const now = typeof options.now === "function" ? options.now : () => Date.now();

  function stateFor(id) {
    if (!health.has(id)) health.set(id, { failures: 0, openedAt: null, probeInFlight: false, lastFailureCode: null, lastSuccessAt: null });
    return health.get(id);
  }
  function register(definition = {}) {
    const id = String(definition.id || "").toLowerCase();
    if (!SAFE_ID.test(id) || typeof definition.run !== "function") throw new Error("Specialist needs a valid ID and run function.");
    if (specialists.has(id)) throw new Error("Specialist already registered: " + id);
    const timeoutMs = definition.timeoutMs == null ? defaultTimeoutMs : Math.max(250, Math.min(30000, Number(definition.timeoutMs) || defaultTimeoutMs));
    const item = Object.freeze({ id, label: String(definition.label || id).slice(0, 80), description: String(definition.description || "").slice(0, 300), matches: typeof definition.matches === "function" ? definition.matches : () => false, run: definition.run, timeoutMs });
    specialists.set(id, item);
    stateFor(id);
    return () => { const removed = specialists.delete(id); health.delete(id); return removed; };
  }
  function select(input, limit = maxParallel) {
    const text = String(input || "");
    return [...specialists.values()].map(item => {
      let match = false;
      try { match = item.matches(text) === true; } catch { /* A broken matcher cannot break selection. */ }
      return { id: item.id, label: item.label, description: item.description, matched: match };
    }).filter(x => x.matched).slice(0, Math.max(1, Math.min(maxParallel, Number(limit) || maxParallel)));
  }
  function circuitState(id) {
    const state = stateFor(id);
    if (state.openedAt == null) return "closed";
    if (now() - state.openedAt < cooldownMs) return "open";
    return state.probeInFlight ? "half_open_busy" : "half_open";
  }
  async function invoke(specialist, input, context) {
    const state = stateFor(specialist.id);
    const circuit = circuitState(specialist.id);
    if (circuit === "open" || circuit === "half_open_busy") {
      return { specialistId: specialist.id, status: "isolated", errorCode: "SPECIALIST_CIRCUIT_OPEN", retryAfterMs: Math.max(0, cooldownMs - (now() - state.openedAt)) };
    }
    const isProbe = circuit === "half_open";
    if (isProbe) state.probeInFlight = true;
    const controller = new AbortController();
    let timeoutHandle;
    try {
      const operation = Promise.resolve().then(() => specialist.run(String(input), Object.freeze({ ...context, specialistId: specialist.id, signal: controller.signal })));
      const timeout = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          controller.abort(Object.assign(new Error("Specialist deadline exceeded."), { code: "SPECIALIST_TIMEOUT" }));
          reject(Object.assign(new Error("Specialist deadline exceeded."), { code: "SPECIALIST_TIMEOUT" }));
        }, specialist.timeoutMs);
      });
      const result = await Promise.race([operation, timeout]);
      state.failures = 0;
      state.openedAt = null;
      state.lastFailureCode = null;
      state.lastSuccessAt = new Date(now()).toISOString();
      return { specialistId: specialist.id, status: "completed", result };
    } catch (error) {
      const code = typeof error?.code === "string" && /^[A-Z0-9_]{2,64}$/.test(error.code) ? error.code : "SPECIALIST_FAILED";
      state.failures += 1;
      state.lastFailureCode = code;
      if (isProbe || state.failures >= failureThreshold) state.openedAt = now();
      return { specialistId: specialist.id, status: "failed", errorCode: code, circuit: state.openedAt == null ? "closed" : "open" };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (isProbe) state.probeInFlight = false;
    }
  }
  async function coordinate(input, context = {}) {
    const selected = select(input, context.limit || maxParallel);
    const results = await Promise.all(selected.map(item => {
      const specialist = specialists.get(item.id);
      return invoke(specialist, input, context);
    }));
    return Object.freeze({ status: results.some(r => r.status === "completed") ? "completed" : selected.length ? "failed" : "no_match", selected: selected.map(x => x.id), results });
  }
  function getHealth(id) {
    const specialist = specialists.get(String(id));
    if (!specialist) return null;
    const state = stateFor(specialist.id);
    return Object.freeze({ id: specialist.id, state: circuitState(specialist.id), consecutiveFailures: state.failures, lastFailureCode: state.lastFailureCode, lastSuccessAt: state.lastSuccessAt, timeoutMs: specialist.timeoutMs });
  }
  return Object.freeze({
    register, select, coordinate,
    getHealth,
    health: () => [...specialists.keys()].map(getHealth),
    list: () => [...specialists.values()].map(({ run, matches, ...item }) => item)
  });
}
export { createAuroraSpecialistCoordinator };
