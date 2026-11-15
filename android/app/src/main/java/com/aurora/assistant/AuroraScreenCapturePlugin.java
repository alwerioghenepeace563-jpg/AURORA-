package com.aurora.assistant;

import android.app.Activity;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.content.Context;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/** User-consented, one-frame screen capture. No background or silent capture. */
@CapacitorPlugin(name = "AuroraScreenCapture")
public class AuroraScreenCapturePlugin extends Plugin {
    @PluginMethod
    public void requestScreenCapture(PluginCall call) {
        if (getActivity() == null || getActivity().isFinishing()) {
            call.reject("Open AURORA before requesting screen capture.");
            return;
        }
        MediaProjectionManager manager = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            call.reject("Android screen capture is not available on this device.");
            return;
        }
        startActivityForResult(call, manager.createScreenCaptureIntent(), "screenCapturePermissionResult");
    }

    @ActivityCallback
    private void screenCapturePermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("started", false).put("consentGranted", false));
            return;
        }
        Intent service = new Intent(getContext(), AuroraScreenCaptureService.class);
        service.setAction(AuroraScreenCaptureService.ACTION_CAPTURE_ONCE);
        service.putExtra(AuroraScreenCaptureService.EXTRA_RESULT_CODE, result.getResultCode());
        service.putExtra(AuroraScreenCaptureService.EXTRA_RESULT_DATA, result.getData());
        try {
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(service);
            else getContext().startService(service);
            call.resolve(new JSObject().put("started", true).put("consentGranted", true)
                .put("scope", "one_frame").put("backgroundCapture", false));
        } catch (Exception error) {
            call.reject("Android could not start the consented capture session.", error);
        }
    }

    @PluginMethod
    public void getScreenCaptureStatus(PluginCall call) {
        android.content.SharedPreferences prefs = getContext().getSharedPreferences("aurora_screen_capture", 0);
        call.resolve(new JSObject()
            .put("captured", prefs.getBoolean("captured", false))
            .put("capturing", prefs.getBoolean("capturing", false))
            .put("capturedAt", prefs.getLong("captured_at", 0L))
            .put("bytes", prefs.getLong("bytes", 0L))
            .put("scope", "one_frame")
            .put("backgroundCapture", false));
    }

    @PluginMethod
    public void getLatestScreenCapture(PluginCall call) {
        java.io.File image = new java.io.File(getContext().getCacheDir(), "aurora-screen-capture.png");
        if (!image.isFile() || image.length() <= 0 || image.length() > 8L * 1024L * 1024L) {
            call.reject("No available screen frame, or the frame exceeds the safe preview size.");
            return;
        }
        try (java.io.FileInputStream input = new java.io.FileInputStream(image);
             java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            call.resolve(new JSObject().put("mimeType", "image/png")
                .put("base64", android.util.Base64.encodeToString(output.toByteArray(), android.util.Base64.NO_WRAP))
                .put("bytes", image.length()));
        } catch (Exception error) { call.reject("Could not read the private screen frame.", error); }
    }

    @PluginMethod
    public void clearScreenCapture(PluginCall call) {
        java.io.File image = new java.io.File(getContext().getCacheDir(), "aurora-screen-capture.png");
        boolean deleted = !image.exists() || image.delete();
        getContext().getSharedPreferences("aurora_screen_capture", 0).edit()
            .putBoolean("captured", false).putBoolean("capturing", false)
            .putLong("captured_at", 0L).putLong("bytes", 0L).remove("error").apply();
        call.resolve(new JSObject().put("cleared", deleted));
    }
}
