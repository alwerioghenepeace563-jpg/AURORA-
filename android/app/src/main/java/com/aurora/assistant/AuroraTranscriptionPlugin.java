package com.aurora.assistant;
import android.util.Base64;
import android.net.Uri;
import androidx.work.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.File;
import java.io.FileOutputStream;
import java.util.UUID;
import java.util.List;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "AuroraTranscription")
public class AuroraTranscriptionPlugin extends Plugin {
 private static boolean isAllowedAuroraApiHost(String host) {
  return "aurora-assistant.pages.dev".equalsIgnoreCase(host) || "aurora-ten-gold.vercel.app".equalsIgnoreCase(host);
 }
 @PluginMethod public void start(PluginCall call) {
  String title=call.getData().optString("title","Audio recording");
  IntentHelper.start(getContext(),AuroraTranscriptionService.ACTION_START,title,"Preparing transcription…",0);
  call.resolve(new JSObject().put("started",true));
 }
 @PluginMethod public void update(PluginCall call) {
  String title=call.getData().optString("title","Audio recording");
  String message=call.getData().optString("message","Transcription in progress");
  int percent=Math.max(0,Math.min(100,call.getData().optInt("percent",0)));
  IntentHelper.start(getContext(),AuroraTranscriptionService.ACTION_UPDATE,title,message,percent);
  call.resolve(new JSObject().put("updated",true));
 }
 @PluginMethod public void enqueueChunk(PluginCall call) {
  String encoded=call.getData().optString("audioBase64","");
  String requestId=call.getData().optString("requestId","");
  String endpoint=call.getData().optString("endpoint","");
  String mimeType=call.getData().optString("mimeType","audio/webm");
  String token=call.getData().optString("accessToken","");
  int chunkNumber=call.getData().optInt("chunkNumber",0), totalChunks=call.getData().optInt("totalChunks",0);
  Uri endpointUri=Uri.parse(endpoint);
  if(encoded.isEmpty()||encoded.length()>4000000||!requestId.matches("(?i)[0-9a-f-]{36}")||
    !"https".equalsIgnoreCase(endpointUri.getScheme())||!isAllowedAuroraApiHost(endpointUri.getHost())||!"/api/voicetext-transcribe".equals(endpointUri.getPath())||token.isEmpty()||chunkNumber<1||totalChunks<chunkNumber||
    !mimeType.matches("audio/[a-z0-9.+-]+")) { call.reject("A valid signed-in transcription section is required."); return; }
  File folder=new File(getContext().getFilesDir(),"aurora-transcription-queue");
  if(!folder.exists()&&!folder.mkdirs()){call.reject("Could not prepare the private transcription queue.");return;}
  File chunk=new File(folder,requestId+"-"+chunkNumber+"-"+UUID.randomUUID().toString()+".audio");
  try {
   byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);
   if(bytes.length==0||bytes.length>3000000){call.reject("This audio section is too large for the background queue.");return;}
   AuroraTranscriptionTokenStore.save(getContext(),token);
   try(FileOutputStream output=new FileOutputStream(chunk)){output.write(bytes);output.getFD().sync();}
   Data input=new Data.Builder().putString("chunk_file",chunk.getAbsolutePath()).putString("endpoint",endpoint)
    .putString("request_id",requestId).putString("mime_type",mimeType).putInt("chunk_number",chunkNumber)
    .putInt("total_chunks",totalChunks).build();
   Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
   OneTimeWorkRequest work=new OneTimeWorkRequest.Builder(AuroraTranscriptionWorker.class).setInputData(input)
    .setConstraints(constraints).addTag("aurora-transcription-"+requestId)
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,20,TimeUnit.SECONDS).build();
   String uniqueName="aurora-transcription-"+requestId+"-"+chunkNumber;
   WorkManager manager=WorkManager.getInstance(getContext());
   manager.getWorkInfosForUniqueWork(uniqueName).addListener(() -> {
    try {
     List<androidx.work.WorkInfo> existing=manager.getWorkInfosForUniqueWork(uniqueName).get();
     for(androidx.work.WorkInfo info:existing) {
      if(!info.getState().isFinished()) {
       chunk.delete();
       call.resolve(new JSObject().put("queued",true).put("alreadyQueued",true).put("workId",info.getId().toString()).put("chunkNumber",chunkNumber));
       return;
      }
     }
     Operation operation=manager.enqueueUniqueWork(uniqueName,ExistingWorkPolicy.KEEP,work);
     operation.getResult().addListener(() -> {
      try {
       List<androidx.work.WorkInfo> queued=manager.getWorkInfosForUniqueWork(uniqueName).get();
       if(queued.isEmpty()) { chunk.delete(); call.reject("Android did not create the background upload."); return; }
       androidx.work.WorkInfo actual=queued.get(0);
       if(!actual.getId().equals(work.getId())) chunk.delete();
       call.resolve(new JSObject().put("queued",true).put("workId",actual.getId().toString()).put("chunkNumber",chunkNumber));
      } catch(Exception error) { chunk.delete(); call.reject("Could not confirm the background upload.",error); }
     },Runnable::run);
    } catch(Exception error) { chunk.delete(); call.reject("Could not check for an existing background upload.",error); }
   },Runnable::run);
  } catch(Exception error) { if(chunk.exists())chunk.delete();call.reject("Could not queue this audio section for background delivery.",error); }
 }
 @PluginMethod public void stageSourcePart(PluginCall call) {
  String requestId=call.getData().optString("requestId","");
  String encoded=call.getData().optString("partBase64","");
  long offset=call.getData().optLong("offset",-1L);
  if(!requestId.matches("(?i)[0-9a-f-]{36}")||encoded.isEmpty()||encoded.length()>1100000||offset<0||offset>500L*1024*1024){
   call.reject("A valid recording section is required.");return;
  }
  try {
   byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);
   if(bytes.length==0||bytes.length>800000){call.reject("Recording transfer section is too large.");return;}
   File folder=new File(getContext().getFilesDir(),"aurora-transcription-queue");
   if(!folder.exists()&&!folder.mkdirs()){call.reject("Could not prepare private recording storage.");return;}
   File source=new File(folder,requestId+".source");
   try(java.io.RandomAccessFile output=new java.io.RandomAccessFile(source,"rw")){output.seek(offset);output.write(bytes);output.getFD().sync();}
   call.resolve(new JSObject().put("staged",true).put("bytesWritten",bytes.length).put("offset",offset));
  } catch(Exception error){call.reject("Could not stage this recording section.",error);}
 }
 @PluginMethod public void getSourceStagingStatus(PluginCall call) {
  String requestId=call.getData().optString("requestId","");
  if(!requestId.matches("(?i)[0-9a-f-]{36}")){call.reject("A valid recording ID is required.");return;}
  File folder=new File(getContext().getFilesDir(),"aurora-transcription-queue");
  File source=new File(folder,requestId+".source");
  long bytes=source.isFile()?source.length():0L;
  call.resolve(new JSObject().put("stagedBytes",bytes).put("exists",source.isFile()));
 }
 @PluginMethod public void queueSourceRecording(PluginCall call) {
  String requestId=call.getData().optString("requestId","");
  String endpoint=call.getData().optString("endpoint","");
  String token=call.getData().optString("accessToken","");
  String mimeType=call.getData().optString("mimeType","");
  long sizeBytes=call.getData().optLong("sizeBytes",0L);
  double durationSeconds=call.getData().optDouble("durationSeconds",0.0);
  int totalChunks=call.getData().optInt("totalChunks",0);
  Uri uri=Uri.parse(endpoint);
  if(!requestId.matches("(?i)[0-9a-f-]{36}")||!"https".equalsIgnoreCase(uri.getScheme())||
    !isAllowedAuroraApiHost(uri.getHost())||!"/api/voicetext-transcribe".equals(uri.getPath())||
    token.isEmpty()||!("audio/mp4".equals(mimeType)||"video/mp4".equals(mimeType))||
    sizeBytes<1||sizeBytes>500L*1024*1024||durationSeconds<=0||totalChunks<1||totalChunks>2000){
   call.reject("Native background processing currently requires an MP4/M4A recording with a valid signed-in session.");return;
  }
  File folder=new File(getContext().getFilesDir(),"aurora-transcription-queue");
  File source=new File(folder,requestId+".source");
  if(!source.isFile()||source.length()!=sizeBytes){call.reject("The complete recording has not finished transferring to private storage.");return;}
  try {
   AuroraTranscriptionTokenStore.save(getContext(),token);
   Data input=new Data.Builder().putString("source_file",source.getAbsolutePath()).putString("endpoint",endpoint)
    .putString("request_id",requestId).putInt("total_chunks",totalChunks)
    .putLong("duration_us",(long)(durationSeconds*1000000.0)).build();
   Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
   OneTimeWorkRequest work=new OneTimeWorkRequest.Builder(AuroraTranscriptionWorker.class).setInputData(input)
    .setConstraints(constraints).addTag("aurora-transcription-"+requestId)
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,20,TimeUnit.SECONDS).build();
   String uniqueName="aurora-source-"+requestId;
   WorkManager manager=WorkManager.getInstance(getContext());
   manager.getWorkInfosForUniqueWork(uniqueName).addListener(()->{
    try{
     List<androidx.work.WorkInfo> existing=manager.getWorkInfosForUniqueWork(uniqueName).get();
     for(androidx.work.WorkInfo info:existing)if(!info.getState().isFinished()){
      call.resolve(new JSObject().put("queued",true).put("workId",info.getId().toString()).put("requestId",requestId));return;
     }
     manager.enqueueUniqueWork(uniqueName,ExistingWorkPolicy.KEEP,work).getResult().addListener(()->{
      try{
       List<androidx.work.WorkInfo> queued=manager.getWorkInfosForUniqueWork(uniqueName).get();
       if(queued.isEmpty()){call.reject("Android could not start native recording processing.");return;}
       call.resolve(new JSObject().put("queued",true).put("workId",queued.get(0).getId().toString()).put("requestId",requestId));
      }catch(Exception error){call.reject("Could not confirm native recording processing.",error);}
     },Runnable::run);
    }catch(Exception error){call.reject("Could not inspect the native recording queue.",error);}
   },Runnable::run);
  }catch(Exception error){call.reject("Could not queue native recording processing.",error);}
 }
 @PluginMethod public void getSourceWorkStatus(PluginCall call) {
  String requestId=call.getData().optString("requestId","");
  if(!requestId.matches("(?i)[0-9a-f-]{36}")){call.reject("A valid job ID is required.");return;}
  WorkManager manager=WorkManager.getInstance(getContext());
  manager.getWorkInfosForUniqueWork("aurora-source-"+requestId).addListener(()->{
   try{
    List<androidx.work.WorkInfo> infos=manager.getWorkInfosForUniqueWork("aurora-source-"+requestId).get();
    if(infos.isEmpty()){call.resolve(new JSObject().put("state","MISSING").put("finished",true));return;}
    androidx.work.WorkInfo info=infos.get(0);
    call.resolve(new JSObject().put("state",info.getState().name()).put("finished",info.getState().isFinished())
     .put("successful",info.getState()==androidx.work.WorkInfo.State.SUCCEEDED)
     .put("failed",info.getState()==androidx.work.WorkInfo.State.FAILED||info.getState()==androidx.work.WorkInfo.State.CANCELLED)
     .put("completedChunks",info.getProgress().getInt("completed_chunks",info.getOutputData().getInt("completed_chunks",0)))
     .put("reason",info.getOutputData().getString("reason")));
   }catch(Exception error){call.reject("Could not read native recording progress.",error);}
  },Runnable::run);
 }
 @PluginMethod public void cancelJob(PluginCall call) {
  String requestId=call.getData().optString("requestId","");
  if(!requestId.matches("(?i)[0-9a-f-]{36}")){call.reject("A valid job ID is required.");return;}
  WorkManager.getInstance(getContext()).cancelAllWorkByTag("aurora-transcription-"+requestId);
  File folder=new File(getContext().getFilesDir(),"aurora-transcription-queue");
  File[] pending=folder.listFiles(new java.io.FilenameFilter(){ public boolean accept(File dir,String name){ return name.startsWith(requestId+"-")&&name.endsWith(".audio"); }});
  if(pending!=null) for(File file:pending) file.delete();
  new File(folder,requestId+".source").delete();
  call.resolve(new JSObject().put("cancelled",true));
 }
 @PluginMethod public void getWorkStatus(PluginCall call) {
  String workId=call.getData().optString("workId","");
  try {
   UUID id=UUID.fromString(workId);
   WorkManager.getInstance(getContext()).getWorkInfoById(id).addListener(() -> {
    try {
     androidx.work.WorkInfo info=WorkManager.getInstance(getContext()).getWorkInfoById(id).get();
     if(info==null){call.resolve(new JSObject().put("state","MISSING").put("finished",true));return;}
     call.resolve(new JSObject().put("state",info.getState().name()).put("finished",info.getState().isFinished())
      .put("successful",info.getState()==androidx.work.WorkInfo.State.SUCCEEDED)
      .put("failed",info.getState()==androidx.work.WorkInfo.State.FAILED||info.getState()==androidx.work.WorkInfo.State.CANCELLED));
    } catch(Exception error){call.reject("Could not read background transcription status.",error);}
   }, Runnable::run);
  } catch(Exception error){call.reject("A valid background work ID is required.",error);}
 }
 @PluginMethod public void clearSession(PluginCall call) {
  AuroraTranscriptionTokenStore.clear(getContext());call.resolve(new JSObject().put("cleared",true));
 }
 @PluginMethod public void stop(PluginCall call) {
  IntentHelper.start(getContext(),AuroraTranscriptionService.ACTION_STOP,"","",0);call.resolve(new JSObject().put("stopped",true));
 }
}
