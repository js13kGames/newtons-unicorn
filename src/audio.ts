// Procedural WebAudio: band tones, solve fanfare, ZzFX-style SFX, ambient pad, mute. Every call is a safe no-op until unlock().
// The SFX synth is a trimmed port of ZzFX - Zuper Zmall Zound Zynth. MIT License, Copyright (c) 2019 Frank Force
// (https://github.com/KilledByAPixel/ZzFX).
import { G } from './state.ts';

export const SFX_PICK = 0, SFX_DROP = 1, SFX_TICK = 2, SFX_WRONG = 3, SFX_CLICK = 4, SFX_WHOOSH = 5;

/** Band pitches R..V = C4..B4 (higher optical frequency -> higher pitch). */
const NOTE = [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88];
const TRI = 'triangle', LEVEL = 0.07 / Math.sqrt(7);
/** ZzFX presets: [volume, randomness, frequency, attack, sustain, release, shape (0 sin, 1 tri, 2 saw), shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise]. */
const PRESET = [
  [.3, .05, 440, .01, .04, .12, 0, 1, 0, 0, 220, .04],  // pick up: two-step rising blip (A4 -> E5)
  [.3, .05, 330, .01, .05, .15, 1, 1, -2],              // drop: soft falling triangle
  [.06, .1, 1800, 0, .005, .02],                        // rotate tick: 25 ms sine pip, quiet
  [.15, .05, 180, .01, .1, .2, 1, 1, 0, 0, -40, .1],    // wrong color: soft low two-tone bonk
  [.2, .05, 900, 0, .01, .05, 0, 1, -8],                // UI click
  [.3, .1, 300, .15, .1, .4, 0, 1, 5, 0, 0, 0, 0, 2],   // level start: rising noisy whoosh
];

let ac: AudioContext | undefined, master: GainNode, gains: GainNode[] = [], cur = 0;
const last: number[] = [];

/** oscillator -> gain -> dest, started at t. */
function osc(type: OscillatorType, f: number, g: number, dest: AudioNode | AudioParam = master, t = 0) {
  const o = ac!.createOscillator(), gn = ac!.createGain();
  o.type = type; o.frequency.value = f; gn.gain.value = g;
  o.connect(gn).connect(dest as AudioNode); o.start(t);
  return [o, gn] as const;
}

/** Render a ZzFX preset into an AudioBuffer at the context sample rate. */
function zz(p: number[]) {
  const R = ac!.sampleRate, P = Math.PI * 2;
  let [vol, rnd, b, e, r, t, q = 0, D = 1, u = 0, y = 0, v = 0, z = 0, l = 0, E = 0] = p;
  b *= (1 - rnd + 2 * rnd * Math.random()) * P / R;
  u *= 500 * P / R / R; y *= 500 * P / R / R / R; v *= P / R;
  e = e * R + 9; r *= R; t *= R; z *= R; l = l * R | 0;
  const b0 = b, u0 = u, n = e + r + t | 0, buf = ac!.createBuffer(1, n, R), d = buf.getChannelData(0);
  for (let i = 0, g = 0, j = 1, f = 0; i < n; i++) {
    f = q > 1 ? 1 - (2 * g / P % 2 + 2) % 2 : q ? 1 - 4 * Math.abs(Math.round(g / P) - g / P) : Math.sin(g);
    d[i] = vol * Math.sign(f) * Math.abs(f) ** D * (i < e ? i / e : i < e + r ? 1 : (n - i) / t);
    g += (b += u += y) * (1 + E * Math.sin(i ** 5));
    if (j && ++j > z) { b += v; j = 0; }
    if (l && !(i % l)) { b = b0; u = u0; j = 1; }
  }
  return buf;
}

/** Create the AudioContext on the first gesture (resume it on later ones). Safe if WebAudio is unavailable. */
export function unlock() {
  if (ac) { if (ac.state !== 'running') ac.resume(); return; }
  try { ac = new AudioContext(); } catch { return; }
  master = ac.createGain();
  master.gain.value = G._mute ? 0 : 1;
  master.connect(ac.destination);
  gains = NOTE.map(f => osc(TRI, f, 0)[1]);
  // ambient pad: C2 sine + G2 triangle -> low-pass around 400 Hz, swept +-200 Hz by a 0.1 Hz LFO
  const lp = ac.createBiquadFilter();
  lp.frequency.value = 400;
  lp.connect(master);
  osc('sine', 65.41, .03, lp); osc(TRI, 98, .03, lp);
  osc('sine', .1, 200, lp.frequency);
}

/** One-shot SFX, at most one identical sound per 40 ms. */
export function sfx(id: number) {
  if (!ac || ac.currentTime - last[id] < .04) return;
  last[id] = ac.currentTime;
  const s = ac.createBufferSource();
  s.buffer = zz(PRESET[id]);
  s.connect(master); s.start();
}

/** Sustain the band tones in `mask` (bits R=1..V=64), release the rest. */
export function setTones(mask: number) {
  if (!ac || mask === cur) return;
  cur = mask;
  const t = ac.currentTime;
  gains.forEach((g, i) => {
    const on = mask >> i & 1;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(on ? LEVEL : 0, t, on ? .02 : .07);
  });
}

/** Solve arpeggio: the lit notes ascending, then C5; 60 ms per step, the last note held ~1 s. */
export function fanfare(mask: number) {
  if (!ac) return;
  const notes = NOTE.filter((_, i) => mask >> i & 1).concat(523.25);
  let t = ac.currentTime;
  notes.forEach((f, i) => {
    const hold = i < notes.length - 1 ? .05 : .9, [o, g] = osc(TRI, f, 0, master, t);
    g.gain.setTargetAtTime(.1, t, .005);
    g.gain.setTargetAtTime(0, t + hold, .05);
    o.stop(t + hold + .3);
    t += .06;
  });
}

/** Ramp the master gain to 0 / 1 over ~50 ms. */
export function setMute(m: boolean) {
  if (ac) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, .017);
}
