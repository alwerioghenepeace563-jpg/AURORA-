package com.aurora.assistant;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "AuroraLocation",
    permissions = {
        @Permission(alias = "location", strings = {
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.ACCESS_FINE_LOCATION
        })
    }
)
public class AuroraLocationPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LocationManager locationManager;
    private LocationListener activeListener;
    private Runnable timeoutRunnable;
    private PluginCall activeCall;
    private boolean finished = false;

    @PluginMethod
    public void requestLocationPermission(PluginCall call) {
        boolean granted = hasLocationPermission();
        if (granted) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        requestPermissionForAlias("location", call, "locationPermissionCallback");
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        call.resolve(new JSObject().put("granted", hasLocationPermission()));
    }

    @PluginMethod
    public synchronized void getCurrentLocation(PluginCall call) {
        if (!hasLocationPermission()) {
            call.reject("Grant location permission before requesting a fresh location.");
            return;
        }
        if (activeCall != null) {
            call.reject("A location request is already in progress.");
            return;
        }
        locationManager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            call.reject("Android location services are unavailable.");
            return;
        }
        boolean fine = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        List<String> providers = new ArrayList<>();
        try {
            for (String provider : locationManager.getProviders(true)) {
                if (LocationManager.GPS_PROVIDER.equals(provider) && !fine) continue;
                if (LocationManager.GPS_PROVIDER.equals(provider)
                    || LocationManager.NETWORK_PROVIDER.equals(provider)
                    || LocationManager.PASSIVE_PROVIDER.equals(provider)) {
                    providers.add(provider);
                }
            }
        } catch (SecurityException error) {
            call.reject("Android denied access to location providers.", error);
            return;
        }
        if (providers.isEmpty()) {
            call.reject("Turn on Android Location, then try again.");
            return;
        }

        activeCall = call;
        finished = false;
        activeListener = new LocationListener() {
            @Override public void onLocationChanged(Location location) {
                resolveLocation(location, fine ? "fine" : "coarse");
            }
            @Override public void onProviderEnabled(String provider) { }
            @Override public void onProviderDisabled(String provider) { }
            @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
        };

        try {
            for (String provider : providers) {
                try {
                    locationManager.requestSingleUpdate(provider, activeListener, Looper.getMainLooper());
                } catch (IllegalArgumentException | SecurityException ignored) { }
            }
            timeoutRunnable = () -> finishWithError("Android did not return a fresh location within 15 seconds. Check GPS, network and location settings.");
            handler.postDelayed(timeoutRunnable, 15000L);
        } catch (Exception error) {
            finishWithError("Could not start a one-shot Android location request.");
        }
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private synchronized void resolveLocation(Location location, String precision) {
        if (finished || activeCall == null || location == null) return;
        long age = Math.max(0L, System.currentTimeMillis() - location.getTime());
        if (age > 30000L) return;
        JSObject result = new JSObject();
        result.put("latitude", location.getLatitude());
        result.put("longitude", location.getLongitude());
        result.put("accuracyMeters", location.hasAccuracy() ? location.getAccuracy() : -1);
        result.put("provider", location.getProvider() == null ? "unknown" : location.getProvider());
        result.put("timestamp", location.getTime());
        result.put("ageMs", age);
        result.put("fresh", true);
        result.put("precision", precision);
        result.put("backgroundTracking", false);
        result.put("source", "one_shot_location_update");
        PluginCall call = activeCall;
        cleanup();
        call.resolve(result);
    }

    private synchronized void finishWithError(String message) {
        if (finished || activeCall == null) return;
        PluginCall call = activeCall;
        cleanup();
        call.reject(message);
    }

    private synchronized void cleanup() {
        finished = true;
        if (timeoutRunnable != null) handler.removeCallbacks(timeoutRunnable);
        timeoutRunnable = null;
        if (locationManager != null && activeListener != null) {
            try { locationManager.removeUpdates(activeListener); } catch (SecurityException ignored) { }
        }
        activeListener = null;
        activeCall = null;
    }

    @Override
    protected synchronized void handleOnPause() {
        super.handleOnPause();
        if (activeCall != null) finishWithError("Location request stopped because AURORA left the foreground.");
    }

    @Override
    protected synchronized void handleOnDestroy() {
        if (activeCall != null) finishWithError("Location request stopped because AURORA closed.");
        cleanup();
        super.handleOnDestroy();
    }
}
