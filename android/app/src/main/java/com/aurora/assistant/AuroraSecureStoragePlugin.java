package com.aurora.assistant;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "AuroraSecureStorage")
public class AuroraSecureStoragePlugin extends Plugin {
    private static final String KEY_ALIAS = "aurora.secure.storage.v1";
    private static final int MAX_VALUE_BYTES = 32768;

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private File entryFile(String key) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
        StringBuilder name = new StringBuilder();
        for (byte value : digest) name.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        File directory = new File(getContext().getNoBackupFilesDir(), "aurora-secure-store");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Secure storage directory is unavailable.");
        return new File(directory, name.toString() + ".bin");
    }

    @PluginMethod
    public synchronized void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.trim().isEmpty() || key.length() > 128 || value == null) {
            call.reject("A valid key and value are required."); return;
        }
        byte[] plain = value.getBytes(StandardCharsets.UTF_8);
        if (plain.length > MAX_VALUE_BYTES) { call.reject("Secure values are limited to 32 KB."); return; }
        File target = null, temporary = null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(plain);
            byte[] iv = cipher.getIV();
            byte[] packed = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, packed, 0, iv.length);
            System.arraycopy(encrypted, 0, packed, iv.length, encrypted.length);
            target = entryFile(key);
            temporary = new File(target.getParentFile(), target.getName() + ".tmp");
            try (FileOutputStream output = new FileOutputStream(temporary)) {
                output.write(Base64.encode(packed, Base64.NO_WRAP));
                output.getFD().sync();
            }
            if (target.exists() && !target.delete()) throw new IllegalStateException("Could not replace secure value.");
            if (!temporary.renameTo(target)) throw new IllegalStateException("Could not commit secure value.");
            call.resolve(new JSObject().put("saved", true));
        } catch (Exception error) {
            if (temporary != null && temporary.exists()) temporary.delete();
            call.reject("Secure storage could not save this value.", error);
        }
    }

    @PluginMethod
    public synchronized void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.trim().isEmpty() || key.length() > 128) { call.reject("A valid key is required."); return; }
        try {
            File file = entryFile(key);
            JSObject result = new JSObject();
            if (!file.isFile()) { result.put("found", false); call.resolve(result); return; }
            byte[] encoded;
            try (FileInputStream input = new FileInputStream(file)) {
                encoded = new byte[(int) file.length()];
                int offset = 0, count;
                while (offset < encoded.length && (count = input.read(encoded, offset, encoded.length - offset)) > 0) offset += count;
                if (offset != encoded.length) throw new IllegalStateException("Stored secure value could not be read completely.");
            }
            byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
            if (packed.length < 13) throw new IllegalStateException("Stored secure value is invalid.");
            byte[] iv = java.util.Arrays.copyOfRange(packed, 0, 12);
            byte[] encrypted = java.util.Arrays.copyOfRange(packed, 12, packed.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            String value = new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
            result.put("found", true); result.put("value", value); call.resolve(result);
        } catch (Exception error) {
            call.reject("Secure storage could not read this value.", error);
        }
    }

    @PluginMethod
    public synchronized void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.trim().isEmpty() || key.length() > 128) { call.reject("A valid key is required."); return; }
        try {
            File file = entryFile(key);
            boolean removed = !file.exists() || file.delete();
            call.resolve(new JSObject().put("removed", removed));
        } catch (Exception error) { call.reject("Secure storage could not remove this value.", error); }
    }
}
