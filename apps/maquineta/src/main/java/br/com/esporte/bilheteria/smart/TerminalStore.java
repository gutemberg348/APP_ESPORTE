package br.com.esporte.bilheteria.smart;

import android.content.*;
import android.security.keystore.*;
import android.util.Base64;
import java.io.IOException;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

final class TerminalStore {
    private final SharedPreferences prefs;
    TerminalStore(Context context) { prefs = context.getSharedPreferences("terminal", Context.MODE_PRIVATE); }
    JSONObject pending() throws Exception {
        String record = prefs.getString("attempt", null);
        return record == null ? null : new JSONObject(record);
    }
    void save(JSONObject record) throws IOException {
        SharedPreferences.Editor e = prefs.edit();
        if (record == null) e.remove("attempt"); else e.putString("attempt", record.toString());
        if (!e.commit()) throw new IOException("Falha ao salvar a operação no terminal.");
    }
    private SecretKey deviceKey() throws Exception {
        String alias = "bilheteria.provisionamento";
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(alias)) return (SecretKey)ks.getKey(alias, null);
        KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    boolean provisioned() { return prefs.contains("provision"); }
    JSONObject protectDraft(JSONObject body) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, deviceKey());
        return CounterApi.obj("nonce", Base64.encodeToString(c.getIV(), Base64.NO_WRAP),
            "data", Base64.encodeToString(c.doFinal(body.toString().getBytes("UTF-8")), Base64.NO_WRAP));
    }
    JSONObject readDraft(JSONObject envelope) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, deviceKey(), new GCMParameterSpec(128, Base64.decode(envelope.getString("nonce"), Base64.NO_WRAP)));
        return new JSONObject(new String(c.doFinal(Base64.decode(envelope.getString("data"), Base64.NO_WRAP)), "UTF-8"));
    }
    String readKey() throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, deviceKey(), new GCMParameterSpec(128, Base64.decode(prefs.getString("iv",""), Base64.NO_WRAP)));
        return new String(c.doFinal(Base64.decode(prefs.getString("provision",""), Base64.NO_WRAP)), "UTF-8");
    }
    void provision(String token) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, deviceKey());
        if (!prefs.edit().putString("iv", Base64.encodeToString(c.getIV(), Base64.NO_WRAP))
            .putString("provision", Base64.encodeToString(c.doFinal(token.getBytes("UTF-8")), Base64.NO_WRAP)).commit())
            throw new IOException("Falha ao habilitar a maquineta.");
    }
}
