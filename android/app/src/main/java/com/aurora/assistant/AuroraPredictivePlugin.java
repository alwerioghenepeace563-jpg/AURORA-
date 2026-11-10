package com.aurora.assistant;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AuroraPredictive")
public class AuroraPredictivePlugin extends Plugin implements SensorEventListener {
    private SensorManager manager;
    private Sensor accelerometer;
    private boolean listening = false;
    private long lastEmissionAt = 0L;
    private long intervalMs = 10000L;
    private static final float THRESHOLD = 1.15f;
    private static final float GRAVITY = 9.80665f;
    @Override public void load() {
        manager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (manager != null) accelerometer = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
    }
    @PluginMethod public void getMotionSensorStatus(PluginCall call) {
        call.resolve(new JSObject().put("available", accelerometer != null).put("active", listening).put("backgroundSampling", false));
    }
    @PluginMethod public void startMotionSensing(PluginCall call) {
        if (!call.getBoolean("consent", false)) { call.reject("Explicit motion-sensing consent is required."); return; }
        if (accelerometer == null || manager == null) { call.resolve(new JSObject().put("started", false).put("available", false)); return; }
        intervalMs = Math.max(10000L, Math.min(60000L, call.getLong("samplingIntervalMs", 10000L)));
        stopListening();
        listening = manager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL);
        lastEmissionAt = 0L;
        call.resolve(new JSObject().put("started", listening).put("available", true).put("samplingIntervalMs", intervalMs).put("backgroundSampling", false));
    }
    @PluginMethod public void stopMotionSensing(PluginCall call) {
        stopListening();
        call.resolve(new JSObject().put("stopped", true));
    }
    private void stopListening() {
        if (manager != null && listening) manager.unregisterListener(this);
        listening = false;
    }
    @Override public void onSensorChanged(SensorEvent event) {
        if (!listening || event == null || event.sensor.getType() != Sensor.TYPE_ACCELEROMETER) return;
        long now = System.currentTimeMillis();
        if (lastEmissionAt != 0L && now - lastEmissionAt < intervalMs) return;
        float x=event.values[0], y=event.values[1], z=event.values[2];
        double magnitude=Math.sqrt((double)x*x+(double)y*y+(double)z*z);
        boolean moved=Math.abs(magnitude-GRAVITY)>THRESHOLD;
        lastEmissionAt=now;
        notifyListeners("motionSignal",new JSObject().put("moved",moved).put("timestamp",now).put("signal","motion").put("coarseOnly",true));
    }
    @Override public void onAccuracyChanged(Sensor sensor,int accuracy) { }
    @Override protected void handleOnPause() { stopListening(); super.handleOnPause(); }
    @Override protected void handleOnDestroy() { stopListening(); super.handleOnDestroy(); }
}