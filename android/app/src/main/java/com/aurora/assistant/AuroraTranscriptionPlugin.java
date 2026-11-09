package com.aurora.assistant;

import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

@CapacitorPlugin(name = "AuroraTranscription")
public class AuroraTranscriptionPlugin extends Plugin {
    @PluginMethod public void start(PluginCall call) {
        String title = call.getData().optString("title", "Audio recording");
        IntentHelper.start(getContext(), AuroraTranscriptionService.ACTION_START, title, "Preparing transcription…", 0);
        call.resolve(new JSObject().put("started", true));
    }
    @PluginMethod public void update(PluginCall call) {
        String title = call.getData().optString("title", "Audio recording");
        String message = call.getData().optString("message", "Transcription in progress");
        int percent = Math.max(0, Math.min(100, call.getData().optInt("percent", 0)));
        IntentHelper.start(getContext(), AuroraTranscriptionService.ACTION_UPDATE, title, message, percent);
        call.resolve(new JSObject().put("updated", true));
    }
    @PluginMethod public void stop(PluginCall call) {
        IntentHelper.start(getContext(), AuroraTranscriptionService.ACTION_STOP, "", "", 0);
        call.resolve(new JSObject().put("stopped", true));
    }
}
