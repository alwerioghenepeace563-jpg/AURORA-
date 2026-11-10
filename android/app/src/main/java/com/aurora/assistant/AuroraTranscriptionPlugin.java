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
    !"https".equalsIgnoreCase(endpointUri.getScheme())||!"aurora-ten-gold.vercel.app".equalsIgnoreCase(endpointUri.getHost())||!"/api/voicetext-transcribe".equals(endpointUri.getPath())||token.isEmpty()||chunkNumber<1||totalChunks<chunkNumber||
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
 @PluginMethod public void cancelJob(PluginCall call) {
  String requestId=call.getData().optString("requestId","");
  if(!requestId.matches("(?i)[0-9a-f-]{36}")){call.reject("A valid job ID is required.");return;}
  WorkManager.getInstance(getContext()).cancelAllWorkByTag("aurora-transcription-"+requestId);
  File folder=new File(getContext().getFilesDir(),"aurora-transcription-queue");
  File[] pending=folder.listFiles(new java.io.FilenameFilter(){ public boolean accept(File dir,String name){ return name.startsWith(requestId+"-")&&name.endsWith(".audio"); }});
  if(pending!=null) for(File file:pending) file.delete();
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
