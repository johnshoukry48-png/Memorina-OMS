// A short, clear two-tone chime, synthesized in the browser (Web Audio
// API) — no external audio file needed, so there's nothing to license
// or host. Browsers only allow audio after the user has interacted with
// the page at least once (e.g. clicking to log in), which is already
// true by the time a notification can arrive.
let ctx: AudioContext | null = null;

function getContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    ctx = new AudioCtx();
  }
  return ctx;
}

function tone(frequency: number, startTime: number, duration: number, gainValue = 0.2) {
  const audioCtx = getContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainValue, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function playNotificationSound() {
  try {
    const audioCtx = getContext();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    tone(880, now, 0.18); // first note
    tone(1175, now + 0.14, 0.22); // second note, slightly higher — clear "ding-ding"
  } catch {
    // Audio can fail (no user interaction yet, browser policy, etc) —
    // never let a sound failure break the actual notification.
  }
}
