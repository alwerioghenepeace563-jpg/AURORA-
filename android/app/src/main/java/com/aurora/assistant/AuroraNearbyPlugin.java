package com.aurora.assistant;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.X509EncodedKeySpec;
import java.security.KeyFactory;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

@CapacitorPlugin(
    name = "AuroraNearby",
    permissions = {
        @Permission(alias = "nearby_location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }),
        @Permission(alias = "nearby_legacy_bluetooth", strings = { Manifest.permission.BLUETOOTH, Manifest.permission.BLUETOOTH_ADMIN }),
        @Permission(alias = "nearby_modern_bluetooth", strings = { Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN }),
        @Permission(alias = "nearby_wifi", strings = { Manifest.permission.NEARBY_WIFI_DEVICES })
    }
)
public class AuroraNearbyPlugin extends Plugin {
    private static final String SERVICE_ID = "com.aurora.assistant.device-continuity";
    private static final String KEY_ALIAS = "aurora.device.continuity.identity.v1";
    private static final String PREFS = "aurora_nearby_identity";
    private static final int MAX_MESSAGE_BYTES = 24000;
    private static final long VERIFY_TIMEOUT_MS = 15000L;
    private static final long SEND_TIMEOUT_MS = 15000L;

    private ConnectionsClient client;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, Peer> peers = new ConcurrentHashMap<>();
    private final Map<String, PluginCall> verifyCalls = new ConcurrentHashMap<>();
    private final Map<String, String> verifyChallenges = new ConcurrentHashMap<>();
    private final Map<String, PluginCall> sendCalls = new ConcurrentHashMap<>();
    private final Set<String> approvedEndpoints = Collections.synchronizedSet(new HashSet<>());
    private final Map<String, Runnable> timeouts = new ConcurrentHashMap<>();
    private boolean advertising = false;
    private boolean discovering = false;

    private static final class Peer {
        final String endpointId;
        final String deviceId;
        final String name;
        final String platform;
        final String fingerprint;
        final String publicKey;
        final java.security.PublicKey parsedKey;
        volatile boolean connected;

        Peer(String endpointId, String deviceId, String name, String platform,
             String fingerprint, String publicKey, java.security.PublicKey parsedKey) {
            this.endpointId = endpointId;
            this.deviceId = deviceId;
            this.name = name;
            this.platform = platform;
            this.fingerprint = fingerprint;
            this.publicKey = publicKey;
            this.parsedKey = parsedKey;
            this.connected = true;
        }
    }

    @Override
    public void load() {
        client = Nearby.getConnectionsClient(getContext());
    }

    private String localDeviceId() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String id = prefs.getString("device_id", null);
        if (id == null || id.trim().isEmpty()) {
            id = UUID.randomUUID().toString();
            prefs.edit().putString("device_id", id).apply();
        }
        return id;
    }

    private String localName() {
        String manufacturer = Build.MANUFACTURER == null ? "Android" : Build.MANUFACTURER.trim();
        String model = Build.MODEL == null ? "device" : Build.MODEL.trim();
        String name = (manufacturer + " " + model).trim();
        return name.length() > 60 ? name.substring(0, 60) : name;
    }

    private KeyPair identityKeyPair() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) {
            java.security.PrivateKey privateKey = (java.security.PrivateKey) store.getKey(KEY_ALIAS, null);
            java.security.PublicKey publicKey = store.getCertificate(KEY_ALIAS).getPublicKey();
            return new KeyPair(publicKey, privateKey);
        }
        KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
        generator.initialize(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
            .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .build());
        return generator.generateKeyPair();
    }

    private String fingerprint(byte[] publicKey) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(publicKey);
        return "sha256:" + Base64.encodeToString(digest, Base64.NO_WRAP | Base64.URL_SAFE);
    }

    private JSONObject identityJson() throws Exception {
        KeyPair pair = identityKeyPair();
        String encoded = Base64.encodeToString(pair.getPublic().getEncoded(), Base64.NO_WRAP);
        JSONObject result = new JSONObject();
        result.put("deviceId", localDeviceId());
        result.put("name", localName());
        result.put("platform", "Android " + Build.VERSION.SDK_INT);
        result.put("publicKey", encoded);
        result.put("publicKeyFingerprint", fingerprint(pair.getPublic().getEncoded()));
        return result;
    }

    @PluginMethod
    public void getIdentity(PluginCall call) {
        try {
            JSONObject identity = identityJson();
            JSObject result = new JSObject(identity.toString());
            result.put("available", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("AURORA could not access its protected device identity.", error);
        }
    }

    @PluginMethod
    public void requestNearbyPermissions(PluginCall call) {
        List<String> aliases = new ArrayList<>();
        if (Build.VERSION.SDK_INT <= 32) aliases.add("nearby_location");
        if (Build.VERSION.SDK_INT <= 30) aliases.add("nearby_legacy_bluetooth");
        if (Build.VERSION.SDK_INT >= 31) aliases.add("nearby_modern_bluetooth");
        if (Build.VERSION.SDK_INT >= 33) aliases.add("nearby_wifi");
        boolean allGranted = true;
        for (String alias : aliases) {
            if (getPermissionState(alias) != PermissionState.GRANTED) { allGranted = false; break; }
        }
        if (allGranted) {
            call.resolve(new JSObject().put("granted", true).put("permissions", aliases.size()));
            return;
        }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "nearbyPermissionCallback");
    }

    @PermissionCallback
    private void nearbyPermissionCallback(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT <= 32) granted &= getPermissionState("nearby_location") == PermissionState.GRANTED;
        if (Build.VERSION.SDK_INT <= 30) granted &= getPermissionState("nearby_legacy_bluetooth") == PermissionState.GRANTED;
        if (Build.VERSION.SDK_INT >= 31) granted &= getPermissionState("nearby_modern_bluetooth") == PermissionState.GRANTED;
        if (Build.VERSION.SDK_INT >= 33) granted &= getPermissionState("nearby_wifi") == PermissionState.GRANTED;
        call.resolve(new JSObject().put("granted", granted));
    }

    private boolean permissionsGranted() {
        if (Build.VERSION.SDK_INT <= 32 &&
            (getContext().checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
             getContext().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)) return false;
        if (Build.VERSION.SDK_INT <= 30 &&
            (getContext().checkSelfPermission(Manifest.permission.BLUETOOTH) != PackageManager.PERMISSION_GRANTED ||
             getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_ADMIN) != PackageManager.PERMISSION_GRANTED)) return false;
        if (Build.VERSION.SDK_INT >= 31 &&
            (getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED ||
             getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED ||
             getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED)) return false;
        if (Build.VERSION.SDK_INT >= 33 &&
            getContext().checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES) != PackageManager.PERMISSION_GRANTED) return false;
        return true;
    }

    private boolean ready(PluginCall call) {
        if (client == null) client = Nearby.getConnectionsClient(getContext());
        if (!permissionsGranted()) {
            call.reject("Nearby device permissions are required. Request them before scanning or connecting.");
            return false;
        }
        return true;
    }

    @PluginMethod
    public void startAdvertising(PluginCall call) {
        if (!ready(call)) return;
        try {
            AdvertisingOptions options = new AdvertisingOptions.Builder().setStrategy(Strategy.P2P_POINT_TO_POINT).build();
            client.startAdvertising(localName(), SERVICE_ID, lifecycleCallback, options)
                .addOnSuccessListener(unused -> {
                    advertising = true;
                    call.resolve(new JSObject().put("started", true).put("mode", "advertising"));
                })
                .addOnFailureListener(error -> call.reject("AURORA could not start nearby advertising.", error));
        } catch (Exception error) { call.reject("AURORA could not start nearby advertising.", error); }
    }

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        if (!ready(call)) return;
        try {
            DiscoveryOptions options = new DiscoveryOptions.Builder().setStrategy(Strategy.P2P_POINT_TO_POINT).build();
            client.startDiscovery(SERVICE_ID, discoveryCallback, options)
                .addOnSuccessListener(unused -> {
                    discovering = true;
                    call.resolve(new JSObject().put("started", true).put("mode", "discovery"));
                })
                .addOnFailureListener(error -> call.reject("AURORA could not discover nearby devices.", error));
        } catch (Exception error) { call.reject("AURORA could not discover nearby devices.", error); }
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        if (client != null) client.stopDiscovery();
        discovering = false;
        call.resolve(new JSObject().put("stopped", true));
    }

    @PluginMethod
    public void stopAdvertising(PluginCall call) {
        if (client != null) client.stopAdvertising();
        advertising = false;
        call.resolve(new JSObject().put("stopped", true));
    }

    @PluginMethod
    public void requestConnection(PluginCall call) {
        if (!ready(call)) return;
        String endpointId = call.getString("endpointId");
        if (endpointId == null || endpointId.trim().isEmpty()) {
            call.reject("Choose a discovered AURORA device first."); return;
        }
        try {
            client.requestConnection(localName(), endpointId, lifecycleCallback)
                .addOnSuccessListener(unused -> call.resolve(new JSObject().put("requested", true)))
                .addOnFailureListener(error -> call.reject("AURORA could not request this device connection.", error));
        } catch (Exception error) { call.reject("AURORA could not request this device connection.", error); }
    }

    @PluginMethod
    public void acceptConnection(PluginCall call) {
        String endpointId = call.getString("endpointId");
        if (endpointId == null || !call.getBoolean("confirmed", false)) {
            call.reject("Compare the authentication code on both phones and explicitly confirm before accepting.");
            return;
        }
        approvedEndpoints.add(endpointId);
        client.acceptConnection(endpointId, payloadCallback)
            .addOnSuccessListener(unused -> call.resolve(new JSObject().put("accepted", true)))
            .addOnFailureListener(error -> {
                approvedEndpoints.remove(endpointId);
                call.reject("AURORA could not accept this nearby connection.", error);
            });
    }

    @PluginMethod
    public void rejectConnection(PluginCall call) {
        String endpointId = call.getString("endpointId");
        if (endpointId == null || endpointId.trim().isEmpty()) { call.reject("A device endpoint is required."); return; }
        approvedEndpoints.remove(endpointId);
        client.rejectConnection(endpointId)
            .addOnSuccessListener(unused -> call.resolve(new JSObject().put("rejected", true)))
            .addOnFailureListener(error -> call.reject("AURORA could not reject the connection.", error));
    }

    @PluginMethod
    public void getConnectedPeers(PluginCall call) {
        JSArray items = new JSArray();
        for (Peer peer : peers.values()) {
            if (!peer.connected) continue;
            JSObject item = new JSObject();
            item.put("endpointId", peer.endpointId);
            item.put("deviceId", peer.deviceId);
            item.put("name", peer.name);
            item.put("platform", peer.platform);
            item.put("publicKeyFingerprint", peer.fingerprint);
            item.put("authenticated", true);
            items.put(item);
        }
        call.resolve(new JSObject().put("items", items).put("count", items.length()));
    }

    @PluginMethod
    public void verifyPeer(PluginCall call) {
        String endpointId = call.getString("endpointId");
        String challenge = call.getString("challenge");
        Peer peer = endpointId == null ? null : peers.get(endpointId);
        if (peer == null || !peer.connected || challenge == null || !challenge.matches("[a-fA-F0-9]{64}")) {
            call.reject("The nearby peer is not ready for authenticated pairing."); return;
        }
        if (verifyCalls.containsKey(endpointId)) { call.reject("A pairing verification is already in progress."); return; }
        try {
            JSONObject message = signedMessage("AUTH_CHALLENGE", challenge, peer.deviceId);
            verifyChallenges.put(endpointId, challenge);
            verifyCalls.put(endpointId, call);
            Runnable timeout = () -> {
                PluginCall pending = verifyCalls.remove(endpointId);
                verifyChallenges.remove(endpointId);
                if (pending != null) pending.reject("The other device did not complete identity verification in time.");
            };
            timeouts.put("verify:" + endpointId, timeout);
            handler.postDelayed(timeout, VERIFY_TIMEOUT_MS);
            sendControl(endpointId, message);
        } catch (Exception error) {
            verifyCalls.remove(endpointId);
            verifyChallenges.remove(endpointId);
            call.reject("AURORA could not start device identity verification.", error);
        }
    }

    @PluginMethod
    public void sendEncrypted(PluginCall call) {
        String deviceId = call.getString("deviceId");
        JSObject payload = call.getObject("payload");
        if (deviceId == null || payload == null) { call.reject("A destination and JSON payload are required."); return; }
        Peer peer = peerForDevice(deviceId);
        if (peer == null || !peer.connected) { call.reject("The paired device is not currently connected."); return; }
        try {
            JSONObject envelope = new JSONObject();
            envelope.put("type", "APP_DATA");
            envelope.put("id", UUID.randomUUID().toString());
            envelope.put("fromDeviceId", localDeviceId());
            envelope.put("payload", new JSONObject(payload.toString()));
            byte[] bytes = envelope.toString().getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_MESSAGE_BYTES) { call.reject("The handoff exceeds the nearby message limit."); return; }
            String messageId = envelope.getString("id");
            sendCalls.put(messageId, call);
            Runnable timeout = () -> {
                PluginCall pending = sendCalls.remove(messageId);
                if (pending != null) pending.reject("The destination did not acknowledge the encrypted handoff.");
            };
            timeouts.put("send:" + messageId, timeout);
            handler.postDelayed(timeout, SEND_TIMEOUT_MS);
            client.sendPayload(peer.endpointId, Payload.fromBytes(bytes))
                .addOnFailureListener(error -> {
                    PluginCall pending = sendCalls.remove(messageId);
                    cancelTimeout("send:" + messageId);
                    if (pending != null) pending.reject("Nearby could not send the handoff.", error);
                });
        } catch (Exception error) { call.reject("AURORA could not prepare the handoff.", error); }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String deviceId = call.getString("deviceId");
        Peer peer = deviceId == null ? null : peerForDevice(deviceId);
        if (peer == null) { call.resolve(new JSObject().put("disconnected", true)); return; }
        client.disconnectFromEndpoint(peer.endpointId);
        peer.connected = false;
        peers.remove(peer.endpointId);
        call.resolve(new JSObject().put("disconnected", true));
    }

    private Peer peerForDevice(String deviceId) {
        for (Peer peer : peers.values()) if (peer.connected && peer.deviceId.equals(deviceId)) return peer;
        return null;
    }

    private void sendControl(String endpointId, JSONObject message) {
        if (client == null) return;
        byte[] bytes = message.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length <= MAX_MESSAGE_BYTES) {
            client.sendPayload(endpointId, Payload.fromBytes(bytes));
        }
    }

    private JSONObject signedMessage(String type, String challenge, String targetDeviceId) throws Exception {
        JSONObject identity = identityJson();
        String deviceId = identity.getString("deviceId");
        String fp = identity.getString("publicKeyFingerprint");
        String canonical = canonical(type, challenge, deviceId, targetDeviceId, fp);
        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(identityKeyPair().getPrivate());
        signer.update(canonical.getBytes(StandardCharsets.UTF_8));
        JSONObject message = new JSONObject();
        message.put("type", type);
        message.put("challenge", challenge);
        message.put("fromDeviceId", deviceId);
        message.put("toDeviceId", targetDeviceId);
        message.put("fingerprint", fp);
        message.put("signature", Base64.encodeToString(signer.sign(), Base64.NO_WRAP));
        return message;
    }

    private String canonical(String type, String challenge, String from, String to, String fp) {
        return "AURORA-DEVICE-CONTINUITY-v1|" + type + "|" + challenge + "|" + from + "|" + to + "|" + fp;
    }

    private boolean verifySignature(Peer peer, String type, String challenge, String from, String to, String fp, String signature) {
        try {
            Signature verifier = Signature.getInstance("SHA256withECDSA");
            verifier.initVerify(peer.parsedKey);
            verifier.update(canonical(type, challenge, from, to, fp).getBytes(StandardCharsets.UTF_8));
            return verifier.verify(Base64.decode(signature, Base64.DEFAULT));
        } catch (Exception ignored) { return false; }
    }

    private void handleHello(String endpointId, JSONObject message) {
        try {
            String deviceId = message.getString("deviceId");
            String name = message.getString("name");
            String platform = message.getString("platform");
            String encodedKey = message.getString("publicKey");
            String claimedFingerprint = message.getString("publicKeyFingerprint");
            if (deviceId.equals(localDeviceId()) || deviceId.length() > 96 || name.trim().isEmpty() || name.length() > 60) return;
            byte[] keyBytes = Base64.decode(encodedKey, Base64.DEFAULT);
            String actualFingerprint = fingerprint(keyBytes);
            if (!actualFingerprint.equals(claimedFingerprint)) return;
            java.security.PublicKey parsed = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(keyBytes));
            Peer peer = new Peer(endpointId, deviceId, name, platform, actualFingerprint, encodedKey, parsed);
            peers.put(endpointId, peer);
            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            event.put("deviceId", deviceId);
            event.put("name", name);
            event.put("platform", platform);
            event.put("publicKeyFingerprint", actualFingerprint);
            event.put("authenticated", false);
            notifyListeners("nearbyPeerReady", event);
        } catch (Exception ignored) {
            notifyListeners("nearbyTransportError", new JSObject().put("code", "INVALID_PEER_IDENTITY"));
        }
    }

    private void handleChallenge(String endpointId, JSONObject message) {
        Peer peer = peers.get(endpointId);
        if (peer == null) return;
        try {
            String challenge = message.getString("challenge");
            String from = message.getString("fromDeviceId");
            String to = message.getString("toDeviceId");
            String fp = message.getString("fingerprint");
            String signature = message.getString("signature");
            if (!to.equals(localDeviceId()) || !from.equals(peer.deviceId) || !fp.equals(peer.fingerprint) ||
                !challenge.matches("[a-fA-F0-9]{64}") ||
                !verifySignature(peer, "AUTH_CHALLENGE", challenge, from, to, fp, signature)) {
                notifyListeners("nearbyTransportError", new JSObject().put("code", "PEER_AUTHENTICATION_FAILED"));
                return;
            }
            sendControl(endpointId, signedMessage("AUTH_RESPONSE", challenge, peer.deviceId));
        } catch (Exception ignored) {
            notifyListeners("nearbyTransportError", new JSObject().put("code", "PEER_AUTHENTICATION_FAILED"));
        }
    }

    private void handleResponse(String endpointId, JSONObject message) {
        PluginCall pending = verifyCalls.get(endpointId);
        Peer peer = peers.get(endpointId);
        if (pending == null || peer == null) return;
        try {
            String challenge = message.getString("challenge");
            String from = message.getString("fromDeviceId");
            String to = message.getString("toDeviceId");
            String fp = message.getString("fingerprint");
            String signature = message.getString("signature");
            String expected = verifyChallenges.get(endpointId);
            boolean valid = expected != null && expected.equals(challenge) &&
                from.equals(peer.deviceId) && to.equals(localDeviceId()) && fp.equals(peer.fingerprint) &&
                verifySignature(peer, "AUTH_RESPONSE", challenge, from, to, fp, signature);
            verifyCalls.remove(endpointId);
            verifyChallenges.remove(endpointId);
            cancelTimeout("verify:" + endpointId);
            if (!valid) {
                pending.reject("The paired device could not prove possession of its private identity key.");
                return;
            }
            JSObject result = new JSObject();
            result.put("authenticated", true);
            result.put("deviceId", peer.deviceId);
            result.put("publicKeyFingerprint", peer.fingerprint);
            pending.resolve(result);
            notifyListeners("nearbyPeerAuthenticated", new JSObject().put("deviceId", peer.deviceId).put("name", peer.name));
        } catch (Exception error) {
            verifyCalls.remove(endpointId);
            verifyChallenges.remove(endpointId);
            cancelTimeout("verify:" + endpointId);
            pending.reject("The device identity response was invalid.");
        }
    }

    private void handleAppData(String endpointId, JSONObject message) {
        Peer peer = peers.get(endpointId);
        if (peer == null || !peer.connected) return;
        try {
            String from = message.getString("fromDeviceId");
            String id = message.getString("id");
            JSONObject data = message.getJSONObject("payload");
            if (!from.equals(peer.deviceId) || id.length() > 80 || data.toString().length() > MAX_MESSAGE_BYTES) return;
            JSObject event = new JSObject();
            event.put("deviceId", peer.deviceId);
            event.put("name", peer.name);
            event.put("messageId", id);
            event.put("payload", new JSObject(data.toString()));
            notifyListeners("nearbyPayloadReceived", event);
            JSONObject ack = new JSONObject();
            ack.put("type", "APP_ACK");
            ack.put("id", id);
            ack.put("fromDeviceId", localDeviceId());
            sendControl(endpointId, ack);
        } catch (Exception ignored) { }
    }

    private void handleAck(JSONObject message) {
        String id = message.optString("id", "");
        PluginCall pending = sendCalls.remove(id);
        if (pending == null) return;
        cancelTimeout("send:" + id);
        pending.resolve(new JSObject().put("delivered", true).put("encrypted", true));
    }

    private final EndpointDiscoveryCallback discoveryCallback = new EndpointDiscoveryCallback() {
        @Override public void onEndpointFound(String endpointId, DiscoveredEndpointInfo info) {
            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            event.put("name", info.getEndpointName());
            event.put("serviceId", SERVICE_ID);
            notifyListeners("nearbyEndpointFound", event);
        }
        @Override public void onEndpointLost(String endpointId) {
            notifyListeners("nearbyEndpointLost", new JSObject().put("endpointId", endpointId));
        }
    };

    private final ConnectionLifecycleCallback lifecycleCallback = new ConnectionLifecycleCallback() {
        @Override public void onConnectionInitiated(String endpointId, ConnectionInfo info) {
            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            event.put("name", info.getEndpointName());
            event.put("authenticationDigits", info.getAuthenticationDigits());
            event.put("incoming", true);
            notifyListeners("nearbyConnectionRequest", event);
        }
        @Override public void onConnectionResult(String endpointId, ConnectionResolution resolution) {
            if (!resolution.getStatus().isSuccess() || !approvedEndpoints.contains(endpointId)) {
                approvedEndpoints.remove(endpointId);
                notifyListeners("nearbyConnectionFailed", new JSObject().put("endpointId", endpointId));
                return;
            }
            try {
                JSONObject identity = identityJson();
                identity.put("type", "HELLO");
                sendControl(endpointId, identity);
                notifyListeners("nearbyConnectionEstablished", new JSObject().put("endpointId", endpointId));
            } catch (Exception error) {
                client.disconnectFromEndpoint(endpointId);
                notifyListeners("nearbyTransportError", new JSObject().put("code", "LOCAL_IDENTITY_UNAVAILABLE"));
            }
        }
        @Override public void onDisconnected(String endpointId) {
            Peer peer = peers.remove(endpointId);
            approvedEndpoints.remove(endpointId);
            PluginCall verify = verifyCalls.remove(endpointId);
            verifyChallenges.remove(endpointId);
            cancelTimeout("verify:" + endpointId);
            if (verify != null) verify.reject("The nearby device disconnected during pairing.");
            if (peer != null) {
                notifyListeners("nearbyPeerDisconnected", new JSObject().put("deviceId", peer.deviceId));
            }
        }
    };

    private final PayloadCallback payloadCallback = new PayloadCallback() {
        @Override public void onPayloadReceived(String endpointId, Payload payload) {
            if (payload.getType() != Payload.Type.BYTES || payload.asBytes() == null) return;
            byte[] bytes = payload.asBytes();
            if (bytes.length == 0 || bytes.length > MAX_MESSAGE_BYTES) return;
            try {
                JSONObject message = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                String type = message.optString("type", "");
                if ("HELLO".equals(type)) handleHello(endpointId, message);
                else if ("AUTH_CHALLENGE".equals(type)) handleChallenge(endpointId, message);
                else if ("AUTH_RESPONSE".equals(type)) handleResponse(endpointId, message);
                else if ("APP_DATA".equals(type)) handleAppData(endpointId, message);
                else if ("APP_ACK".equals(type)) handleAck(message);
            } catch (Exception ignored) { }
        }
        @Override public void onPayloadTransferUpdate(String endpointId, PayloadTransferUpdate update) { }
    };

    private void cancelTimeout(String key) {
        Runnable task = timeouts.remove(key);
        if (task != null) handler.removeCallbacks(task);
    }

    @Override
    protected void handleOnDestroy() {
        for (PluginCall call : verifyCalls.values()) call.reject("AURORA closed the nearby pairing session.");
        for (PluginCall call : sendCalls.values()) call.reject("AURORA closed the nearby handoff session.");
        verifyCalls.clear(); sendCalls.clear(); verifyChallenges.clear(); timeouts.clear();
        if (client != null) client.stopAllEndpoints();
        peers.clear();
        super.handleOnDestroy();
    }
}
