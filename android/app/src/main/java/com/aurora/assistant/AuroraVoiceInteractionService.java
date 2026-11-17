package com.aurora.assistant;
import android.service.voice.VoiceInteractionService;
/** Android invokes this entry point only after the user selects AURORA as assistant. */
public class AuroraVoiceInteractionService extends VoiceInteractionService {
 @Override public void onReady() {
  super.onReady();
  getSharedPreferences("aurora_assistant", MODE_PRIVATE).edit().putBoolean("voice_interaction_service_ready", true).apply();
 }
 @Override public void onShutdown() {
  getSharedPreferences("aurora_assistant", MODE_PRIVATE).edit().putBoolean("voice_interaction_service_ready", false).apply();
  super.onShutdown();
 }
}
