// Procedural WebAudio: band tones, solve fanfare, ZzFX-style SFX, a tiny step sequencer, compressor, mute.
// Every call is a safe no-op until unlock().
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

// Music: C major, 76 BPM, 4 bars of I-V-vi-IV (C, G, Am, F), looping. Chord tones kept in C3..B3, an octave below
// the band tones so the flower chord stays distinct. Bass = one sine root per bar; arpeggio = 8 eighths per bar
// walking the chord tones in the order ARP; sparkle = C6 on beat 1 of bars 1 and 3.
const CHORD = [[130.81, 164.81, 196], [196, 246.94, 146.83], [220, 130.81, 164.81], [174.61, 220, 130.81]];
const ROOT = [65.41, 98, 110, 87.31];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
const STEP = 60 / 76 / 2; // one eighth note, seconds

let ac: AudioContext | undefined, master: GainNode, music: GainNode, bass: BiquadFilterNode, arp: BiquadFilterNode;
let gains: GainNode[] = [], cur = 0, nextT = 0, step = 0;
const last: number[] = [];

/** oscillator -> gain -> dest, started at t. */
function osc(type: OscillatorType, f: number, g: number, dest: AudioNode = master, t = 0) {
  const o = ac!.createOscillator(), gn = ac!.createGain();
  o.type = type; o.frequency.value = f; gn.gain.value = g;
  o.connect(gn).connect(dest); o.start(t);
  return [o, gn] as const;
}
/** One enveloped note: linear attack `atk`, exponential decay (time constant `tau`), stopped after `dur`. */
function note(type: OscillatorType, f: number, peak: number, dest: AudioNode, t: number, atk: number, tau: number, dur: number) {
  const [o, g] = osc(type, f, 0, dest, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.setTargetAtTime(0, t + atk, tau);
  o.stop(t + dur);
}
function lowpass(f: number) {
  const lp = ac!.createBiquadFilter();
  lp.frequency.value = f;
  lp.connect(music);
  return lp;
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
  // master -> compressor -> out, so seven band tones + fanfare + music cannot clip
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = .005; comp.release.value = .15;
  comp.connect(ac.destination);
  master = ac.createGain();
  master.gain.value = G._mute ? 0 : 1;
  master.connect(comp);
  music = ac.createGain();
  music.connect(master);
  bass = lowpass(300); arp = lowpass(1200);
  gains = NOTE.map(f => osc(TRI, f, 0)[1]);
  nextT = ac.currentTime + .1;
}

/** Sequencer: called every frame; schedules notes 0.25 s ahead on the audio clock. */
export function tickMusic() {
  if (!ac) return;
  const now = ac.currentTime;
  if (nextT < now - 1) nextT = now; // tab was hidden: do not burst-play the backlog
  while (nextT < now + .25) {
    const bar = step >> 3 & 3, i = step & 7, t = nextT;
    if (!i) note('sine', ROOT[bar], .05, bass, t, .02, .9, STEP * 8);
    note(TRI, CHORD[bar][ARP[i]], .03, arp, t, .01, .12, STEP * 1.5);
    if (!i && !(bar & 1)) note('sine', 1046.5, .015, music, t, .01, .3, 1);
    step++; nextT += STEP;
  }
}

/** One-shot SFX, at most one identical sound per 40 ms. */
export function sfx(id: number) {
  if (!ac || ac.currentTime - last[id] < .04) return;
  last[id] = ac.currentTime;
  const s = ac.createBufferSource();
  s.buffer = zz(PRESET[id]);
  s.connect(master); s.start();
}

/** Sustain the band tones in `mask` (bits R=1..V=64), release the rest; duck the music while any tone is on. */
export function setTones(mask: number) {
  if (!ac || mask === cur) return;
  cur = mask;
  const t = ac.currentTime;
  gains.forEach((g, i) => {
    const on = mask >> i & 1;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(on ? LEVEL : 0, t, on ? .02 : .07);
  });
  music.gain.setTargetAtTime(mask ? .55 : 1, t, .1);
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

/** Ramp the master gain to 0 / 1 over ~50 ms (covers tones, SFX and music). */
export function setMute(m: boolean) {
  if (ac) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, .017);
}
