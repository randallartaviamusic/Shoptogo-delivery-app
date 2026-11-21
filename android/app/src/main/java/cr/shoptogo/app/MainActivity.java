package cr.shoptogo.app;

import android.content.Context;
import android.media.AudioManager;
import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
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
}
