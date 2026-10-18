// Optional sounds for court view: a horn when time runs out and a short cheer-chime for a win.
// Off unless someone turns them on for this screen. Made in the browser, no audio files.
const KEY = 'pbm-sound';

// screen: '' for court view on the main screen, '-tv' for the second-screen window
export const soundPref = (screen = ''): boolean => {
  try { return window.localStorage.getItem(KEY + screen) === '1'; } catch { return false; }
};

export const setSoundPref = (on: boolean, screen = '') => {
  try { window.localStorage.setItem(KEY + screen, on ? '1' : '0'); } catch { /* blocked */ }
};

let ctx: AudioContext | null = null;
const audio = (): AudioContext | null => {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
};

// Call from a tap so the browser lets this screen play sound later
export const unlockSound = () => { audio(); };

const tone = (c: AudioContext, freq: number, start: number, length: number, type: OscillatorType, volume: number) => {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  g.gain.setValueAtTime(volume, start + length - 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, start + length);
  o.connect(g).connect(c.destination);
  o.start(start);
  o.stop(start + length + 0.02);
};

export const playHorn = () => {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  tone(c, 220, t, 1.1, 'sawtooth', 0.18);
  tone(c, 277, t, 1.1, 'sawtooth', 0.12);
};

export const playWin = () => {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.12, 0.28, 'triangle', 0.2));
};
