package cr.shoptogo.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.WebSettings;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public class MainActivity extends BridgeActivity {

    private static final String PREFS_NAME = "shop_to_go_permissions";
    private static final String KEY_PERMISSIONS_PROMPTED = "permissions_prompted";
    private static final int REQUEST_CODE_PERMISSIONS = 7421;

    private boolean permissionPromptChecked = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Plugin propio para guardar el correo y la contraseña cifrados en el
        // Keystore de Android.
        registerPlugin(CredentialStorePlugin.class);
        super.onCreate(savedInstanceState);

        // La splash es un video: permitimos que arranque con audio sin que el
        // usuario tenga que tocar la pantalla.
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings settings = getBridge().getWebView().getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
        }

        // El administrador pidió que la splash suene a volumen completo. Android
        // usa el volumen multimedia del teléfono, así que lo llevamos al máximo.
        AudioManager audioManager =
            (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null && !audioManager.isVolumeFixed()) {
            try {
                audioManager.setStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC),
                    0
                );
            } catch (SecurityException ignored) {
                // Algunos fabricantes bloquean el cambio de volumen.
            }
        }

        // Que los botones de volumen del teléfono controlen el audio del video.
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (permissionPromptChecked) return;
        permissionPromptChecked = true;
        maybeAskForPermissions();
    }

    /**
     * En el primer arranque después de instalar la app mostramos un cuadro con
     * un solo botón para pedir todos los permisos peligrosos que declara el
     * manifiesto: notificaciones, ubicación, cámara y fotos.
     */
    private void maybeAskForPermissions() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (prefs.getBoolean(KEY_PERMISSIONS_PROMPTED, false)) return;

        String[] permissions = getRuntimePermissions();
        if (permissions.length == 0 || hasAllPermissions(permissions)) {
            prefs.edit().putBoolean(KEY_PERMISSIONS_PROMPTED, true).apply();
            return;
        }

        new AlertDialog.Builder(this, R.style.ShopToGoDialog)
            .setTitle("Permisos de Shop To Go")
            .setMessage(
                "Para que la app funcione completa, permití notificaciones, "
                    + "ubicación, cámara y fotos. Tocá Permitir todo y aceptá "
                    + "cada permiso del teléfono. Si tocás Ahora no, podés "
                    + "activarlos después desde Ajustes."
            )
            .setPositiveButton("Permitir todo", (dialog, which) -> {
                prefs.edit().putBoolean(KEY_PERMISSIONS_PROMPTED, true).apply();
                ActivityCompat.requestPermissions(
                    this,
                    permissions,
                    REQUEST_CODE_PERMISSIONS
                );
            })
            .setNegativeButton("Ahora no", (dialog, which) ->
                prefs.edit().putBoolean(KEY_PERMISSIONS_PROMPTED, true).apply()
            )
            .setCancelable(false)
            .show();
    }

    private String[] getRuntimePermissions() {
        List<String> permissions = new ArrayList<>();
        permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        permissions.add(Manifest.permission.CAMERA);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
            permissions.add(Manifest.permission.READ_MEDIA_IMAGES);
        } else {
            permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        return permissions.toArray(new String[0]);
    }

    private boolean hasAllPermissions(String[] permissions) {
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission)
                != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        @NonNull String[] permissions,
        @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_CODE_PERMISSIONS) return;
        if (isFinishing() || isDestroyed()) return;

        Set<String> deniedLabels = new LinkedHashSet<>();
        for (int i = 0; i < permissions.length; i++) {
            boolean granted = i < grantResults.length
                && grantResults[i] == PackageManager.PERMISSION_GRANTED;
            if (!granted) {
                deniedLabels.add(permissionLabel(permissions[i]));
            }
        }

        if (deniedLabels.isEmpty()) {
            Toast.makeText(this, "Permisos activados", Toast.LENGTH_SHORT).show();
            return;
        }

        StringBuilder labels = new StringBuilder();
        for (String label : deniedLabels) {
            if (labels.length() > 0) labels.append(", ");
            labels.append(label);
        }

        new AlertDialog.Builder(this, R.style.ShopToGoDialog)
            .setTitle("Faltan permisos")
            .setMessage(
                "Para activar todo, entrá a Ajustes y permití: "
                    + labels
                    + "."
            )
            .setPositiveButton("Abrir ajustes", (dialog, which) -> openAppSettings())
            .setNegativeButton("Cerrar", null)
            .show();
    }

    private String permissionLabel(String permission) {
        switch (permission) {
            case Manifest.permission.ACCESS_FINE_LOCATION:
            case Manifest.permission.ACCESS_COARSE_LOCATION:
                return "Ubicación";
            case Manifest.permission.CAMERA:
                return "Cámara";
            case Manifest.permission.POST_NOTIFICATIONS:
                return "Notificaciones";
            case Manifest.permission.READ_MEDIA_IMAGES:
            case Manifest.permission.READ_EXTERNAL_STORAGE:
                return "Fotos";
            default:
                return permission;
        }
    }

    private void openAppSettings() {
        try {
            Intent intent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getPackageName(), null)
            );
            startActivity(intent);
        } catch (Exception ignored) {
            // Algunos fabricantes no tienen esa pantalla: abrimos Ajustes.
            try {
                startActivity(new Intent(Settings.ACTION_SETTINGS));
            } catch (Exception ignoredAgain) {
                Toast.makeText(
                    this,
                    "Abrí Ajustes > Apps > Shop To Go > Permisos",
                    Toast.LENGTH_LONG
                ).show();
            }
        }
    }
}
