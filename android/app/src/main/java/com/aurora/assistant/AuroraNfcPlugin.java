package com.aurora.assistant;

import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;
import android.os.Bundle;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.Charset;
import java.util.Locale;

/** Foreground-only NFC reader/writer. A write is armed by an explicit user action. */
@CapacitorPlugin(name = "AuroraNfc")
public class AuroraNfcPlugin extends Plugin {
    private NfcAdapter adapter;
    private String pendingWriteText;
    private boolean readerActive = false;

    @PluginMethod public void getNfcStatus(PluginCall call) {
        adapter = NfcAdapter.getDefaultAdapter(getContext());
        call.resolve(new JSObject().put("available", adapter != null)
            .put("enabled", adapter != null && adapter.isEnabled())
            .put("readerActive", readerActive).put("foregroundOnly", true));
    }

    @PluginMethod public void startNfcReader(PluginCall call) {
        pendingWriteText = null;
        startReader(call);
    }

    @PluginMethod public void armNfcTextWrite(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty() || text.length() > 1200) {
            call.reject("Enter text between 1 and 1200 characters before writing an NFC tag.");
            return;
        }
        pendingWriteText = text;
        startReader(call);
    }

    private void startReader(PluginCall call) {
        adapter = NfcAdapter.getDefaultAdapter(getContext());
        if (adapter == null) { pendingWriteText = null; call.reject("This device does not have NFC hardware."); return; }
        if (!adapter.isEnabled()) { pendingWriteText = null; call.reject("Turn on NFC in Android Settings first."); return; }
        if (getActivity() == null || getActivity().isFinishing()) { pendingWriteText = null; call.reject("Open AURORA to use NFC."); return; }
        try {
            adapter.enableReaderMode(getActivity(), this::onTagDiscovered,
                NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V,
                new Bundle());
            readerActive = true;
            call.resolve(new JSObject().put("started", true).put("writeArmed", pendingWriteText != null).put("foregroundOnly", true));
        } catch (Exception error) { pendingWriteText = null; call.reject("Could not start NFC reader mode.", error); }
    }

    private void onTagDiscovered(Tag tag) {
        String uid = tag.getId() == null ? "" : bytesToHex(tag.getId());
        String[] technologies = tag.getTechList();
        if (pendingWriteText != null) {
            writeTextTag(tag, uid);
            return;
        }
        JSObject event = new JSObject();
        event.put("uid", uid);
        event.put("technologies", new org.json.JSONArray(technologies));
        event.put("readOnlyMetadata", true);
        try {
            Ndef ndef = Ndef.get(tag);
            if (ndef != null) {
                ndef.connect();
                NdefMessage message = ndef.getNdefMessage();
                if (message != null) {
                    org.json.JSONArray records = new org.json.JSONArray();
                    for (NdefRecord record : message.getRecords()) {
                        if (record.getTnf() == NdefRecord.TNF_WELL_KNOWN && java.util.Arrays.equals(record.getType(), NdefRecord.RTD_TEXT)) {
                            byte[] payload = record.getPayload();
                            if (payload.length > 1) {
                                int languageLength = payload[0] & 0x3f;
                                if (languageLength < payload.length) records.put(new String(payload, 1 + languageLength, payload.length - 1 - languageLength, Charset.forName("UTF-8")));
                            }
                        }
                    }
                    event.put("textRecords", records);
                }
                ndef.close();
            }
        } catch (Exception error) { event.put("readError", "Tag could not be read as NDEF."); }
        notifyListeners("nfcTagDiscovered", event);
    }

    private void writeTextTag(Tag tag, String uid) {
        String text = pendingWriteText;
        pendingWriteText = null;
        JSObject event = new JSObject().put("uid", uid);
        try {
            Ndef ndef = Ndef.get(tag);
            if (ndef == null) throw new IllegalStateException("This tag is not NDEF-formatted.");
            byte[] language = Locale.getDefault().getLanguage().getBytes(Charset.forName("US-ASCII"));
            byte[] value = text.getBytes(Charset.forName("UTF-8"));
            byte[] payload = new byte[1 + language.length + value.length];
            payload[0] = (byte) language.length;
            System.arraycopy(language, 0, payload, 1, language.length);
            System.arraycopy(value, 0, payload, 1 + language.length, value.length);
            NdefRecord record = new NdefRecord(NdefRecord.TNF_WELL_KNOWN, NdefRecord.RTD_TEXT, new byte[0], payload);
            NdefMessage message = new NdefMessage(new NdefRecord[]{record});
            ndef.connect();
            if (!ndef.isWritable()) throw new IllegalStateException("This NFC tag is read-only.");
            if (message.toByteArray().length > ndef.getMaxSize()) throw new IllegalStateException("The text is too large for this NFC tag.");
            ndef.writeNdefMessage(message);
            ndef.close();
            event.put("written", true);
        } catch (Exception error) { event.put("written", false); event.put("error", error.getMessage() == null ? "NFC write failed." : error.getMessage()); }
        notifyListeners("nfcWriteResult", event);
        stopReaderInternal();
    }

    @PluginMethod public void stopNfcReader(PluginCall call) {
        stopReaderInternal();
        call.resolve(new JSObject().put("stopped", true));
    }
    private void stopReaderInternal() {
        try { if (adapter != null && getActivity() != null) adapter.disableReaderMode(getActivity()); } catch (Exception ignored) {}
        readerActive = false; pendingWriteText = null;
    }
    @Override protected void handleOnPause() { stopReaderInternal(); super.handleOnPause(); }
    @Override protected void handleOnResume() { super.handleOnResume(); }
    @Override protected void handleOnDestroy() { stopReaderInternal(); super.handleOnDestroy(); }
    private String bytesToHex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02X", value));
        return result.toString();
    }
}
