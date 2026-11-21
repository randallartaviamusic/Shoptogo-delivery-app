/**
 * Campanita de pedido nuevo: una melodía juguetona de unos 5 segundos,
 * sintetizada en el navegador para no depender de un archivo de audio.
 *
 * Suena sólo con la app abierta: cuando llega un push con la app cerrada, el
 * sistema operativo reproduce el sonido de notificación que eligió la persona
 * (los navegadores no permiten imponer un audio propio en segundo plano).
 */

type Note = {
  at: number;
  freq: number;
  dur: number;
  gain: number;
  /** Segunda voz una octava arriba, como el brillo de una marimba. */
  shimmer?: number;
};

const MELODY: Note[] = [
  { at: 0.0, freq: 523.25, dur: 0.24, gain: 0.16, shimmer: 0.05 },
  { at: 0.16, freq: 659.25, dur: 0.24, gain: 0.16, shimmer: 0.05 },
  { at: 0.32, freq: 783.99, dur: 0.26, gain: 0.17, shimmer: 0.05 },
  { at: 0.48, freq: 1046.5, dur: 0.62, gain: 0.18, shimmer: 0.06 },
  { at: 1.18, freq: 880.0, dur: 0.2, gain: 0.12 },
  { at: 1.34, freq: 1046.5, dur: 0.2, gain: 0.13 },
  { at: 1.52, freq: 1318.51, dur: 0.6, gain: 0.15, shimmer: 0.05 },
  { at: 2.22, freq: 987.77, dur: 0.18, gain: 0.11 },
  { at: 2.38, freq: 1174.66, dur: 0.18, gain: 0.11 },
  { at: 2.54, freq: 1567.98, dur: 0.18, gain: 0.12 },
  { at: 2.7, freq: 1318.51, dur: 0.22, gain: 0.11 },
  { at: 3.02, freq: 1567.98, dur: 0.16, gain: 0.07 },
  { at: 3.18, freq: 2093.0, dur: 0.3, gain: 0.06 },
  { at: 3.58, freq: 1046.5, dur: 1.3, gain: 0.16, shimmer: 0.05 },
  { at: 3.58, freq: 1318.51, dur: 1.3, gain: 0.1 },
  { at: 3.58, freq: 1567.98, dur: 1.3, gain: 0.08 },
];

let shared: AudioContext | null = null;
let lastPlayedAt = 0;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!shared || shared.state === "closed") shared = new Ctor();
  return shared;
}

/**
 * `force` ignora el antiduplicado: lo usa el botón "Probar sonido".
 * El antiduplicado evita que el aviso en vivo y el push suenen dos veces.
 */
export function playOrderChime({ force = false }: { force?: boolean } = {}) {
  try {
    if (!force && Date.now() - lastPlayedAt < 5000) return;
    const audio = context();
    if (!audio) return;
    lastPlayedAt = Date.now();

    if (audio.state === "suspended") void audio.resume();

    const master = audio.createGain();
    master.gain.value = 0.55;
    master.connect(audio.destination);
    const start = audio.currentTime + 0.04;

    for (const note of MELODY) {
      const at = start + note.at;

      const voice = audio.createOscillator();
      const envelope = audio.createGain();
      voice.type = "triangle";
      voice.frequency.setValueAtTime(note.freq, at);
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(note.gain, at + 0.015);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + note.dur);
      voice.connect(envelope);
      envelope.connect(master);
      voice.start(at);
      voice.stop(at + note.dur + 0.05);

      if (note.shimmer) {
        const sparkle = audio.createOscillator();
        const sparkleGain = audio.createGain();
        sparkle.type = "sine";
        sparkle.frequency.setValueAtTime(note.freq * 2, at);
        sparkleGain.gain.setValueAtTime(0.0001, at);
        sparkleGain.gain.exponentialRampToValueAtTime(
          note.shimmer,
          at + 0.01,
        );
        sparkleGain.gain.exponentialRampToValueAtTime(0.0001, at + note.dur);
        sparkle.connect(sparkleGain);
        sparkleGain.connect(master);
        sparkle.start(at);
        sparkle.stop(at + note.dur + 0.05);
      }
    }
  } catch {
    /* si el navegador bloquea el audio, el aviso visual sigue funcionando */
  }
}
