package com.aurora.assistant;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.PendingIntent;
import android.content.Intent;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** User-approved, network-constrained periodic Search checks for Watchtower monitors. */
public class AuroraWatchtowerWorker extends Worker {
    private static final String CHANNEL = "aurora_watchtower";
    public AuroraWatchtowerWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

    @NonNull @Override public Result doWork() {
        String id=getInputData().getString("monitorId"), title=getInputData().getString("title");
        String query=getInputData().getString("query"), endpoint=getInputData().getString("endpoint");
        if (id==null || title==null || query==null || endpoint==null) return Result.failure();
        if (!safeEndpoint(endpoint)) return Result.failure();
        HttpURLConnection connection=null;
        try {
            URL url=new URL(endpoint);
            connection=(HttpURLConnection)url.openConnection();
            connection.setRequestMethod("POST"); connection.setConnectTimeout(12000); connection.setReadTimeout(18000);
            connection.setDoOutput(true); connection.setRequestProperty("Content-Type","application/json");
            connection.setRequestProperty("Accept","application/json");
            JSONObject body=new JSONObject(); body.put("query",query);
            byte[] payload=body.toString().getBytes(StandardCharsets.UTF_8);
            try(OutputStream out=connection.getOutputStream()){out.write(payload);}
            int status=connection.getResponseCode();
            if(status==429 || status>=500) return Result.retry();
            if(status<200 || status>=300) return Result.failure();
            String response;
            try(InputStream in=connection.getInputStream(); java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream()){
                byte[] buffer=new byte[4096]; int count; while((count=in.read(buffer))!=-1){bytes.write(buffer,0,count);if(bytes.size()>1024*1024) return Result.failure();}
                response=new String(bytes.toByteArray(),StandardCharsets.UTF_8);
            }
            JSONObject data=new JSONObject(response); JSONArray results=data.optJSONArray("results");
            if(results==null) return Result.retry();
            Set<String> current=new HashSet<>(); int valid=0;
            for(int i=0;i<Math.min(results.length(),5);i++){
                JSONObject item=results.optJSONObject(i); if(item==null) continue;
                String link=item.optString("url","");
                if(link.startsWith("https://") && link.length()<1500){current.add(link);valid++;}
            }
            if(valid==0) return Result.success();
            android.content.SharedPreferences prefs=getApplicationContext().getSharedPreferences("aurora_watchtower_state",0);
            String key="urls_"+id; String previous=prefs.getString(key,null);
            prefs.edit().putString(key,new JSONArray(current).toString()).putLong("checked_"+id,System.currentTimeMillis()).apply();
            if(previous!=null){
                JSONArray old=new JSONArray(previous); Set<String> oldUrls=new HashSet<>();
                for(int i=0;i<old.length();i++) oldUrls.add(old.optString(i,""));
                int added=0; for(String link:current) if(!oldUrls.contains(link)) added++;
                if(added>0) notifyUpdate(id,title,added);
            }
            return Result.success();
        } catch(Exception error) { return Result.retry(); }
        finally { if(connection!=null) connection.disconnect(); }
    }

    private boolean safeEndpoint(String value) {
        try {
            URL url=new URL(value);
            String host=url.getHost().toLowerCase(java.util.Locale.ROOT);
            return "https".equals(url.getProtocol()) && url.getUserInfo()==null && url.getQuery()==null && url.getRef()==null
                && url.getPath().endsWith("/api/search")
                && (host.equals("aurora-ten-gold.vercel.app") || host.endsWith(".workers.dev") || host.endsWith(".vercel.app"));
        } catch(Exception error){return false;}
    }

    private void notifyUpdate(String id,String title,int count) {
        Context context=getApplicationContext();
        if(Build.VERSION.SDK_INT>=33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(manager==null)return;
        if(Build.VERSION.SDK_INT>=26) manager.createNotificationChannel(new NotificationChannel(CHANNEL,"AURORA Watchtower updates",NotificationManager.IMPORTANCE_DEFAULT));
        Intent launch=context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent open=launch==null?null:PendingIntent.getActivity(context,0,launch,PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0));
        NotificationCompat.Builder builder=new NotificationCompat.Builder(context,CHANNEL)
            .setSmallIcon(context.getApplicationInfo().icon).setContentTitle("AURORA found an update")
            .setContentText(title+" · "+count+" new search result(s)")
            .setStyle(new NotificationCompat.BigTextStyle().bigText("Watchtower found "+count+" new search result(s) for "+title+". Open AURORA to review the sources."))
            .setAutoCancel(true);
        if(open!=null) builder.setContentIntent(open);
        Notification notification=builder.build();
        manager.notify(id.hashCode(),notification);
    }

    public static void schedule(Context context,String id,String title,String query,int hours,String endpoint) {
        long interval=Math.max(1,Math.min(24,hours));
        Data input=new Data.Builder().putString("monitorId",id).putString("title",title)
            .putString("query",query).putString("endpoint",endpoint).build();
        Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest request=new PeriodicWorkRequest.Builder(AuroraWatchtowerWorker.class,interval,TimeUnit.HOURS)
            .setInitialDelay(interval,TimeUnit.HOURS).setConstraints(constraints)
            .setBackoffCriteria( androidx.work.BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .setInputData(input).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("aurora-watchtower-"+id,ExistingPeriodicWorkPolicy.REPLACE,request);
    }
    public static void cancel(Context context,String id) {
        WorkManager.getInstance(context).cancelUniqueWork("aurora-watchtower-"+id);
        context.getSharedPreferences("aurora_watchtower_state",0).edit().remove("urls_"+id).remove("checked_"+id).apply();
    }

}
