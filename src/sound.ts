

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  return ctx;
}

function tone(at: number, freq: number, dur: number, gain: number) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const vol = a.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;

  vol.gain.setValueAtTime(0, at);
  vol.gain.linearRampToValueAtTime(gain, at + 0.012);
  vol.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  osc.connect(vol).connect(a.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function playNotification(enabled = true) {
  if (!enabled) return;
  const a = audio();
  if (!a) return;

  if (a.state === "suspended") void a.resume();

  const now = a.currentTime;
  tone(now, 987.77, 0.18, 0.16);
  tone(now + 0.085, 1318.51, 0.3, 0.13);
}
