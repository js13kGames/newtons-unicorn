// Shared mutable game state + level/screen transitions. Imported by main, input, render, audio.
import { mkEls, isSolved, PRISM, MIRROR, WALL, DEG, type El } from './elements.ts';
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
  _dirty: true,                   // geometry changed since the last trace (drag, rotate, level/screen change, resize)
  _moved: false,                  // a drag / rotate happened in this level (ends the level-start wiggle; survives R)
  _lk: undefined as El | undefined, // fixed optical piece that was clicked (draw-only shake + padlock)
  _lkT: 0,                        // time of that click (s)
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
  G._sel = G._lk = undefined;
  G._moved = false;
  G._mode = G._hold = 0;
  G._dirty = true;
  G._scr = PLAY;
  okSince = -1;
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
  G._dirty = true;
}

/** Tap / Enter on a non-play screen. `cont` = the title's Continue button was hit. */
export function advance(cont?: boolean) {
  const s = G._scr;
  if (s === TITLE) { if (cont && G._best) loadLevel(G._best); else { G._tot = 0; goto(INTRO); } }
  else if (s === INTRO) { G._tot = 0; loadLevel(0); }
  else if (s === SOLVED) { if (G._li + 1 < LEVELS.length) loadLevel(G._li + 1); else goto(ENDING); }
  else if (s === ENDING) goto(TITLE);
}

/** Soft snap: within 8 px / 2 deg (modulo the element's symmetry) of the authored solution -> snap exactly. */
export function snap(e: El) {
  const sol = LEVELS[G._li][3], i = G._els.indexOf(e);
  for (let k = 0; k < sol.length; k += 4) if (sol[k] === i) {
    const per = e._t === PRISM ? 120 : e._t >= MIRROR && e._t <= WALL ? 180 : 360;
    const da = ((e._a / DEG - sol[k + 3]) % per + per * 1.5) % per - per / 2;
    if (Math.abs(e._x - sol[k + 1]) <= 8 && Math.abs(e._y - sol[k + 2]) <= 8 && Math.abs(da) <= 2) {
      e._x = sol[k + 1]; e._y = sol[k + 2]; e._a -= da * DEG;
      G._dirty = true;
      if (G._touch) navigator.vibrate?.(8); // haptic click on snap (touch only; no-op where unsupported)
    }
  }
}

let okSince = -1; // time every flower became lit (-1 while any is dark)
/** Solve when every flower is lit and either no drag / rotate gesture is active or the configuration has held for 0.4 s under the
 *  pointer. A held solve snaps the dragged piece and ends the gesture (goto clears _mode / _hold / _sel; every pointer handler is
 *  gated on them, so the pending pointerup and later pointermoves do nothing). A release with everything lit solves at once. */
export function checkSolved() {
  if (G._scr !== PLAY) return false;
  if (!isSolved(G._els)) { okSince = -1; return false; }
  if (okSince < 0) okSince = G._t;
  if (G._mode) { if (G._t - okSince < 0.4) return false; if (G._sel) snap(G._sel); }
  G._tot += G._t - G._start;
  goto(SOLVED);
  const n = G._li + 1; // progress counts the level as reached once the previous one is solved (Esc / close on the banner is safe)
  if (n < LEVELS.length && n > G._best) { G._best = n; save(); }
  return true;
}
