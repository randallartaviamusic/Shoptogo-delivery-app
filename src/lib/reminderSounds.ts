import type { ReminderSoundId } from "@/lib/subscriptions";

type AudioCtor = typeof AudioContext;

function audioContext() {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function tone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  volume: number,
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

/**
 * Reproduce el recordatorio elegido. Devuelve false si el navegador todavía
 * no habilitó el audio (hace falta un clic de la persona).
 */
export async function playReminderSound(
  sound: ReminderSoundId | string = "campana",
): Promise<boolean> {
  const ctx = audioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime + 0.02;

    if (sound === "alarma") {
      for (let index = 0; index < 3; index += 1) {
        const start = now + index * 0.42;
        tone(ctx, 880, start, 0.18, "square", 0.16);
        tone(ctx, 660, start + 0.2, 0.18, "square", 0.14);
      }
    } else if (sound === "suave") {
      tone(ctx, 523, now, 0.4, "triangle", 0.18);
      tone(ctx, 659, now + 0.34, 0.4, "triangle", 0.16);
      tone(ctx, 784, now + 0.68, 0.6, "triangle", 0.14);
    } else if (sound === "digital") {
      for (let index = 0; index < 4; index += 1) {
        tone(ctx, index % 2 === 0 ? 1245 : 1661, now + index * 0.12, 0.08, "square", 0.12);
      }
    } else {
      // Campana
      tone(ctx, 1046, now, 0.9, "sine", 0.22);
      tone(ctx, 1568, now + 0.04, 0.7, "sine", 0.1);
      tone(ctx, 523, now + 0.5, 0.9, "sine", 0.12);
    }

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 2600);
    return true;
  } catch {
    void ctx.close().catch(() => undefined);
    return false;
  }
}
