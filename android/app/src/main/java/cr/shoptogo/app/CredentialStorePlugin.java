package cr.shoptogo.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Guarda el correo y la contraseña del inicio de sesión cifrados con una clave
 * del Keystore de Android. La contraseña nunca queda en texto plano en el
 * teléfono ni se sube a ningún servidor.
 */
@CapacitorPlugin(name = "CredentialStore")
public class CredentialStorePlugin extends Plugin {

    private static final String PREFS = "shop_to_go_credentials";
    private static final String KEY_ALIAS = "shop_to_go_credentials_key";
    private static final String KEY_IV = "iv";
    private static final String KEY_DATA = "data";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    @PluginMethod
    public void save(PluginCall call) {
        String email = call.getString("email");
        String password = call.getString("password");
        if (email == null || password == null) {
            call.reject("Faltan el correo o la contraseña");
            return;
        }

        try {
            putCredentials(getContext(), email, password);
            call.resolve();
        } catch (Exception error) {
            call.reject("No pudimos guardar los datos", error);
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            String[] credentials = getCredentials(getContext());
            if (credentials == null) {
                call.resolve();
                return;
            }

            JSObject result = new JSObject();
            result.put("email", credentials[0]);
            result.put("password", credentials[1]);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No pudimos leer los datos guardados", error);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        prefs(getContext()).edit().clear().apply();
        call.resolve();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);

        if (!keyStore.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                ANDROID_KEYSTORE
            );
            generator.init(
                new KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            );
            generator.generateKey();
        }

        KeyStore.SecretKeyEntry entry =
            (KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null);
        return entry.getSecretKey();
    }

    private static void putCredentials(
        Context context,
        String email,
        String password
    ) throws Exception {
        JSONObject json = new JSONObject();
        json.put("email", email);
        json.put("password", password);

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(
            json.toString().getBytes(StandardCharsets.UTF_8)
        );

        prefs(context)
            .edit()
            .putString(KEY_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
            .putString(
                KEY_DATA,
                Base64.encodeToString(encrypted, Base64.NO_WRAP)
            )
            .apply();
    }

    private static String[] getCredentials(Context context) throws Exception {
        SharedPreferences preferences = prefs(context);
        String encodedIv = preferences.getString(KEY_IV, null);
        String encodedData = preferences.getString(KEY_DATA, null);
        if (encodedIv == null || encodedData == null) return null;

        try {
            byte[] iv = Base64.decode(encodedIv, Base64.NO_WRAP);
            byte[] data = Base64.decode(encodedData, Base64.NO_WRAP);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(
                Cipher.DECRYPT_MODE,
                key(),
                new GCMParameterSpec(128, iv)
            );
            byte[] decrypted = cipher.doFinal(data);

            JSONObject json = new JSONObject(
                new String(decrypted, StandardCharsets.UTF_8)
            );
            return new String[] {
                json.getString("email"),
                json.getString("password"),
            };
        } catch (Exception error) {
            // Si se restauró un backup sin la clave o los datos están rotos,
            // borramos lo guardado para no quedar trabados.
            preferences.edit().clear().apply();
            return null;
        }
    }
}
