package com.aurora.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.work.Data;
import androidx.work.ForegroundInfo;
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
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class AuroraTranscriptionWorker extends Worker {
    private static final String CHANNEL = "aurora_transcription";
    private static final int MAX_SECTION_BYTES = 3_000_000;
    private static final long SECTION_US = 20_000_000L;

    public AuroraTranscriptionWorker(Context context, WorkerParameters params) { super(context, params); }

    @Override public Result doWork() {
        String sourcePath = getInputData().getString("source_file");
        if (sourcePath != null) return processSourceRecording(new File(sourcePath));

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
            uploadSection(chunkFile, endpoint, requestId, mimeType, chunkNumber, totalChunks);
            chunkFile.delete();
            return Result.success(new Data.Builder().putString("request_id", requestId).putInt("chunk_number", chunkNumber).build());
        } catch (RetryableUploadException error) {
            return Result.retry();
        } catch (Exception error) {
            android.util.Log.w("AuroraTranscriptionWorker", "Background section upload failed", error);
            return Result.failure();
        }
    }

    private Result processSourceRecording(File source) {
        String endpoint = getInputData().getString("endpoint");
        String requestId = getInputData().getString("request_id");
        int totalChunks = getInputData().getInt("total_chunks", 0);
        long durationUs = getInputData().getLong("duration_us", 0L);
        if (!source.isFile() || source.length() == 0 || endpoint == null || requestId == null || totalChunks < 1 || durationUs <= 0) return Result.failure();
        File folder = new File(getApplicationContext().getFilesDir(), "aurora-transcription-queue");
        if (!folder.exists() && !folder.mkdirs()) return Result.failure();
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(source.getAbsolutePath());
            int audioTrack = -1;
            MediaFormat audioFormat = null;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat candidate = extractor.getTrackFormat(i);
                String mime = candidate.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) { audioTrack = i; audioFormat = candidate; break; }
            }
            if (audioTrack < 0 || audioFormat == null) throw new UnsupportedOperationException("No supported audio track was found in this MP4 recording.");
            String codec = audioFormat.getString(MediaFormat.KEY_MIME);
            if (!"audio/mp4a-latm".equals(codec)) throw new UnsupportedOperationException("This background processor currently supports AAC audio inside MP4/M4A files. Reopen AURORA to use the compatible foreground converter for this format.");
            extractor.selectTrack(audioTrack);
            android.content.SharedPreferences checkpoints = getApplicationContext().getSharedPreferences("aurora_transcription_progress", Context.MODE_PRIVATE);
            int lastCompleted = checkpoints.getInt(requestId, 0);
            for (int chunk = lastCompleted + 1; chunk <= totalChunks; chunk++) {
                if (isStopped()) return Result.failure();
                long startUs = (chunk - 1L) * SECTION_US;
                long endUs = Math.min(durationUs, startUs + SECTION_US);
                File output = new File(folder, requestId + "-native-" + chunk + ".m4a");
                setForegroundAsync(foregroundInfo("Extracting and uploading section " + chunk + " of " + totalChunks)).get();
                extractAacSection(extractor, audioTrack, audioFormat, startUs, endUs, output);
                uploadSection(output, endpoint, requestId, "audio/mp4", chunk, totalChunks);
                output.delete();
                checkpoints.edit().putInt(requestId, chunk).commit();
                setProgressAsync(new Data.Builder().putInt("completed_chunks", chunk).putInt("total_chunks", totalChunks).build());
            }
            source.delete();
            checkpoints.edit().remove(requestId).commit();
            return Result.success(new Data.Builder().putString("request_id", requestId).putInt("completed_chunks", totalChunks).build());
        } catch (UnsupportedOperationException | IllegalStateException error) {
            android.util.Log.w("AuroraTranscriptionWorker", error.getMessage());
            source.delete();
            return Result.failure(new Data.Builder().putString("reason", error.getMessage()).build());
        } catch (RetryableUploadException error) {
            return Result.retry();
        } catch (Exception error) {
            android.util.Log.w("AuroraTranscriptionWorker", "Native source processing failed", error);
            return Result.retry();
        } finally {
            try { extractor.release(); } catch (Exception releaseError) {
                android.util.Log.w("AuroraTranscriptionWorker", "Could not release native media extractor", releaseError);
            }
        }
    }

    private void extractAacSection(MediaExtractor extractor, int audioTrack, MediaFormat format, long startUs, long endUs, File output) throws Exception {
        extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
        MediaMuxer muxer = new MediaMuxer(output.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        boolean started = false;
        try {
            int muxerTrack = muxer.addTrack(format);
            muxer.start();
            started = true;
            ByteBuffer buffer = ByteBuffer.allocateDirect(1024 * 1024);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            while (!isStopped()) {
                long sampleTime = extractor.getSampleTime();
                if (sampleTime < 0 || sampleTime >= endUs) break;
                int sampleTrack = extractor.getSampleTrackIndex();
                if (sampleTrack == audioTrack && sampleTime >= startUs) {
                    buffer.clear();
                    int size = extractor.readSampleData(buffer, 0);
                    if (size < 0) break;
                    info.set(0, size, sampleTime - startUs, extractor.getSampleFlags());
                    muxer.writeSampleData(muxerTrack, buffer, info);
                }
                if (!extractor.advance()) break;
            }
        } finally {
            if (started) muxer.stop();
            muxer.release();
        }
        if (!output.isFile() || output.length() == 0) throw new UnsupportedOperationException("A usable AAC audio section could not be extracted.");
        if (output.length() > MAX_SECTION_BYTES) throw new UnsupportedOperationException("An extracted 20-second section exceeds the safe upload size.");
    }

    private void uploadSection(File file, String endpoint, String requestId, String mimeType, int chunkNumber, int totalChunks) throws Exception {
        if (file.length() > MAX_SECTION_BYTES) throw new UnsupportedOperationException("Audio section exceeds the safe upload size.");
        String token = AuroraTranscriptionTokenStore.read(getApplicationContext());
        if (token == null || token.isEmpty()) throw new IllegalStateException("The signed-in session expired.");
        byte[] audio = readFile(file);
        JSONObject body = new JSONObject();
        body.put("action", "process"); body.put("requestId", requestId);
        body.put("chunkNumber", chunkNumber); body.put("totalChunks", totalChunks);
        body.put("mimeType", mimeType);
        body.put("languageHint", "Nigerian English and Nigerian Pidgin; preserve the language actually spoken");
        body.put("audioBase64", android.util.Base64.encodeToString(audio, android.util.Base64.NO_WRAP));
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        try {
            connection.setRequestMethod("POST"); connection.setConnectTimeout(15000); connection.setReadTimeout(55000);
            connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream stream = connection.getOutputStream()) { stream.write(payload); }
            int status = connection.getResponseCode();
            InputStream response = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            String responseText = readText(response);
            if (status >= 200 && status < 300) return;
            if (status == 408 || status == 425 || status == 429 || status >= 500) throw new RetryableUploadException();
            throw new IllegalStateException("VoiceText rejected section " + chunkNumber + " (" + status + "): " + responseText);
        } finally { connection.disconnect(); }
    }

    private ForegroundInfo foregroundInfo(String message) {
        Context context = getApplicationContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "AURORA transcription", NotificationManager.IMPORTANCE_LOW));
        Notification notification = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("AURORA · Background transcription")
            .setContentText(message).setOngoing(true).setOnlyAlertOnce(true).setProgress(0, 0, true).build();
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
    private static final class RetryableUploadException extends Exception {}
}
