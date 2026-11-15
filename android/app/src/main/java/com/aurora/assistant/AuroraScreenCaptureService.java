package com.aurora.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import androidx.core.app.NotificationCompat;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;

/** Captures exactly one frame after system consent, then tears the projection down. */
public class AuroraScreenCaptureService extends Service {
    public static final String ACTION_CAPTURE_ONCE = "com.aurora.assistant.CAPTURE_SCREEN_ONCE";
    public static final String EXTRA_RESULT_CODE = "result_code";
    public static final String EXTRA_RESULT_DATA = "result_data";
    private static final String CHANNEL = "aurora_screen_capture";
    private static final int NOTIFICATION_ID = 7412;
    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private HandlerThread thread;
    private boolean cleaning = false;

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || !ACTION_CAPTURE_ONCE.equals(intent.getAction())) { stopSelf(startId); return START_NOT_STICKY; }
        getSharedPreferences("aurora_screen_capture", MODE_PRIVATE).edit().putBoolean("capturing", true).putBoolean("captured", false).remove("error").apply();
        createChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle("AURORA screen capture")
            .setContentText("Capturing one frame with your permission")
            .setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(NOTIFICATION_ID, notification);
        try {
            MediaProjectionManager manager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            projection = manager.getMediaProjection(intent.getIntExtra(EXTRA_RESULT_CODE, 0), intent.getParcelableExtra(EXTRA_RESULT_DATA));
            if (projection == null) throw new IllegalStateException("Android did not provide a screen projection.");
            projection.registerCallback(new MediaProjection.Callback() {
                @Override public void onStop() { projection = null; cleanup(); stopSelf(); }
            }, new Handler(getMainLooper()));
            DisplayMetrics metrics = new DisplayMetrics();
            WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
            if (Build.VERSION.SDK_INT >= 30) {
                android.view.WindowMetrics bounds = wm.getCurrentWindowMetrics();
                int sourceWidth = bounds.getBounds().width();
                int sourceHeight = bounds.getBounds().height();
                int maxDimension = 1600;
                float scale = Math.min(1f, maxDimension / (float) Math.max(sourceWidth, sourceHeight));
                metrics.widthPixels = Math.max(1, Math.round(sourceWidth * scale));
                metrics.heightPixels = Math.max(1, Math.round(sourceHeight * scale));
                metrics.densityDpi = Math.max(120, Math.round(getResources().getDisplayMetrics().densityDpi * scale));
            } else {
                wm.getDefaultDisplay().getRealMetrics(metrics);
                int maxDimension = 1600;
                float scale = Math.min(1f, maxDimension / (float) Math.max(metrics.widthPixels, metrics.heightPixels));
                metrics.widthPixels = Math.max(1, Math.round(metrics.widthPixels * scale));
                metrics.heightPixels = Math.max(1, Math.round(metrics.heightPixels * scale));
                metrics.densityDpi = Math.max(120, Math.round(metrics.densityDpi * scale));
            }
            thread = new HandlerThread("AuroraOneFrameCapture");
            thread.start();
            reader = ImageReader.newInstance(metrics.widthPixels, metrics.heightPixels, android.graphics.PixelFormat.RGBA_8888, 2);
            reader.setOnImageAvailableListener(source -> saveOneFrame(source), new Handler(thread.getLooper()));
            display = projection.createVirtualDisplay("AURORA-OneFrame", metrics.widthPixels, metrics.heightPixels,
                metrics.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, new Handler(getMainLooper()));
            new Handler(getMainLooper()).postDelayed(() -> {
                if (getSharedPreferences("aurora_screen_capture", MODE_PRIVATE).getBoolean("capturing", false)) {
                    getSharedPreferences("aurora_screen_capture", MODE_PRIVATE).edit().putBoolean("capturing", false).apply();
                    cleanup(); stopSelf();
                }
            }, 5000L);
        } catch (Exception error) {
            getSharedPreferences("aurora_screen_capture", MODE_PRIVATE).edit().putBoolean("capturing", false).putString("error", error.getMessage()).apply();
            cleanup(); stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void saveOneFrame(ImageReader source) {
        Image image = null;
        try {
            image = source.acquireLatestImage();
            if (image == null) return;
            Image.Plane plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            int pixelStride = plane.getPixelStride();
            int rowStride = plane.getRowStride();
            int rowPadding = rowStride - pixelStride * image.getWidth();
            Bitmap padded = Bitmap.createBitmap(image.getWidth() + rowPadding / pixelStride, image.getHeight(), Bitmap.Config.ARGB_8888);
            padded.copyPixelsFromBuffer(buffer);
            Bitmap frame = Bitmap.createBitmap(padded, 0, 0, image.getWidth(), image.getHeight());
            File output = new File(getCacheDir(), "aurora-screen-capture.png");
            try (FileOutputStream stream = new FileOutputStream(output)) {
                frame.compress(Bitmap.CompressFormat.PNG, 100, stream);
                stream.flush();
                stream.getFD().sync();
            }
            frame.recycle(); padded.recycle();
            getSharedPreferences("aurora_screen_capture", MODE_PRIVATE).edit()
                .putBoolean("captured", true).putBoolean("capturing", false)
                .putLong("captured_at", System.currentTimeMillis()).putLong("bytes", output.length()).remove("error").apply();
            cleanup(); stopSelf();
        } catch (Exception error) {
            getSharedPreferences("aurora_screen_capture", MODE_PRIVATE).edit().putBoolean("capturing", false).putString("error", error.getMessage()).apply();
            cleanup(); stopSelf();
        } finally { if (image != null) image.close(); }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "AURORA screen capture", NotificationManager.IMPORTANCE_LOW);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }
    private synchronized void cleanup() {
        if (cleaning) return;
        cleaning = true;
        try { if (display != null) display.release(); } catch (Exception ignored) {}
        display = null;
        try { if (reader != null) reader.close(); } catch (Exception ignored) {}
        reader = null;
        MediaProjection activeProjection = projection;
        projection = null;
        try { if (activeProjection != null) activeProjection.stop(); } catch (Exception ignored) {}
        try { if (thread != null) thread.quitSafely(); } catch (Exception ignored) {}
        thread = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        cleaning = false;
    }
    @Override public void onDestroy() { cleanup(); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
