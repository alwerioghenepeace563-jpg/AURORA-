import { readStoredJson, isRecord, isArrayOf } from "./aurora-storage-guard.js";

const STORAGE_KEY = "aurora.learning.universe.v1";
const SUBJECTS = Object.freeze(["biology","chemistry","physics","mathematics","english","computer_science","microbiology","other"]);
const isText = value => typeof value === "string";
const isPlan = value => isRecord(value) && isText(value.id) && isText(value.title) && isText(value.subject) && Array.isArray(value.topics) && isText(value.createdAt) && isText(value.updatedAt);
const isSession = value => isRecord(value) && isText(value.id) && isText(value.planId) && isText(value.topic) && Number.isFinite(value.minutes) && isText(value.studiedAt);
const validState = value => isRecord(value) && value.version === 1 && isArrayOf(value.plans, isPlan) && isArrayOf(value.sessions, isSession);

function createAuroraLearningUniverse(options = {}) {
  const storage = options.storage ?? globalThis.localStorage;
  const now = options.now || (() => new Date().toISOString());
  const createId = options.createId || (() => "learn-" + Math.random().toString(36).slice(2, 11));
  const read = () => readStoredJson(storage, STORAGE_KEY, { version: 1, plans: [], sessions: [] }, validState, "AURORA learning universe");
  const write = state => { if (storage?.setItem) storage.setItem(STORAGE_KEY, JSON.stringify(state)); };
  const bounded = (value, max = 160) => String(value ?? "").trim().slice(0, max);

  function createPlan(input = {}) {
    if (input.userApproved !== true) throw new Error("Explicit approval is required to save a study plan.");
    const title = bounded(input.title, 100);
    const subject = bounded(input.subject, 40).toLowerCase();
    if (!title) throw new Error("A study-plan title is required.");
    if (!SUBJECTS.includes(subject)) throw new Error("Choose a supported subject.");
    const topics = [...new Set((Array.isArray(input.topics) ? input.topics : []).map(v => bounded(v, 120)).filter(Boolean))].slice(0, 40);
    if (!topics.length) throw new Error("Add at least one study topic.");
    const state = read(), timestamp = now();
    const plan = { id: createId(), title, subject, level: bounded(input.level, 60), goal: bounded(input.goal, 240), topics: topics.map((name, index) => ({ id: createId(), name, status: "not_started", order: index })), createdAt: timestamp, updatedAt: timestamp, storage: "local" };
    state.plans.unshift(plan); state.plans = state.plans.slice(0, 100); write(state);
    return plan;
  }

  function listPlans(filters = {}) {
    const state = read();
    return state.plans.filter(plan => !filters.subject || plan.subject === filters.subject).map(plan => ({ ...plan, topics: plan.topics.map(topic => ({ ...topic })) }));
  }

  function updateTopic(planId, topicId, status, options = {}) {
    if (options.confirmed !== true) throw new Error("Confirmation is required to update study progress.");
    if (!["not_started","in_progress","completed","needs_review"].includes(status)) throw new Error("Unsupported progress status.");
    const state = read(), plan = state.plans.find(item => item.id === planId);
    if (!plan) throw new Error("Study plan not found.");
    const topic = plan.topics.find(item => item.id === topicId);
    if (!topic) throw new Error("Study topic not found.");
    topic.status = status; plan.updatedAt = now(); write(state);
    return { ...plan, topics: plan.topics.map(item => ({ ...item })) };
  }

  function logPractice(input = {}) {
    if (input.userApproved !== true) throw new Error("Explicit approval is required to save a study session.");
    const planId = bounded(input.planId, 100), topic = bounded(input.topic, 120);
    const minutes = Number(input.minutes);
    if (!planId || !topic) throw new Error("Choose a study plan and topic.");
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) throw new Error("Study duration must be between 1 and 600 minutes.");
    const state = read();
    if (!state.plans.some(plan => plan.id === planId)) throw new Error("Study plan not found.");
    const session = { id: createId(), planId, topic, minutes, note: bounded(input.note, 500), studiedAt: now() };
    state.sessions.unshift(session); state.sessions = state.sessions.slice(0, 1000); write(state);
    return session;
  }

  function listSessions(filters = {}) {
    const state = read();
    const planId = filters.planId ? bounded(filters.planId, 100) : "";
    const limit = Number.isInteger(filters.limit) ? Math.max(1, Math.min(100, filters.limit)) : 30;
    return state.sessions.filter(session => !planId || session.planId === planId).slice(0, limit).map(session => ({ ...session }));
  }

  function progress(planId) {
    const state = read();
    const plans = planId ? state.plans.filter(plan => plan.id === planId) : state.plans;
    const ids = new Set(plans.map(plan => plan.id));
    const sessions = state.sessions.filter(session => ids.has(session.planId));
    const topics = plans.flatMap(plan => plan.topics);
    const completed = topics.filter(topic => topic.status === "completed").length;
    return { planCount: plans.length, topicCount: topics.length, completedTopics: completed, completionRate: topics.length ? Math.round(completed / topics.length * 100) : 0, studyMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0), sessionCount: sessions.length, needsReview: topics.filter(topic => topic.status === "needs_review").length, localOnly: true };
  }

  function removePlan(planId, options = {}) {
    if (options.confirmed !== true) throw new Error("Confirmation is required to delete a study plan.");
    const state = read(), before = state.plans.length;
    state.plans = state.plans.filter(plan => plan.id !== planId);
    if (state.plans.length === before) return false;
    state.sessions = state.sessions.filter(session => session.planId !== planId); write(state); return true;
  }

  return Object.freeze({ createPlan, listPlans, updateTopic, logPractice, listSessions, progress, removePlan, status: () => ({ storage: storage ? "local" : "unavailable", cloudSync: false, automaticCapture: false, subjects: [...SUBJECTS] }) });
}

const auroraLearningUniverse = createAuroraLearningUniverse();
export { createAuroraLearningUniverse, auroraLearningUniverse, STORAGE_KEY, SUBJECTS as AURORA_LEARNING_SUBJECTS };
