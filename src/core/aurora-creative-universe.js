import { readStoredJson, isRecord, isArrayOf } from "./aurora-storage-guard.js";

const STORAGE_KEY = "aurora.creative.universe.v1";
const PROJECT_TYPES = Object.freeze(["writing","video","audio","design","research","study","other"]);
const ASSET_TYPES = Object.freeze(["text","transcript","subtitle","reference","outline","image_reference","audio_reference","video_reference","link","document_reference"]);
const isText = value => typeof value === "string";
const bounded = (value, max = 1200) => String(value ?? "").trim().slice(0, max);
const isProject = value => isRecord(value) && isText(value.id) && isText(value.title) && isText(value.type) && Array.isArray(value.assetIds) && isText(value.createdAt) && isText(value.updatedAt);
const isAsset = value => isRecord(value) && isText(value.id) && isText(value.projectId) && isText(value.type) && isText(value.title) && isText(value.createdAt);
const isDraft = value => isRecord(value) && isText(value.id) && isText(value.projectId) && isText(value.title) && isText(value.content) && Array.isArray(value.revisions) && isText(value.updatedAt);
const isDeck = value => isRecord(value) && isText(value.id) && isText(value.title) && Array.isArray(value.cards) && isText(value.createdAt);
const isQuizAttempt = value => isRecord(value) && isText(value.id) && isText(value.quizTitle) && isText(value.createdAt) && Number.isInteger(value.total) && Number.isInteger(value.correct) && Number.isInteger(value.percentage) && Array.isArray(value.results);
const validState = value => isRecord(value) && value.version === 1 && isArrayOf(value.projects, isProject) && isArrayOf(value.assets, isAsset) && isArrayOf(value.drafts, isDraft) && isArrayOf(value.decks, isDeck) && (value.quizAttempts === undefined || isArrayOf(value.quizAttempts, isQuizAttempt));

function parseTimestamp(value) {
  const match = String(value || "").match(/^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return null;
  const hours = Number(match[1]), minutes = Number(match[2]), seconds = Number(match[3]), millis = Number(match[4]);
  if (minutes > 59 || seconds > 59) return null;
  return ((hours * 3600 + minutes * 60 + seconds) * 1000) + millis;
}
function formatTimestamp(ms, separator = ",") {
  const safe = Math.max(0, Math.floor(ms));
  const hours = Math.floor(safe / 3600000), minutes = Math.floor((safe % 3600000) / 60000), seconds = Math.floor((safe % 60000) / 1000), millis = safe % 1000;
  return String(hours).padStart(2,"0")+":"+String(minutes).padStart(2,"0")+":"+String(seconds).padStart(2,"0")+separator+String(millis).padStart(3,"0");
}
function parseSubtitles(source) {
  const text = String(source || "").replace(/^\uFEFF/,"").replace(/\r/g,"").trim();
  if (!text || text.length > 1000000) throw new Error("Subtitle input must contain 1–1,000,000 characters.");
  const blocks = text.replace(/^WEBVTT[^\n]*\n/,"").split(/\n\s*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    const timeIndex = lines.findIndex(line => line.includes("-->"));
    if (timeIndex < 0) continue;
    const timing = lines[timeIndex].split("-->");
    const start = parseTimestamp(timing[0].trim().split(/\s+/)[0]);
    const end = parseTimestamp(timing[1].trim().split(/\s+/)[0]);
    const body = lines.slice(timeIndex + 1).join("\n").trim();
    if (start === null || end === null || end <= start || !body) throw new Error("A subtitle cue has invalid timestamps or empty text.");
    cues.push({ id: "cue-" + (cues.length + 1), startMs: start, endMs: end, text: body.slice(0, 2000) });
    if (cues.length > 5000) throw new Error("A subtitle file may contain at most 5,000 cues.");
  }
  if (!cues.length) throw new Error("No valid SRT or WebVTT cues were found.");
  for (let i=1;i<cues.length;i++) if (cues[i].startMs < cues[i-1].startMs) throw new Error("Subtitle cues must be in chronological order.");
  return cues;
}
function renderSubtitles(cues, format = "srt") {
  if (!Array.isArray(cues) || !cues.length) throw new Error("At least one subtitle cue is required.");
  const vtt = format.toLowerCase() === "vtt";
  if (!vtt && format.toLowerCase() !== "srt") throw new Error("Choose SRT or VTT.");
  return (vtt ? "WEBVTT\n\n" : "") + cues.map((cue,index) => (vtt ? "" : String(index+1)+"\n") + formatTimestamp(cue.startMs, vtt?".":",") + " --> " + formatTimestamp(cue.endMs, vtt?".":",") + "\n" + cue.text).join("\n\n");
}

function createAuroraCreativeUniverse(options = {}) {
  const storage = options.storage ?? globalThis.localStorage;
  const now = options.now || (() => new Date().toISOString());
  let sequence = 0;
  const createId = options.createId || (prefix => prefix + "-" + Math.random().toString(36).slice(2,10) + "-" + (++sequence));
  const read = () => {
    const state = readStoredJson(storage, STORAGE_KEY, { version:1, projects:[], assets:[], drafts:[], decks:[], quizAttempts:[] }, validState, "AURORA creative universe");
    if (!Array.isArray(state.quizAttempts)) state.quizAttempts = [];
    return state;
  };
  const write = state => { if (storage?.setItem) storage.setItem(STORAGE_KEY, JSON.stringify(state)); };
  const requireApproval = input => { if (input?.userApproved !== true) throw new Error("Explicit user approval is required."); };
  const requireConfirm = input => { if (input?.confirmed !== true) throw new Error("Explicit confirmation is required."); };

  function createProject(input = {}) {
    requireApproval(input);
    const title = bounded(input.title,100), type = bounded(input.type || "other",30).toLowerCase();
    if (!title || !PROJECT_TYPES.includes(type)) throw new Error("A project title and supported project type are required.");
    const state=read(), stamp=now();
    const project={id:createId("project"),title,type,description:bounded(input.description,500),goal:bounded(input.goal,500),status:"active",assetIds:[],createdAt:stamp,updatedAt:stamp,storage:"local"};
    state.projects.unshift(project); state.projects=state.projects.slice(0,100); write(state); return {...project};
  }
  function listProjects(filters={}) {
    const state=read();
    return state.projects.filter(p=>(!filters.type||p.type===filters.type)&&(!filters.status||p.status===filters.status)).map(p=>({...p,assetIds:[...p.assetIds]}));
  }
  function updateProject(id,patch={},options={}) {
    requireConfirm(options);
    const state=read(), project=state.projects.find(p=>p.id===id);
    if(!project) throw new Error("Project not found.");
    if(patch.title !== undefined) { const title=bounded(patch.title,100); if(!title) throw new Error("Project title cannot be empty."); project.title=title; }
    if(patch.description !== undefined) project.description=bounded(patch.description,500);
    if(patch.goal !== undefined) project.goal=bounded(patch.goal,500);
    if(patch.status !== undefined) { if(!["active","paused","completed","archived"].includes(patch.status)) throw new Error("Unsupported project status."); project.status=patch.status; }
    project.updatedAt=now(); write(state); return {...project,assetIds:[...project.assetIds]};
  }
  function deleteProject(id,options={}) {
    requireConfirm(options);
    const state=read(), exists=state.projects.some(p=>p.id===id);
    if(!exists) return false;
    state.projects=state.projects.filter(p=>p.id!==id);
    state.assets=state.assets.filter(a=>a.projectId!==id);
    state.drafts=state.drafts.filter(d=>d.projectId!==id);
    write(state); return true;
  }
  function addAsset(input={}) {
    requireApproval(input);
    const projectId=bounded(input.projectId,100), type=bounded(input.type,40).toLowerCase(), title=bounded(input.title,120);
    if(!ASSET_TYPES.includes(type)||!title) throw new Error("Choose a supported asset type and title.");
    const state=read(), project=state.projects.find(p=>p.id===projectId);
    if(!project) throw new Error("Project not found.");
    const text=bounded(input.text,20000);
    const uri=bounded(input.uri,2000);
    if(uri && !/^https?:\/\//i.test(uri) && !/^content:\/\//i.test(uri)) throw new Error("Asset references must use HTTPS or a user-selected content URI.");
    const asset={id:createId("asset"),projectId,type,title,text,uri,sourceLabel:bounded(input.sourceLabel,120),mimeType:bounded(input.mimeType,120),createdAt:now(),storage:"local"};
    state.assets.unshift(asset); state.assets=state.assets.slice(0,1000);
    project.assetIds=Array.from(new Set([...project.assetIds,asset.id])); project.updatedAt=now(); write(state); return {...asset};
  }
  function listAssets(projectId) { return read().assets.filter(a=>!projectId||a.projectId===projectId).map(a=>({...a})); }
  function saveDraft(input={}) {
    requireApproval(input);
    const projectId=bounded(input.projectId,100), title=bounded(input.title,120), content=String(input.content??"").slice(0,100000);
    if(!title||!content.trim()) throw new Error("Draft title and content are required.");
    const state=read(); if(!state.projects.some(p=>p.id===projectId)) throw new Error("Project not found.");
    const stamp=now(), existing=state.drafts.find(d=>d.id===input.id && d.projectId===projectId);
    if(existing) {
      existing.revisions.unshift({content:existing.content, savedAt:existing.updatedAt});
      existing.revisions=existing.revisions.slice(0,10); existing.title=title; existing.content=content; existing.updatedAt=stamp;
      write(state); return {...existing,revisions:[...existing.revisions]};
    }
    const draft={id:createId("draft"),projectId,title,content,revisions:[],createdAt:stamp,updatedAt:stamp};
    state.drafts.unshift(draft); state.drafts=state.drafts.slice(0,300); write(state); return {...draft};
  }
  function listDrafts(projectId) { return read().drafts.filter(d=>!projectId||d.projectId===projectId).map(d=>({...d,revisions:[...d.revisions]})); }
  function restoreDraftRevision(id, revisionIndex = 0, options = {}) {
    requireConfirm(options);
    if (!Number.isInteger(revisionIndex) || revisionIndex < 0 || revisionIndex > 9) throw new Error("Choose a valid saved revision.");
    const state = read(), draft = state.drafts.find(item => item.id === id);
    if (!draft) throw new Error("Draft not found.");
    const revision = draft.revisions[revisionIndex];
    if (!revision || !isText(revision.content)) throw new Error("Saved revision not found.");
    draft.revisions.splice(revisionIndex, 1);
    draft.revisions.unshift({ content: draft.content, savedAt: draft.updatedAt });
    draft.revisions = draft.revisions.slice(0, 10);
    draft.content = revision.content.slice(0, 100000);
    draft.updatedAt = now();
    write(state);
    return { ...draft, revisions: [...draft.revisions] };
  }
  function deleteDraft(id,options={}) { requireConfirm(options); const state=read(),before=state.drafts.length; state.drafts=state.drafts.filter(d=>d.id!==id); if(state.drafts.length===before)return false; write(state); return true; }
  function importSubtitles(input={}) {
    requireApproval(input);
    const projectId=bounded(input.projectId,100), title=bounded(input.title||"Imported subtitles",120), cues=parseSubtitles(input.content);
    const state=read(); if(!state.projects.some(p=>p.id===projectId)) throw new Error("Project not found.");
    const asset={id:createId("subtitle"),projectId,type:"subtitle",title,text:JSON.stringify(cues),uri:"",sourceLabel:bounded(input.sourceLabel||"User-provided SRT/VTT",120),createdAt:now(),storage:"local",cueCount:cues.length};
    state.assets.unshift(asset); state.assets=state.assets.slice(0,1000); const project=state.projects.find(p=>p.id===projectId); project.assetIds.push(asset.id); project.updatedAt=now(); write(state);
    return {...asset,cues};
  }
  function searchSubtitles(query, options = {}) {
    const needle = bounded(query, 200).toLocaleLowerCase();
    if (!needle) return [];
    const projectId = bounded(options.projectId, 100);
    const limit = Number.isInteger(options.limit) ? Math.max(1, Math.min(100, options.limit)) : 30;
    const state = read(), matches = [];
    for (const asset of state.assets) {
      if (asset.type !== "subtitle" || (projectId && asset.projectId !== projectId)) continue;
      let cues;
      try { cues = JSON.parse(asset.text); } catch { continue; }
      for (const cue of cues) {
        if (String(cue.text || "").toLocaleLowerCase().includes(needle)) {
          matches.push({
            assetId: asset.id, projectId: asset.projectId, title: asset.title,
            cueId: cue.id, startMs: cue.startMs, endMs: cue.endMs,
            startTime: formatTimestamp(cue.startMs, "."), endTime: formatTimestamp(cue.endMs, "."),
            text: cue.text
          });
        }
      }
    }
    return matches.sort((a,b)=>a.startMs-b.startMs).slice(0,limit);
  }
  function exportSubtitles(assetId,format="srt") {
    const asset=read().assets.find(a=>a.id===assetId&&a.type==="subtitle");
    if(!asset) throw new Error("Subtitle asset not found.");
    let cues; try{cues=JSON.parse(asset.text);}catch{throw new Error("Stored subtitle data is invalid.");}
    return renderSubtitles(cues,format);
  }
  function createDeck(input={}) {
    requireApproval(input);
    const title=bounded(input.title,100), subject=bounded(input.subject,60), cards=Array.isArray(input.cards)?input.cards.slice(0,200).map(card=>({id:createId("card"),question:bounded(card.question,500),answer:bounded(card.answer,1000)})).filter(card=>card.question&&card.answer):[];
    if(!title||!cards.length) throw new Error("A deck title and at least one complete flashcard are required.");
    const state=read(),deck={id:createId("deck"),title,subject,cards,createdAt:now(),storage:"local"};
    state.decks.unshift(deck); state.decks=state.decks.slice(0,100); write(state); return {...deck,cards:[...cards]};
  }
  function listDecks() { return read().decks.map(d=>({...d,cards:d.cards.map(c=>({...c}))})); }
  function recordCardReview(deckId,cardId,rating,options={}) {
    requireConfirm(options);
    if(!["again","hard","good","easy"].includes(rating)) throw new Error("Unsupported flashcard rating.");
    const state=read(),deck=state.decks.find(d=>d.id===deckId),card=deck?.cards.find(c=>c.id===cardId);
    if(!card) throw new Error("Flashcard not found.");
    const reviewedAt = now();
    const previousInterval = Number.isInteger(card.intervalDays) ? card.intervalDays : 0;
    const intervalDays = rating === "again" ? 1
      : rating === "hard" ? Math.max(1, Math.round(previousInterval ? previousInterval * 1.2 : 2))
      : rating === "good" ? Math.max(3, Math.round(previousInterval ? previousInterval * 2.5 : 3))
      : Math.max(7, Math.round(previousInterval ? previousInterval * 3.5 : 7));
    card.lastRating=rating; card.lastReviewedAt=reviewedAt; card.reviewCount=(card.reviewCount||0)+1;
    card.intervalDays=intervalDays;
    card.nextReviewAt=new Date(Date.parse(reviewedAt)+intervalDays*86400000).toISOString();
    write(state); return {...card};
  }
  function listDueFlashcards(options = {}) {
    const at = options.at ? Date.parse(options.at) : Date.now();
    if (!Number.isFinite(at)) throw new Error("A valid review date is required.");
    const state = read(), due = [];
    for (const deck of state.decks) for (const card of deck.cards) {
      if (card.nextReviewAt && Date.parse(card.nextReviewAt) <= at) {
        due.push({ ...card, deckId: deck.id, deckTitle: deck.title, subject: deck.subject || "" });
      }
    }
    return due.sort((a,b)=>Date.parse(a.nextReviewAt)-Date.parse(b.nextReviewAt))
      .slice(0,Math.max(1,Math.min(200,Number.isInteger(options.limit)?options.limit:100)));
  }
  function flashcardReviewSummary(options = {}) {
    const due = listDueFlashcards(options);
    const state = read(), total = state.decks.reduce((sum,deck)=>sum+deck.cards.length,0);
    const reviewed = state.decks.reduce((sum,deck)=>sum+deck.cards.filter(card=>card.lastReviewedAt).length,0);
    return { totalCards: total, reviewedCards: reviewed, dueCards: due.length, newCards: Math.max(0,total-reviewed), localOnly:true };
  }
  function buildQuiz(input={}) {
    requireApproval(input);
    const questions=Array.isArray(input.questions)?input.questions.slice(0,100).map(q=>({prompt:bounded(q.prompt,1000),answer:bounded(q.answer,1000),options:Array.isArray(q.options)?q.options.slice(0,6).map(v=>bounded(v,300)):[]})).filter(q=>q.prompt&&q.answer):[];
    if(!questions.length) throw new Error("Provide at least one question and answer.");
    return {id:createId("quiz"),title:bounded(input.title||"Practice quiz",100),subject:bounded(input.subject,60),questions,createdAt:now(),localOnly:true};
  }
  function gradeQuiz(quiz,answers={}) {
    if(!isRecord(quiz)||!Array.isArray(quiz.questions)) throw new Error("A valid quiz is required.");
    const results=quiz.questions.map((q,index)=>{const submitted=bounded(answers[index],1000);const correct=submitted.trim().toLocaleLowerCase()===q.answer.trim().toLocaleLowerCase();return {index,correct,submitted,expectedAnswer:q.answer};});
    return {total:results.length,correct:results.filter(r=>r.correct).length,percentage:results.length?Math.round(results.filter(r=>r.correct).length/results.length*100):0,results};
  }
  function saveQuizAttempt(quiz, answers = {}, options = {}) {
    requireApproval(options);
    const grade = gradeQuiz(quiz, answers);
    const state = read();
    const attempt = {
      id: createId("quiz-attempt"),
      quizId: bounded(quiz.id, 100),
      quizTitle: bounded(quiz.title || "Practice quiz", 100),
      subject: bounded(quiz.subject, 60),
      total: grade.total,
      correct: grade.correct,
      percentage: grade.percentage,
      results: grade.results.slice(0, 100).map(result => ({
        index: result.index,
        prompt: bounded(quiz.questions[result.index]?.prompt, 1000),
        submitted: bounded(result.submitted, 1000),
        correct: result.correct,
        expectedAnswer: bounded(result.expectedAnswer, 1000)
      })),
      createdAt: now(),
      storage: "local"
    };
    state.quizAttempts.unshift(attempt);
    state.quizAttempts = state.quizAttempts.slice(0, 500);
    write(state);
    return { ...attempt, results: attempt.results.map(result => ({ ...result })) };
  }
  function listQuizAttempts(filters = {}) {
    const state = read();
    const subject = bounded(filters.subject, 60).toLowerCase();
    const limit = Number.isInteger(filters.limit) ? Math.max(1, Math.min(100, filters.limit)) : 30;
    return state.quizAttempts.filter(attempt => !subject || attempt.subject.toLowerCase() === subject)
      .slice(0, limit).map(attempt => ({ ...attempt, results: attempt.results.map(result => ({ ...result })) }));
  }
  function learningInsights(filters = {}) {
    const attempts = listQuizAttempts({ subject: filters.subject, limit: 100 });
    const bySubject = new Map(), weakQuestions = new Map();
    for (const attempt of attempts) {
      const subject = attempt.subject || "General";
      const stats = bySubject.get(subject) || { subject, attempts: 0, scoreTotal: 0, questions: 0, correct: 0 };
      stats.attempts++; stats.scoreTotal += attempt.percentage; stats.questions += attempt.total; stats.correct += attempt.correct;
      bySubject.set(subject, stats);
      for (const result of attempt.results) {
        const key = subject + "::" + String(result.prompt || "").toLowerCase().trim();
        const item = weakQuestions.get(key) || { subject, prompt: result.prompt, seen: 0, missed: 0, lastSeenAt: attempt.createdAt };
        item.seen++; if (!result.correct) item.missed++;
        if (Date.parse(attempt.createdAt) > Date.parse(item.lastSeenAt)) item.lastSeenAt = attempt.createdAt;
        weakQuestions.set(key, item);
      }
    }
    const subjects = [...bySubject.values()].map(item => ({
      ...item, averagePercentage: Math.round(item.scoreTotal / item.attempts),
      accuracy: item.questions ? Math.round(item.correct / item.questions * 100) : 0,
      recommendation: item.scoreTotal / item.attempts < 60 ? "Revisit the subject fundamentals and practise a short set of questions."
        : item.scoreTotal / item.attempts < 80 ? "Review missed questions, then try another practice set."
        : "Keep the subject fresh with spaced revision."
    })).sort((a,b)=>a.averagePercentage-b.averagePercentage);
    const reviewTargets = [...weakQuestions.values()].filter(item => item.missed > 0)
      .sort((a,b)=>(b.missed/Math.max(1,b.seen))-(a.missed/Math.max(1,a.seen)) || b.missed-a.missed)
      .slice(0,10).map(item=>({...item,missRate:Math.round(item.missed/item.seen*100)}));
    return { attempts: attempts.length, subjects, reviewTargets, localOnly: true, generatedAt: now() };
  }
  function quizPerformance(filters = {}) {
    const attempts = listQuizAttempts({ subject: filters.subject, limit: 100 });
    const scores = attempts.map(attempt => attempt.percentage);
    return {
      attemptCount: attempts.length,
      averagePercentage: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
      bestPercentage: scores.length ? Math.max(...scores) : 0,
      latestPercentage: scores[0] ?? null,
      totalQuestions: attempts.reduce((sum, attempt) => sum + attempt.total, 0),
      correctAnswers: attempts.reduce((sum, attempt) => sum + attempt.correct, 0),
      localOnly: true
    };
  }
  function buildProjectContext(projectId, options = {}) {
    const state = read();
    const project = state.projects.find(item => item.id === projectId);
    if (!project) throw new Error("Project not found.");
    const maxChars = Number.isInteger(options.maxChars) ? Math.max(1000, Math.min(20000, options.maxChars)) : 12000;
    const sections = ["# AURORA project context", "Project: " + project.title, "Type: " + project.type, project.goal ? "Goal: " + project.goal : "", project.description ? "Description: " + project.description : ""].filter(Boolean);
    const sources = [];
    for (const draft of state.drafts.filter(item => item.projectId === projectId)) {
      sources.push({ label: "Draft — " + draft.title, source: "User-authored draft", content: draft.content });
    }
    for (const asset of state.assets.filter(item => item.projectId === projectId)) {
      const content = asset.text || (asset.sourceLabel ? "No text extracted. User-selected reference: " + asset.sourceLabel : "No text extracted from this reference.");
      sources.push({ label: asset.type + " — " + asset.title, source: asset.sourceLabel || "User-selected project asset", content });
    }
    let remaining = maxChars - sections.join("\n").length;
    let included = 0;
    for (const source of sources) {
      if (remaining <= 0) break;
      const section = "\n\n## " + source.label + "\nSource: " + source.source + "\n" + source.content.slice(0, Math.max(0, remaining - 20));
      if (section.length > remaining) break;
      sections.push(section); remaining -= section.length; included++;
    }
    const text = sections.join("\n").slice(0, maxChars);
    return { projectId, title: project.title, text, includedSources: included, totalSources: sources.length, truncated: included < sources.length || sections.join("\n").length > maxChars, sourceAware: true, generatedBy: "local_context_assembler", capturedAt: now() };
  }

  function search(query,limit=30) {
    const needle=String(query||"").trim().toLowerCase(); if(!needle)return [];
    const state=read(),items=[
      ...state.projects.map(x=>({...x,kind:"project",summary:x.description||x.goal})),
      ...state.drafts.map(x=>({...x,kind:"draft",summary:x.content.slice(0,240)})),
      ...state.assets.map(x=>({...x,kind:"asset",summary:x.text.slice(0,240)})),
      ...state.decks.map(x=>({...x,kind:"flashcard_deck",summary:x.cards.length+" flashcards"})),
      ...state.quizAttempts.map(x=>({...x,kind:"quiz_attempt",title:x.quizTitle,summary:x.results.map(result=>result.prompt).join(" "),subject:x.subject}))
    ];
    return items.filter(x=>(x.title+" "+(x.summary||"")+" "+(x.type||"")+" "+(x.subject||"")).toLowerCase().includes(needle)).slice(0,Math.max(1,Math.min(100,limit)));
  }
  function status() { const s=read(); return {storage:storage?"local":"unavailable",cloudSync:false,automaticCapture:false,projectCount:s.projects.length,assetCount:s.assets.length,draftCount:s.drafts.length,deckCount:s.decks.length,quizAttemptCount:s.quizAttempts.length,subtitleFormats:["srt","vtt"],limits:{projects:100,assets:1000,drafts:300,flashcardsPerDeck:200,subtitleCues:5000}}; }
  return Object.freeze({createProject,listProjects,updateProject,deleteProject,addAsset,listAssets,saveDraft,listDrafts,restoreDraftRevision,deleteDraft,importSubtitles,searchSubtitles,exportSubtitles,createDeck,listDecks,recordCardReview,listDueFlashcards,flashcardReviewSummary,buildQuiz,gradeQuiz,saveQuizAttempt,listQuizAttempts,quizPerformance,learningInsights,buildProjectContext,search,status});
}
const auroraCreativeUniverse=createAuroraCreativeUniverse();
export { createAuroraCreativeUniverse, auroraCreativeUniverse, STORAGE_KEY as AURORA_CREATIVE_UNIVERSE_STORAGE_KEY, parseSubtitles, renderSubtitles };
