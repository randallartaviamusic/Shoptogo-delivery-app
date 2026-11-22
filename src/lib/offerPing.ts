let context: AudioContext | null = null;
let lastPing = 0;

/** Ping corto para ofertas cercanas: suena aunque el panel esté en silencio. */
export function playOfferPing() {
  try {
    if (typeof window === "undefined") return;
    if (Date.now() - lastPing < 4000) return;
    const Ctor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    if (!context || context.state === "closed") context = new Ctor();
    if (context.state === "suspended") void context.resume();
    lastPing = Date.now();
    const start = context.currentTime + 0.02;
    for (const [at, freq] of [
      [0, 880],
      [0.12, 1318.5],
    ] as Array<[number, number]>) {
      const voice = context.createOscillator();
      const gain = context.createGain();
      voice.type = "sine";
      voice.frequency.setValueAtTime(freq, start + at);
      gain.gain.setValueAtTime(0.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(0.22, start + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.18);
      voice.connect(gain);
      gain.connect(context.destination);
      voice.start(start + at);
      voice.stop(start + at + 0.22);
    }
  } catch {
    // Sin audio, la oferta igual queda visible en el panel.
  }
}
