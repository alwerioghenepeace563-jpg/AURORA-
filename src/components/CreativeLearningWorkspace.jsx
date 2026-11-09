import { useEffect, useMemo, useRef, useState } from "react";
import { auroraRuntime } from "../core/aurora-runtime";
import { auroraNative, auroraApiUrl } from "../lib/aurora-native";
import { BookOpen, Captions, FolderKanban, Plus, Save, Trash2, Download, RefreshCw, Mic, Square, FileText } from "lucide-react";

const subjects=["biology","chemistry","physics","mathematics","english","computer_science","microbiology","other"];
const projectTypes=["writing","video","audio","design","research","study","other"];
function CreativeLearningWorkspace(){
 const [tab,setTab]=useState("projects"),[projects,setProjects]=useState([]),[selected,setSelected]=useState(""),[drafts,setDrafts]=useState([]),[assets,setAssets]=useState([]),[decks,setDecks]=useState([]),[plans,setPlans]=useState([]);
 const [projectTitle,setProjectTitle]=useState(""),[projectType,setProjectType]=useState("study"),[projectGoal,setProjectGoal]=useState("");
 const [draftTitle,setDraftTitle]=useState("Working draft"),[draftText,setDraftText]=useState("");
 const [subtitleFile,setSubtitleFile]=useState(null),[subtitleTitle,setSubtitleTitle]=useState("Captions");
 const [subtitleQuery,setSubtitleQuery]=useState("");
 const [deckTitle,setDeckTitle]=useState("Revision cards"),[deckSubject,setDeckSubject]=useState("biology"),[cardsText,setCardsText]=useState("What is a cell? | The basic structural and functional unit of life");
 const [quizText,setQuizText]=useState("What is the basic unit of life? | The cell\nWhat controls cell activities? | The nucleus"),[quiz,setQuiz]=useState(null),[quizAnswers,setQuizAnswers]=useState({}),[quizResult,setQuizResult]=useState(null);
 const [quizSaved,setQuizSaved]=useState(false),[quizHistory,setQuizHistory]=useState([]),[quizPerformance,setQuizPerformance]=useState({attemptCount:0,averagePercentage:0,bestPercentage:0,latestPercentage:null});
 const [dueCards,setDueCards]=useState([]),[flashSummary,setFlashSummary]=useState({totalCards:0,reviewedCards:0,dueCards:0,newCards:0});
 const [learningInsights,setLearningInsights]=useState({attempts:0,subjects:[],reviewTargets:[]});
 const [planTitle,setPlanTitle]=useState("My study plan"),[planSubject,setPlanSubject]=useState("microbiology"),[topicsText,setTopicsText]=useState("Cell theory\nCell structure\nMicroscopy");
 const [sessionMinutes,setSessionMinutes]=useState("30"),[sessionTopic,setSessionTopic]=useState({}),[sessionNote,setSessionNote]=useState("");
 const [contextPreview,setContextPreview]=useState("");
 const [transcriptTitle,setTranscriptTitle]=useState("New transcript"),[transcriptText,setTranscriptText]=useState(""),[speechListening,setSpeechListening]=useState(false);
 const speechHandles=useRef([]),browserRecognition=useRef(null);
 const [lessonPlanId,setLessonPlanId]=useState(""),[lessonTopic,setLessonTopic]=useState(""),[lessonOutput,setLessonOutput]=useState(""),[lessonBusy,setLessonBusy]=useState(false);
 const [analysisFile,setAnalysisFile]=useState(null),[analysisOutput,setAnalysisOutput]=useState(""),[analysisBusy,setAnalysisBusy]=useState(false);
 const [mediaFile,setMediaFile]=useState(null),[mediaTranscript,setMediaTranscript]=useState(""),[mediaBusy,setMediaBusy]=useState(false);
 const [mediaSearchQuery,setMediaSearchQuery]=useState(""),[mediaSearchResults,setMediaSearchResults]=useState([]),[mediaSearchBusy,setMediaSearchBusy]=useState(false),[mediaSearchSource,setMediaSearchSource]=useState(""),[mediaSearchKind,setMediaSearchKind]=useState("image");
 const [notice,setNotice]=useState("");
 const refresh=()=>{
  const ps=auroraRuntime.listCreativeProjects();setProjects(ps);setSelected(current=>ps.some(p=>p.id===current)?current:(ps[0]?.id||""));
  setDrafts(auroraRuntime.listCreativeDrafts());setAssets(auroraRuntime.listCreativeAssets());setDecks(auroraRuntime.listFlashcardDecks());setPlans(auroraRuntime.listStudyPlans());setQuizHistory(auroraRuntime.listPracticeQuizAttempts({limit:20}));setQuizPerformance(auroraRuntime.practiceQuizPerformance());setDueCards(auroraRuntime.listDueFlashcards({limit:100}));setFlashSummary(auroraRuntime.flashcardReviewSummary());setLearningInsights(auroraRuntime.getLearningInsights());
 };
 useEffect(()=>{refresh();},[]);
 useEffect(()=>()=>{try{browserRecognition.current?.stop();}catch{}if(auroraNative.isAndroid())auroraNative.stopSpeechRecognition().catch(()=>{});const handles=speechHandles.current.splice(0);handles.forEach(handle=>{try{handle.remove();}catch{}});},[]);
 const activeProject=projects.find(p=>p.id===selected);
 const projectDrafts=useMemo(()=>drafts.filter(d=>d.projectId===selected),[drafts,selected]);
 const projectAssets=useMemo(()=>assets.filter(a=>a.projectId===selected),[assets,selected]);
 const subtitleMatches=useMemo(()=>subtitleQuery.trim()?auroraRuntime.searchProjectSubtitles(subtitleQuery,{projectId:selected,limit:50}):[],[subtitleQuery,selected,assets]);
 const run=(fn,message)=>{try{const result=fn();setNotice(message);refresh();return result;}catch(error){setNotice(error?.message||"That action could not be completed.");return null;}};
 const createProject=()=>{const p=run(()=>auroraRuntime.createCreativeProject({title:projectTitle,type:projectType,goal:projectGoal,userApproved:true}),"Project saved on this device.");if(p){setProjectTitle("");setProjectGoal("");setSelected(p.id);}};
 const saveDraft=()=>{if(!selected){setNotice("Create or select a project first.");return;}run(()=>auroraRuntime.saveCreativeDraft({projectId:selected,title:draftTitle,content:draftText,userApproved:true}),"Draft saved. Previous versions are kept.");};
 const buildContext=()=>{if(!selected){setNotice("Select a project first.");return;}const pack=run(()=>auroraRuntime.buildCreativeProjectContext(selected,{maxChars:12000}),"Source-aware project context assembled from your selected project records.");if(pack)setContextPreview(pack.text);};
 const copyContext=async()=>{try{await navigator.clipboard.writeText(contextPreview);setNotice("Project context copied. Paste it into AURORA chat when you want help with this project.");}catch{setNotice("Copy is unavailable here. You can select and copy the context text manually.");}};
 const importCaptions=async()=>{if(!selected||!subtitleFile){setNotice("Select a project and an SRT or VTT file first.");return;}if(subtitleFile.size>1000000){setNotice("Subtitle file is over the 1 MB limit.");return;}try{const content=await subtitleFile.text();run(()=>auroraRuntime.importSubtitles({projectId:selected,title:subtitleTitle,sourceLabel:subtitleFile.name,content,userApproved:true}),"Captions imported. You can export them as SRT or VTT.");}catch(e){setNotice(e.message||"Subtitle import failed.");}};
 const exportCaptions=(asset)=>{try{const text=auroraRuntime.exportSubtitles(asset.id,"srt");const blob=new Blob([text],{type:"text/plain;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=(asset.title||"captions")+".srt";a.click();URL.revokeObjectURL(url);setNotice("SRT export prepared.");}catch(e){setNotice(e.message);}};
 const createDeck=()=>{const cards=cardsText.split("\n").map(line=>line.split("|")).filter(parts=>parts.length>=2).map(parts=>({question:parts[0].trim(),answer:parts.slice(1).join("|").trim()}));run(()=>auroraRuntime.createFlashcardDeck({title:deckTitle,subject:deckSubject,cards,userApproved:true}),"Flashcard deck saved.");};
 const createQuiz=()=>{const questions=quizText.split("\n").map(line=>line.split("|")).filter(parts=>parts.length>=2).map(parts=>({prompt:parts[0].trim(),answer:parts.slice(1).join("|").trim()}));const created=run(()=>auroraRuntime.buildPracticeQuiz({title:"My revision quiz",questions,userApproved:true}),"Practice quiz created.");if(created){setQuiz(created);setQuizAnswers({});setQuizResult(null);setQuizSaved(false);}};
 const submitQuiz=()=>{if(!quiz)return;const result=run(()=>auroraRuntime.gradePracticeQuiz(quiz,quizAnswers),"Quiz graded.");if(result)setQuizResult(result);};
 const saveQuizResult=()=>{if(!quiz||!quizResult||quizSaved)return;const saved=run(()=>auroraRuntime.savePracticeQuizAttempt(quiz,quizAnswers,{userApproved:true}),"Quiz result saved locally to your practice history.");if(saved){setQuizSaved(true);refresh();}};
 const createPlan=()=>{const topics=topicsText.split("\n").map(v=>v.trim()).filter(Boolean);run(()=>auroraRuntime.createStudyPlan({title:planTitle,subject:planSubject,topics,userApproved:true}),"Study plan saved. Update each topic as you progress.");};
 const generateLesson=async()=>{
  const plan=plans.find(item=>item.id===lessonPlanId)||plans[0];
  const topic=plan?.topics.find(item=>item.id===lessonTopic)||plan?.topics.find(item=>item.status!=="completed")||plan?.topics[0];
  if(!plan||!topic){setNotice("Create a study plan with at least one topic first.");return;}
  setLessonBusy(true);setNotice("AURORA is preparing a lesson. Check the explanation before relying on it.");
  try{
   const prompt="Create a clear, accurate study lesson for a learner. Subject: "+plan.subject+". Topic: "+topic.name+". Study goal: "+(plan.goal||"Understand the topic well")+". Include: learning objectives, prerequisite ideas, a step-by-step explanation, key terms, one worked or concrete example, common misconceptions, a short recap, and five practice questions with answers separated at the end. Distinguish established facts from simplifications. If uncertain, say so. Do not claim to use the learner's textbook or syllabus unless supplied.";
   const response=await fetch(auroraApiUrl("/api/chat"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:[{role:"user",content:prompt}]})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"The lesson service is unavailable.");
   if(typeof data.reply!=="string"||!data.reply.trim())throw new Error("AURORA returned an empty lesson. Try again.");
   setLessonOutput(data.reply.trim());setNotice("Lesson generated. Review and edit it; it has not been saved yet.");
  }catch(error){setNotice(error?.message||"Lesson generation failed. Your study plan remains unchanged.");}
  finally{setLessonBusy(false);}
 };
 const saveGeneratedLesson=()=>{const plan=plans.find(item=>item.id===lessonPlanId)||plans[0];const topic=plan?.topics.find(item=>item.id===lessonTopic)||plan?.topics.find(item=>item.status!=="completed")||plan?.topics[0];if(!selected){setNotice("Select a creative project in the Projects tab before saving this lesson as a draft.");return;}if(!lessonOutput.trim()){setNotice("Generate or enter lesson content first.");return;}run(()=>auroraRuntime.saveCreativeDraft({projectId:selected,title:(plan?.subject||"Study")+" — "+(topic?.name||"Lesson"),content:lessonOutput,userApproved:true}),"Lesson saved as a draft in your selected creative project.");};

 const searchMediaFallback=async()=>{
  const query=mediaSearchQuery.trim();
  if(query.length<2){setNotice("Describe the image or visual you need first.");return;}
  setMediaSearchBusy(true);setMediaSearchResults([]);setMediaSearchSource("");setNotice("Searching the web for matching media…");
  try{
   const response=await fetch(auroraApiUrl("/api/media-search?q="+encodeURIComponent(query)+"&type="+mediaSearchKind));
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Media search failed.");
   setMediaSearchResults(Array.isArray(data.results)?data.results:[]);setMediaSearchSource(data.source||"Web image search");
   setNotice(data.rightsNotice||"Review each source and its usage rights before publishing.");
  }catch(error){setNotice(error?.message||"Media search is unavailable right now.");}
  finally{setMediaSearchBusy(false);}
 };
 const openFoundMedia=async(item)=>{try{await auroraNative.openMediaSource(item.pageUrl);setNotice("Opened the original source. Use its official download option when available.");}catch(error){setNotice(error?.message||"Could not open the source page.");}};
 const downloadFoundMedia=async(item)=>{if(!item.directUrl){await openFoundMedia(item);return;}try{const result=await auroraNative.downloadPublicMedia(item.directUrl,(item.title||"aurora-media").replace(/[^a-z0-9._-]/gi,"_"),mediaSearchKind);setNotice("Download queued: "+result.filename+" · "+result.destination);}catch(error){setNotice(error?.message||"This source does not expose a direct downloadable file. Open its page and use the official download option.");}};
 const saveSearchMedia=(item)=>{
  if(!selected){setNotice("Select a project first to save a media reference.");return;}
  try{auroraRuntime.addCreativeAsset({projectId:selected,type:"image_reference",title:item.title,uri:item.pageUrl,mimeType:"image/web-search",sourceLabel:item.source||"Web image search",text:"Preview image: "+item.imageUrl+"\\nSource page: "+item.pageUrl,userApproved:true});setNotice("Media source saved to your project. Open the source page to review its licence and download options.");refresh();}
  catch(error){setNotice(error?.message||"Could not save this media reference.");}
 };
 const updateTopic=(plan,topic,status)=>run(()=>auroraRuntime.updateStudyTopic(plan.id,topic.id,status,{confirmed:true}),"Study progress updated.");
 const logSession=(plan)=>{const topicId=sessionTopic[plan.id]||plan.topics.find(t=>t.status!=="completed")?.id||plan.topics[0]?.id;const topic=plan.topics.find(t=>t.id===topicId);if(!topic){setNotice("This plan has no topics.");return;}run(()=>auroraRuntime.logStudySession({planId:plan.id,topic:topic.name,minutes:Number(sessionMinutes),note:sessionNote,userApproved:true}),"Study session saved to your local progress.");setSessionNote("");};
 const deletePlan=(plan)=>{if(window.confirm("Delete this study plan and its session history?"))run(()=>auroraRuntime.deleteStudyPlan(plan.id,{confirmed:true}),"Study plan and its session history deleted.");};
 const importMedia=async(mediaType)=>{if(!selected){setNotice("Create or select a project first.");return;}try{const picked=await auroraNative.pickMedia({mediaType});if(picked.cancelled||!picked.contentUri)return;const type=mediaType==="image"?"image_reference":mediaType==="video"?"video_reference":"audio_reference";run(()=>auroraRuntime.addCreativeAsset({projectId:selected,type,title:picked.name||("Selected "+mediaType),uri:picked.contentUri,mimeType:picked.mimeType||"",sourceLabel:picked.name||"Android media picker",userApproved:true}),"Selected media reference added to the project. Media stays in its original Android location.");}catch(e){setNotice(e?.message||"Media picker is unavailable on this device.");}};
 const importDocument=async()=>{if(!selected){setNotice("Create or select a project first.");return;}try{const picked=await auroraNative.pickDocument();if(picked.cancelled||!picked.contentUri)return;run(()=>auroraRuntime.addCreativeAsset({projectId:selected,type:"document_reference",title:picked.name||"Selected document",uri:picked.contentUri,mimeType:picked.mimeType||"",text:picked.text||"",sourceLabel:picked.name||"Android document picker",userApproved:true}),picked.textIncluded?"Selected document reference and bounded text preview added.":"Document reference added; no text preview was available.");}catch(e){setNotice(e?.message||"Document picker is unavailable on this device.");}};
 const shareAsset=async(asset)=>{if(!asset.uri||!asset.mimeType){setNotice("This reference has no shareable Android file URI or MIME type.");return;}try{const result=await auroraNative.shareSelectedFile({contentUri:asset.uri,mimeType:asset.mimeType});setNotice(result.opened&&result.requiresUserDestination?"Android share sheet opened. Choose the destination yourself.":"The Android share sheet could not be opened.");}catch(e){setNotice(e?.message||"File sharing is unavailable.");}};
 const analyseSelectedMedia=async()=>{
  if(!analysisFile){setNotice("Choose a JPEG, PNG, WebP image or PDF first.");return;}
  const isPdf=analysisFile.type==="application/pdf";
  const allowed=isPdf?analysisFile.size<=3000000:["image/jpeg","image/png","image/webp"].includes(analysisFile.type)&&analysisFile.size<=3000000;
  if(!allowed){setNotice(isPdf?"PDF must be 3 MB or smaller.":"Choose a JPEG, PNG or WebP image up to 3 MB.");return;}
  setAnalysisBusy(true);setNotice("AURORA is analysing the file you selected. Check the result before saving.");
  try{
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");reader.onerror=()=>reject(new Error("The selected file could not be read."));reader.readAsDataURL(analysisFile);});
   if(!data)throw new Error("The selected file could not be encoded.");
   const prompt="Analyse this user-selected "+(isPdf?"PDF document":"image")+". Give a source-grounded summary of what is actually visible or stated, identify important sections or objects, explain relevant concepts for study, and list uncertainties or unreadable parts. Do not invent missing text, labels or details. Clearly separate source content from your own explanation.";
   const attachment=isPdf?{document:{mimeType:analysisFile.type,data}}:{image:{mimeType:analysisFile.type,data}};
   const response=await fetch(auroraApiUrl("/api/chat"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:[{role:"user",content:prompt,...attachment}]})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||"The media analysis service is unavailable.");
   if(typeof result.reply!=="string"||!result.reply.trim())throw new Error("AURORA returned no analysis.");
   setAnalysisOutput(result.reply.trim());setNotice("Analysis ready. Review it carefully; it has not been saved yet.");
  }catch(error){setNotice(error?.message||"Media analysis failed. No project data was changed.");}
  finally{setAnalysisBusy(false);}
 };
 const saveMediaAnalysis=()=>{if(!selected){setNotice("Select a project before saving this analysis.");return;}if(!analysisOutput.trim()){setNotice("Analyse a file first.");return;}run(()=>auroraRuntime.saveCreativeDraft({projectId:selected,title:"Media analysis — "+(analysisFile?.name||"selected file"),content:analysisOutput,userApproved:true}),"Reviewed media analysis saved as a project draft.");};
 const transcribeImportedMedia=async()=>{
  if(!mediaFile){setNotice("Choose an audio or MP4 video file first.");return;}
  const supported=["audio/mpeg","audio/mp4","audio/wav","audio/webm","audio/ogg","video/mp4"];
  if(!supported.includes(mediaFile.type)||mediaFile.size>2500000){setNotice("Choose MP3, M4A/MP4 audio, WAV, WebM, OGG or MP4 video up to 2.5 MB.");return;}
  setMediaBusy(true);setNotice("AURORA is processing your selected media through its configured Gemini service. This may take a moment.");
  try{
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");reader.onerror=()=>reject(new Error("The selected media file could not be read."));reader.readAsDataURL(mediaFile);});
   if(!data)throw new Error("The selected media file could not be encoded.");
   const prompt="Transcribe the speech in this user-selected "+(mediaFile.type.startsWith("video/")?"video":"audio")+" as accurately as possible. Preserve the original language and wording. Use speaker labels only when voices are clearly distinguishable. Add timestamps when the media supports reliable timing. Mark unclear words as [unclear] instead of guessing. After the transcript, provide a separate concise summary and key points. Do not invent speech or events. Clearly state if no speech is audible or the file cannot be understood.";
   const response=await fetch(auroraApiUrl("/api/chat"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:[{role:"user",content:prompt,media:{mimeType:mediaFile.type,data}}]})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||"Audio/video transcription is unavailable. This workflow requires the configured Gemini service.");
   if(typeof result.reply!=="string"||!result.reply.trim())throw new Error("AURORA returned an empty transcript.");
   setMediaTranscript(result.reply.trim());setNotice("Transcription and summary are ready. Review and correct the result before saving.");
  }catch(error){setNotice(error?.message||"Media transcription failed. Your original file was not saved by this action.");}
  finally{setMediaBusy(false);}
 };
 const saveImportedTranscript=()=>{if(!selected){setNotice("Select a project before saving the transcript.");return;}if(!mediaTranscript.trim()){setNotice("Transcribe a media file first.");return;}run(()=>auroraRuntime.addCreativeAsset({projectId:selected,type:"transcript",title:"Transcript — "+(mediaFile?.name||"imported media"),text:mediaTranscript,sourceLabel:"User-selected audio/video; AI-generated transcript reviewed by user",userApproved:true}),"Reviewed transcript and summary saved locally to the selected project.");};


 const releaseSpeechListeners=async()=>{const handles=speechHandles.current.splice(0);for(const handle of handles){try{await handle.remove();}catch{}}};
 const stopTranscription=async()=>{try{if(browserRecognition.current){browserRecognition.current.stop();browserRecognition.current=null;}else if(auroraNative.isAndroid()){await auroraNative.stopSpeechRecognition();}}catch{}await releaseSpeechListeners();setSpeechListening(false);};
 const startTranscription=async()=>{
  if(!selected){setNotice("Create or select a project before recording a transcript.");return;}
  if(speechListening)return;
  if(auroraNative.isAndroid()){
   try{
    const permission=await auroraNative.requestMicrophonePermission();
    if(!permission?.granted){setNotice("Microphone permission was not granted. No audio was recorded.");return;}
    const resultHandle=await auroraNative.addSpeechResultListener(event=>{const phrase=String(event?.transcript||"").trim();if(phrase)setTranscriptText(current=>[current,phrase].filter(Boolean).join("\\n"));setSpeechListening(false);setNotice(phrase?"Speech recognised. Review the transcript before saving.":"No speech was recognised. Try again.");releaseSpeechListeners();});
    const errorHandle=await auroraNative.addSpeechErrorListener(event=>{setSpeechListening(false);setNotice(event?.message||"Speech recognition stopped. Check the Android speech service and try again.");releaseSpeechListeners();});
    speechHandles.current=[resultHandle,errorHandle];
    await auroraNative.startSpeechRecognition();
    setSpeechListening(true);setNotice("Listening once. Speak clearly, then review the recognised text.");
   }catch(error){await releaseSpeechListeners();setSpeechListening(false);setNotice(error?.message||"Android speech recognition could not start.");}
   return;
  }
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition){setNotice("Speech recognition is unavailable in this browser. Use the Android app or type/paste a transcript.");return;}
  try{
   const recognition=new SpeechRecognition();recognition.lang="en-GB";recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
   recognition.onresult=event=>{const phrase=String(event.results?.[0]?.[0]?.transcript||"").trim();if(phrase)setTranscriptText(current=>[current,phrase].filter(Boolean).join("\\n"));};
   recognition.onerror=event=>{setNotice("Browser speech recognition stopped ("+String(event?.error||"speech error")+"). Check microphone permission.");setSpeechListening(false);browserRecognition.current=null;};
   recognition.onend=()=>{setSpeechListening(false);browserRecognition.current=null;setNotice("Speech capture ended. Review the transcript before saving.");};
   browserRecognition.current=recognition;recognition.start();setSpeechListening(true);setNotice("Listening once. Speak clearly, then review the recognised text.");
  }catch(error){browserRecognition.current=null;setSpeechListening(false);setNotice(error?.message||"Could not start speech recognition.");}
 };
 const saveTranscript=()=>{if(!selected||!transcriptText.trim()){setNotice("Choose a project and add some transcript text first.");return;}const saved=run(()=>auroraRuntime.addCreativeAsset({projectId:selected,type:"transcript",title:transcriptTitle,text:transcriptText,sourceLabel:"User-reviewed AURORA speech recognition transcript",userApproved:true}),"Transcript saved locally to the selected project. Review it before using or sharing.");if(saved)setTranscriptText("");};

 const removeProject=(project)=>{if(window.confirm("Delete this project and its drafts and references?"))run(()=>auroraRuntime.deleteCreativeProject(project.id,{confirmed:true}),"Project deleted.");};
 return <section className="creative-learning-workspace">
  <div className="clw-heading"><div><p className="panel-eyebrow">AURORA CREATIVE + LEARNING</p><h2>Your project universe</h2><p>Keep projects, drafts, captions and revision work together on this device.</p></div><button type="button" onClick={refresh} aria-label="Refresh workspace"><RefreshCw size={16}/></button></div>
  <div className="clw-tabs">
   <button className={tab==="projects"?"active":""} onClick={()=>setTab("projects")}><FolderKanban size={15}/> Projects</button>
   <button className={tab==="captions"?"active":""} onClick={()=>setTab("captions")}><Captions size={15}/> Captions</button>
   <button className={tab==="learning"?"active":""} onClick={()=>setTab("learning")}><BookOpen size={15}/> Learning</button>
  </div>
  {notice&&<p className="clw-notice" role="status">{notice}</p>}
  {tab==="projects"&&<div className="clw-grid">
   <div className="clw-panel"><h3><Plus size={16}/> New project</h3><label>Project name<input value={projectTitle} onChange={e=>setProjectTitle(e.target.value)} placeholder="e.g. Cell biology explainer"/></label><label>Type<select value={projectType} onChange={e=>setProjectType(e.target.value)}>{projectTypes.map(v=><option key={v}>{v}</option>)}</select></label><label>Goal<textarea value={projectGoal} onChange={e=>setProjectGoal(e.target.value)} rows={2} placeholder="What are you making or learning?"/></label><button className="clw-primary" onClick={createProject} disabled={!projectTitle.trim()}><Plus size={15}/> Create project</button></div>
   <div className="clw-panel"><h3>Project library</h3>{projects.length===0?<p className="clw-empty">Your projects will appear here.</p>:projects.map(p=><div className={"clw-project "+(p.id===selected?"selected":"")} key={p.id}><button className="clw-project-pick" onClick={()=>setSelected(p.id)}><strong>{p.title}</strong><small>{p.type} · {p.status}</small></button><button className="clw-icon-button" onClick={()=>removeProject(p)} aria-label={"Delete "+p.title}><Trash2 size={15}/></button></div>)}</div>
   <div className="clw-panel clw-wide"><h3>Bring in project material</h3><p className="clw-help">Choose media or documents through Android's system picker. AURORA stores a reference, not a copy of the full media file.</p><div className="clw-media-actions"><button onClick={()=>importMedia("image")} disabled={!selected}>Import image reference</button><button onClick={()=>importMedia("video")} disabled={!selected}>Import video reference</button><button onClick={()=>importMedia("audio")} disabled={!selected}>Import audio reference</button><button onClick={importDocument} disabled={!selected}>Choose document</button></div></div>
   <div className="clw-panel clw-wide"><h3>Import audio/video transcription</h3><p className="clw-help">Select an audio file or MP4 video for batch transcription and a short summary. Upload occurs only when you press Transcribe. Supported formats: MP3, M4A/MP4 audio, WAV, WebM, OGG and MP4 video; maximum 2.5 MB. This feature requires the configured Gemini service. Review names, words and timestamps before saving.</p><label className="clw-file">Choose audio or MP4 video<input type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/ogg,video/mp4,.mp3,.m4a,.wav,.webm,.ogg,.mp4" onChange={e=>setMediaFile(e.target.files?.[0]||null)}/></label>{mediaFile&&<p className="clw-help">{mediaFile.name} · {Math.round(mediaFile.size/1024)} KB</p>}<div className="clw-actions"><button className="clw-primary" onClick={transcribeImportedMedia} disabled={!mediaFile||mediaBusy}>{mediaBusy?"Transcribing…":"Transcribe and summarise"}</button><button onClick={saveImportedTranscript} disabled={!mediaTranscript.trim()}>Save transcript to project</button></div>{mediaTranscript&&<label>Review and edit transcript and summary<textarea rows={12} value={mediaTranscript} onChange={e=>setMediaTranscript(e.target.value)}/></label>}</div>
   <div className="clw-panel clw-wide"><h3>Image and PDF understanding</h3><p className="clw-help">Choose one image or PDF and ask AURORA to analyse its visible or document content. Files are sent to the configured AURORA AI service only when you press Analyse. Images are limited to 3 MB; PDFs to 3 MB. Review results for errors before saving.</p><label className="clw-file">Choose image or PDF<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setAnalysisFile(e.target.files?.[0]||null)}/></label>{analysisFile&&<p className="clw-help">{analysisFile.name} · {Math.round(analysisFile.size/1024)} KB</p>}<div className="clw-actions"><button className="clw-primary" onClick={analyseSelectedMedia} disabled={!analysisFile||analysisBusy}>{analysisBusy?"Analysing…":"Analyse selected file"}</button><button onClick={saveMediaAnalysis} disabled={!analysisOutput.trim()}>Save analysis as draft</button></div>{analysisOutput&&<label>Review and edit analysis<textarea rows={10} value={analysisOutput} onChange={e=>setAnalysisOutput(e.target.value)}/></label>}</div>
   <div className="clw-panel clw-wide"><h3><Mic size={16}/> Speech-to-text capture</h3><p className="clw-help">Start recognition only when you tap the button. Android uses the installed speech-recognition service; supported browsers use their speech API. Results may depend on device language support and connectivity. AURORA does not save raw audio here—review the text before saving.</p><label>Transcript title<input value={transcriptTitle} onChange={e=>setTranscriptTitle(e.target.value)}/></label><label>Recognised text<textarea rows={6} value={transcriptText} onChange={e=>setTranscriptText(e.target.value)} placeholder="Your recognised words will appear here. You can also type or paste a transcript."/></label><div className="clw-media-actions"><button className="clw-primary" onClick={startTranscription} disabled={!selected||speechListening}><Mic size={14}/> Start listening</button><button onClick={stopTranscription} disabled={!speechListening}><Square size={14}/> Stop</button><button onClick={saveTranscript} disabled={!selected||!transcriptText.trim()}><FileText size={14}/> Save transcript</button></div></div>
   <div className="clw-panel clw-wide"><h3>Draft studio</h3>{!activeProject?<p className="clw-empty">Create or select a project to save drafts.</p>:<><p className="clw-context">Project: <strong>{activeProject.title}</strong></p><label>Draft title<input value={draftTitle} onChange={e=>setDraftTitle(e.target.value)}/></label><label>Your writing<textarea rows={6} value={draftText} onChange={e=>setDraftText(e.target.value)} placeholder="Paste a script, outline, notes or a draft here..."/></label><button className="clw-primary" onClick={saveDraft} disabled={!draftText.trim()}><Save size={15}/> Save draft</button><div className="clw-list">{projectDrafts.map(d=><article key={d.id}><strong>{d.title}</strong><p>{d.content.slice(0,180)}</p><small>{d.revisions.length} previous version(s)</small>{d.revisions.length>0&&<button onClick={()=>{if(window.confirm("Restore the most recently saved version of this draft? The current version will be kept in history."))run(()=>auroraRuntime.restoreCreativeDraftRevision(d.id,0,{confirmed:true}),"Previous draft version restored.");}}>Restore previous version</button>}<button onClick={()=>run(()=>auroraRuntime.saveCreativeItemToKnowledge({kind:"draft",id:d.id,userApproved:true}),"Draft added to Knowledge Universe.")}>Save to Knowledge Universe</button></article>)}</div><h3>Source-aware project context</h3><p className="clw-help">Assemble only this project’s saved drafts and selected references into a bounded, source-labelled context pack. No AI analysis or media extraction is claimed.</p><div className="clw-actions"><button onClick={buildContext}>Build project context</button>{contextPreview&&<button onClick={copyContext}>Copy context</button>}</div>{contextPreview&&<textarea className="clw-context-preview" rows={8} readOnly value={contextPreview}/>}<h3>Project references</h3>{projectAssets.map(a=><div className="clw-reference" key={a.id}>{a.title} <small>· {a.type}</small>{a.uri&&a.mimeType&&<button onClick={()=>shareAsset(a)}>Share…</button>}<button onClick={()=>run(()=>auroraRuntime.saveCreativeItemToKnowledge({kind:"asset",id:a.id,userApproved:true}),"Reference added to Knowledge Universe.")}>Save to Knowledge Universe</button></div>)}</>}</div>
  </div>}
  <div className="clw-panel clw-wide">
   <h3>AI media fallback · Search the web</h3>
   <p className="clw-help">If AI media generation is unavailable or the result is not right, describe the visual you need. AURORA searches for matching images and gives you source pages to review. It does not download or claim ownership of found media.</p>
   <label>Media type<select value={mediaSearchKind} onChange={e=>{setMediaSearchKind(e.target.value);setMediaSearchResults([]);}}><option value="image">Images</option><option value="video">Videos</option></select></label>
   <label>What media do you need?<input value={mediaSearchQuery} onChange={e=>setMediaSearchQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")searchMediaFallback();}} placeholder="e.g. labelled plant cell diagram or microscopy video"/></label>
   <button className="clw-primary" onClick={searchMediaFallback} disabled={mediaSearchBusy||mediaSearchQuery.trim().length<2}>{mediaSearchBusy?"Searching…":"Search matching media"}</button>
   {mediaSearchResults.length>0&&<><p className="clw-help">{mediaSearchResults.length} results · {mediaSearchSource}. AURORA downloads direct public media files only. For streaming or platform pages, open the source and use its official download option. Check usage rights before reuse.</p><div className="clw-media-search-grid">{mediaSearchResults.map(item=><article className="clw-media-result" key={item.id}><a href={item.pageUrl} target="_blank" rel="noreferrer"><img src={item.imageUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer"/><strong>{item.title}</strong></a><small>{item.source||"Source website"}{item.duration?" · "+item.duration:""}</small><div className="clw-actions"><button onClick={()=>downloadFoundMedia(item)}>{item.directUrl?"Download":"Open & download"}</button><button onClick={()=>saveSearchMedia(item)} disabled={!selected}>Save source</button><button onClick={()=>openFoundMedia(item)}>Open source ↗</button></div></article>)}</div></>}
  </div>
  {tab==="captions"&&<div className="clw-panel"><h3>Subtitle workshop</h3><p className="clw-help">Import an SRT or WebVTT caption file you choose. AURORA validates cue order and timing, then lets you export SRT. This does not claim to transcribe audio automatically.</p><label>Project<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a project</option>{projects.map(p=><option value={p.id} key={p.id}>{p.title}</option>)}</select></label><label>Caption title<input value={subtitleTitle} onChange={e=>setSubtitleTitle(e.target.value)}/></label><label className="clw-file">Choose subtitle file<input type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" onChange={e=>setSubtitleFile(e.target.files?.[0]||null)}/></label><button className="clw-primary" onClick={importCaptions} disabled={!subtitleFile||!selected}>Import captions</button><h3>Search inside captions</h3><label>Find a word or phrase<input value={subtitleQuery} onChange={e=>setSubtitleQuery(e.target.value)} placeholder="Search imported subtitle text"/></label>{subtitleQuery.trim()&&<div className="clw-list">{subtitleMatches.length===0?<p className="clw-empty">No matching caption cues in this project.</p>:subtitleMatches.map(match=><article className="clw-caption-hit" key={match.assetId+match.cueId}><strong>{match.title} · {match.startTime}</strong><p>{match.text}</p><small>Ends {match.endTime}</small></article>)}</div>}<div className="clw-list">{projectAssets.filter(a=>a.type==="subtitle").map(a=><article key={a.id}><strong>{a.title}</strong><p>{a.cueCount||0} subtitle cues</p><button onClick={()=>exportCaptions(a)}><Download size={14}/> Export SRT</button></article>)}</div></div>}
  {tab==="learning" && (
   <div className="clw-grid">
    <div className="clw-panel">
     <h3>Study plan</h3>
     <label>Plan title<input value={planTitle} onChange={e=>setPlanTitle(e.target.value)}/></label>
     <label>Subject<select value={planSubject} onChange={e=>setPlanSubject(e.target.value)}>{subjects.map(v=><option key={v}>{v}</option>)}</select></label>
     <label>Topics (one per line)<textarea rows={5} value={topicsText} onChange={e=>setTopicsText(e.target.value)}/></label>
     <button className="clw-primary" onClick={createPlan}><Plus size={15}/> Save study plan</button>
    </div>
    <div className="clw-panel clw-wide">
     <h3><BookOpen size={16}/> AI lesson builder</h3>
     <p className="clw-help">Generate a structured explanation for a topic in one of your saved study plans. This uses AURORA's configured chat service; check important facts against your class notes or textbook. Generated content is not saved until you choose Save as draft.</p>
     <label>Study plan<select value={lessonPlanId||plans[0]?.id||""} onChange={e=>{setLessonPlanId(e.target.value);setLessonTopic("");}}><option value="">Choose a study plan</option>{plans.map(plan=><option key={plan.id} value={plan.id}>{plan.title} · {plan.subject}</option>)}</select></label>
     <label>Topic<select value={lessonTopic} onChange={e=>setLessonTopic(e.target.value)}><option value="">Next unfinished topic</option>{(plans.find(item=>item.id===(lessonPlanId||plans[0]?.id))?.topics||[]).map(topic=><option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
     <div className="clw-actions"><button className="clw-primary" onClick={generateLesson} disabled={lessonBusy||plans.length===0}>{lessonBusy?"Preparing lesson…":"Generate lesson"}</button><button onClick={saveGeneratedLesson} disabled={!lessonOutput.trim()}>Save as draft</button></div>
     {lessonOutput&&<label>Review and edit generated lesson<textarea rows={12} value={lessonOutput} onChange={e=>setLessonOutput(e.target.value)}/></label>}
    </div>
    <div className="clw-panel">
     <h3>Practice quiz builder</h3>
     <p className="clw-help">Add one question and answer per line, separated by |.</p>
     <label>Question | answer<textarea rows={5} value={quizText} onChange={e=>setQuizText(e.target.value)}/></label>
     <button className="clw-primary" onClick={createQuiz}>Create practice quiz</button>
     {quiz && (
      <div className="clw-list">
       <strong>{quiz.title}</strong>
       {quiz.questions.map((q,index)=>(
        <label key={index}>{q.prompt}<input value={quizAnswers[index]||""} onChange={e=>setQuizAnswers(v=>({...v,[index]:e.target.value}))} placeholder="Your answer"/></label>
       ))}
       <button className="clw-primary" onClick={submitQuiz}>Grade my answers</button>
       {quizResult && (
        <div className="clw-quiz-result">
         <p>Score: {quizResult.correct}/{quizResult.total} ({quizResult.percentage}%)</p>
         <button onClick={saveQuizResult} disabled={quizSaved} className="clw-primary">{quizSaved?"Result saved":"Save result to history"}</button>
         <div className="clw-quiz-feedback">
          {quizResult.results.map(item=>(
           <p key={item.index}><strong>{item.correct?"Correct":"Review"}:</strong> {item.submitted||"No answer"} · Expected: {item.expectedAnswer}</p>
          ))}
         </div>
        </div>
       )}
      </div>
     )}
    </div>
    <div className="clw-panel clw-wide">
     <h3>Practice history</h3>
     <div className="clw-quiz-stats">
      <span>{quizPerformance.attemptCount} attempts</span><span>Average {quizPerformance.averagePercentage}%</span>
      <span>Best {quizPerformance.bestPercentage}%</span><span>Latest {quizPerformance.latestPercentage===null?"—":quizPerformance.latestPercentage+"%"}</span>
     </div>
     {quizHistory.length===0?<p className="clw-empty">Saved quiz results will appear here.</p>:quizHistory.map(attempt=>(
      <article className="clw-quiz-history" key={attempt.id}>
       <strong>{attempt.quizTitle}</strong><p>{attempt.subject||"General"} · {attempt.correct}/{attempt.total} correct · {attempt.percentage}%</p>
       <small>{new Date(attempt.createdAt).toLocaleString()}</small>
       {attempt.results.map(item=><p key={item.index}>{item.correct?"✓":"Review"} · {item.prompt} <small>Answer: {item.expectedAnswer}</small></p>)}
      </article>
     ))}
    </div>
    <div className="clw-panel clw-wide">
     <h3>Learning insights</h3>
     <p className="clw-help">AURORA looks at your saved quiz results on this device to highlight subjects and questions worth revisiting. It does not claim to understand answers beyond the quiz's exact text marking.</p>
     {learningInsights.attempts===0?<p className="clw-empty">Save a few quiz results to build your learning insights.</p>:<>
      {learningInsights.subjects.map(item=><article className="clw-quiz-history" key={item.subject}><strong>{item.subject}</strong><p>{item.averagePercentage}% average · {item.accuracy}% answer accuracy · {item.attempts} attempts</p><small>{item.recommendation}</small></article>)}
      {learningInsights.reviewTargets.length>0&&<><h4>Questions to revisit</h4>{learningInsights.reviewTargets.map((item,index)=><article className="clw-quiz-history" key={item.subject+item.prompt+index}><strong>{item.subject}: {item.prompt}</strong><p>{item.missed} missed out of {item.seen} attempts · {item.missRate}% miss rate</p></article>)}</>}
     </>}
    </div>
    <div className="clw-panel">
     <h3>Flashcard review queue</h3>
     <div className="clw-quiz-stats">
      <span>{flashSummary.totalCards} total</span><span>{flashSummary.newCards} new</span>
      <span>{flashSummary.reviewedCards} reviewed</span><span>{flashSummary.dueCards} due</span>
     </div>
     {dueCards.length===0?<p className="clw-empty">No cards are due right now. Review dates are calculated from your ratings.</p>:dueCards.map(card=>(
      <article className="clw-flashcard" key={card.deckId+card.id}>
       <strong>{card.question}</strong><p>{card.deckTitle} · {card.subject||"General"}</p><p>{card.answer}</p>
       <div>{["again","hard","good","easy"].map(rating=><button key={rating} onClick={()=>run(()=>auroraRuntime.reviewFlashcard(card.deckId,card.id,rating,{confirmed:true}),"Review rating saved and next review date scheduled.")}>{rating[0].toUpperCase()+rating.slice(1)}</button>)}</div>
      </article>
     ))}
    </div>
    <div className="clw-panel">
     <h3>Flashcards</h3>
     <label>Deck title<input value={deckTitle} onChange={e=>setDeckTitle(e.target.value)}/></label>
     <label>Subject<select value={deckSubject} onChange={e=>setDeckSubject(e.target.value)}>{subjects.map(v=><option key={v}>{v}</option>)}</select></label>
     <label>Cards (question | answer, one per line)<textarea rows={5} value={cardsText} onChange={e=>setCardsText(e.target.value)}/></label>
     <button className="clw-primary" onClick={createDeck}><Plus size={15}/> Create flashcards</button>
     <small>{decks.length} deck(s) saved</small>
     {decks.map(deck=>(
      <article key={deck.id}>
       <strong>{deck.title}</strong><p>{deck.cards.length} flashcards</p>
       {deck.cards.map(card=>(
        <div className="clw-flashcard" key={card.id}>
         <strong>{card.question}</strong><p>{card.answer}</p>
         <div><button onClick={()=>run(()=>auroraRuntime.reviewFlashcard(deck.id,card.id,"again",{confirmed:true}),"Marked for another review.")}>Again</button><button onClick={()=>run(()=>auroraRuntime.reviewFlashcard(deck.id,card.id,"good",{confirmed:true}),"Flashcard marked as understood.")}>Got it</button></div>
        </div>
       ))}
       <button onClick={()=>run(()=>auroraRuntime.saveCreativeItemToKnowledge({kind:"deck",id:deck.id,userApproved:true}),"Flashcard deck added to Knowledge Universe.")}>Save deck to Knowledge Universe</button>
      </article>
     ))}
    </div>
    <div className="clw-panel clw-wide">
     <h3>Progress tracker</h3>
     {plans.length===0?<p className="clw-empty">Your study plans will appear here.</p>:plans.map(plan=>(
      <article className="clw-plan" key={plan.id}>
       <strong>{plan.title} · {plan.subject}</strong>
       <p>{auroraRuntime.studyProgress(plan.id).completionRate}% complete · {auroraRuntime.studyProgress(plan.id).studyMinutes} study minutes · {auroraRuntime.studyProgress(plan.id).sessionCount} sessions</p>
       <label>Log a study session<select value={sessionTopic[plan.id]||plan.topics[0]?.id||""} onChange={e=>setSessionTopic(v=>({...v,[plan.id]:e.target.value}))}>{plan.topics.map(topic=><option value={topic.id} key={topic.id}>{topic.name}</option>)}</select></label>
       <label>Minutes studied<input type="number" min="1" max="600" value={sessionMinutes} onChange={e=>setSessionMinutes(e.target.value)}/></label>
       <label>Session note (optional)<input value={sessionNote} onChange={e=>setSessionNote(e.target.value)} placeholder="What did you cover?"/></label>
       <button onClick={()=>logSession(plan)} className="clw-primary">Save study session</button>
       <button onClick={()=>deletePlan(plan)}>Delete plan</button>
       <div className="clw-session-history">{auroraRuntime.listStudySessions({planId:plan.id,limit:5}).map(session=><p key={session.id}>{session.topic} · {session.minutes} min <small>{new Date(session.studiedAt).toLocaleDateString()}</small>{session.note&&<span> — {session.note}</span>}</p>)}</div>
       {plan.topics.map(topic=><label className="clw-topic" key={topic.id}>{topic.name}<select value={topic.status} onChange={e=>updateTopic(plan,topic,e.target.value)}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="needs_review">Needs review</option></select></label>)}
      </article>
     ))}
    </div>
   </div>
  )}
  <p className="clw-footnote">Saved locally. No automatic recording, media scanning or cloud upload. Saving and deleting are initiated by you.</p>
 </section>;
}
export default CreativeLearningWorkspace;
