package com.aurora.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ForegroundInfo;
import androidx.work.NetworkType;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONObject;

public class AuroraTranscriptionWorker extends Worker {
    private static final String CHANNEL = "aurora_transcription";
    public AuroraTranscriptionWorker(Context context, WorkerParameters params) { super(context, params); }

    @Override public Result doWork() {
        String filePath = getInputData().getString("chunk_file");
        String endpoint = getInputData().getString("endpoint");
        String requestId = getInputData().getString("request_id");
        String mimeType = getInputData().getString("mime_type");
        int chunkNumber = getInputData().getInt("chunk_number", 0);
        int totalChunks = getInputData().getInt("total_chunks", 0);
        if (filePath == null || endpoint == null || requestId == null || mimeType == null || chunkNumber < 1 || totalChunks < 1) return Result.failure();
        File chunkFile = new File(filePath);
        if (!chunkFile.isFile() || chunkFile.length() == 0) return Result.failure();
        try {
            String token = AuroraTranscriptionTokenStore.read(getApplicationContext());
            if (token == null || token.isEmpty()) return Result.failure();
            setForegroundAsync(foregroundInfo("Uploading section " + chunkNumber + " of " + totalChunks)).get();
            byte[] audio = readFile(chunkFile);
            JSONObject body = new JSONObject();
            body.put("action", "process");
            body.put("requestId", requestId);
            body.put("chunkNumber", chunkNumber);
            body.put("totalChunks", totalChunks);
            body.put("mimeType", mimeType);
            body.put("languageHint", "Nigerian English and Nigerian Pidgin; preserve the language actually spoken");
            body.put("audioBase64", android.util.Base64.encodeToString(audio, android.util.Base64.NO_WRAP));

            HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(55000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(payload); }
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            String response = readText(stream);
            connection.disconnect();
            if (status >= 200 && status < 300) {
                chunkFile.delete();
                return Result.success(new Data.Builder().putString("request_id", requestId).putInt("chunk_number", chunkNumber).build());
            }
            if (status == 408 || status == 425 || status == 429 || status >= 500) return Result.retry();
            android.util.Log.w("AuroraTranscriptionWorker", "Upload rejected (" + status + "): " + response);
            return Result.failure();
        } catch (Exception error) {
            android.util.Log.w("AuroraTranscriptionWorker", "Background section upload will retry", error);
            return Result.retry();
        }
    }

    private ForegroundInfo foregroundInfo(String message) {
        Context context = getApplicationContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "AURORA transcription", NotificationManager.IMPORTANCE_LOW));
        Notification notification = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("AURORA · Background transcription")
            .setContentText(message)
            .setOngoing(true).setOnlyAlertOnce(true)
            .setProgress(0, 0, true).build();
        int id = 52000 + Math.abs(getId().hashCode() % 10000);
        if (Build.VERSION.SDK_INT >= 29) return new ForegroundInfo(id, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        return new ForegroundInfo(id, notification);
    }

    private static byte[] readFile(File file) throws Exception {
        try (InputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toByteArray();
        }
    }
    private static String readText(InputStream stream) throws Exception {
        if (stream == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder result = new StringBuilder(); String line;
            while ((line = reader.readLine()) != null) result.append(line);
            return result.toString();
        }
    }
}
