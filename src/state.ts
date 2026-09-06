// Shared mutable game state + level/screen transitions. Imported by main, input, render, audio.
import { mkEls, isSolved, type El } from './elements.ts';
import { LEVELS, DEMO } from './levels.ts';
import type { Ray } from './trace.ts';

/** Screens. */
export const TITLE = 0, INTRO = 1, PLAY = 2, SOLVED = 3, ENDING = 4;

export const G = {
  _scr: TITLE,
  _li: 0,                         // level index
  _els: [] as El[],
  _sel: undefined as El | undefined,
  _rays: [] as Ray[],
  _t: 0,                          // now (s)
  _since: 0,                      // time of the last screen change (s)
  _start: 0,                      // time the current level started (s)
  _tot: 0,                        // total solving time (s), shown on the ending
  _touch: false,                  // last pointer was a touch -> show mobile rotate buttons, inflate hit areas
  _mute: false,
  _best: 0,                       // highest level index reached (persisted)
  _view: [1, 0, 0, 0],            // canvas transform: scale, offsetX, offsetY (CSS px), rotated (1 = portrait view turned 90 degrees)
  _mode: 0,                       // pointer mode: 0 idle, 1 move, 2 rotate/aim
  _hold: 0,                       // mobile rotate button held: -1 / +1
  _parts: [] as number[][],       // particles [x, y, vx, vy, life, r, g, b]
  _solvedMask: 0,                 // OR of incident masks of satisfied flowers (drives band tones)
};

export function save() {
  try { localStorage.nu = G._best + ',' + (G._mute ? 1 : 0); } catch { /* storage may be unavailable */ }
}
export function load() {
  try {
    const v = (localStorage.nu || '').split(',');
    G._best = Math.min(+v[0] || 0, LEVELS.length - 1);
    G._mute = v[1] === '1';
  } catch { /* ignore */ }
}

export function loadLevel(i: number) {
  G._li = i;
  G._els = mkEls(LEVELS[i]);
  G._sel = undefined;
  G._mode = G._hold = 0;
  G._scr = PLAY;
  G._since = G._start = G._t;
  if (i > G._best) { G._best = i; save(); }
}

export function goto(scr: number) {
  if (scr === TITLE) {
    if (G._scr === ENDING) G._tot = 0;  // a replay after the ending starts its clock afresh
    G._els = mkEls(DEMO);               // title/intro backdrop: the unicorn's beam through a prism
  }
  G._scr = scr;
  G._since = G._t;
  G._sel = undefined;
  G._mode = G._hold = 0;
}

/** Tap / Enter on a non-play screen. `cont` = the title's Continue button was hit. */
export function advance(cont?: boolean) {
  const s = G._scr;
  if (s === TITLE) { if (cont && G._best) loadLevel(G._best); else { G._tot = 0; goto(INTRO); } }
  else if (s === INTRO) { G._tot = 0; loadLevel(0); }
  else if (s === SOLVED) { if (G._li + 1 < LEVELS.length) loadLevel(G._li + 1); else goto(ENDING); }
  else if (s === ENDING) goto(TITLE);
}

export function checkSolved() {
  if (G._scr === PLAY && !G._mode && isSolved(G._els)) {
    G._tot += G._t - G._start;
    goto(SOLVED);
    const n = G._li + 1; // progress counts the level as reached once the previous one is solved (Esc / close on the banner is safe)
    if (n < LEVELS.length && n > G._best) { G._best = n; save(); }
    return true;
  }
  return false;
}
