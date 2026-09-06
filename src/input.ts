// Pointer Events (mouse + touch share one vocabulary), keyboard, HUD buttons, mobile rotate buttons, soft snap.
import { G, PLAY, TITLE, INTRO, SOLVED, loadLevel, goto, advance, save } from './state.ts';
import { pick, handlePos, MOVE, ROT, EMITTER, PRISM, MIRROR, WALL, W, H, DEG, type El } from './elements.ts';
import { LEVELS } from './levels.ts';
import { unlock, sfx, setMute, SFX_PICK, SFX_DROP, SFX_TICK, SFX_CLICK, SFX_WHOOSH } from './audio.ts';

/** HUD buttons (top-right): 0 title, 1 mute, 2 reset. */
export const HUD: number[][] = [[W - 30, 28], [W - 76, 28], [W - 122, 28]];
/** Mobile rotate buttons (lower corners, the left one clear of the unicorn): 0 counter-clockwise, 1 clockwise. */
export const MB: number[][] = [[150, H - 64], [W - 64, H - 64]];
export const MB_R = 38;

const near = (x: number, y: number, p: number[], r: number) => Math.hypot(x - p[0], y - p[1]) < r;
/** Hit radius that is at least 22 CSS px on any screen (buttons are 44 px targets even when the game is scaled down). */
const hitR = (r: number) => Math.max(r, 22 / G._view[0]);

/** Client -> logical coordinates through the letterbox (G._view = [scale, ox, oy, rotated]); the portrait view is turned 90 degrees. */
export const toLogical = (cx: number, cy: number): [number, number] => {
  const v = G._view;
  return v[3] ? [480 + (cy - v[2]) / v[0], 270 - (cx - v[1]) / v[0]] : [(cx - v[1]) / v[0], (cy - v[2]) / v[0]];
};

/** DEV playtest counters for the current level: [resets, pointer gestures]. Logged by main.ts on every solve. */
export const stat = [0, 0];

export function toggleMute() { G._mute = !G._mute; setMute(G._mute); save(); }
export function resetLevel() { const s = G._start; loadLevel(G._li); G._start = s; sfx(SFX_WHOOSH); if (DEV) stat[0]++; }

let lastTick = 0, holdT = 0;
/** Rotate by degrees with a rate-limited tick sound. */
export function rotate(e: El, deg: number) {
  e._a += deg * DEG;
  G._dirty = true;
  if (G._t - lastTick > 0.08) { lastTick = G._t; sfx(SFX_TICK); }
}
/** Per-frame: a held mobile rotate button turns continuously after a short delay (a tap gave one 1-degree step). */
export function tick(dt: number) {
  if (G._hold && G._sel && G._t - holdT > 0.3) rotate(G._sel, G._hold * dt * 60);
}

/** Keep elements out of the unicorn, then on the canvas. */
function clamp(e: El) {
  for (const em of G._els) if (!em._t) {
    const dx = e._x - em._x, dy = e._y - em._y, d = Math.hypot(dx, dy) || 1, min = 70 + (e._t === PRISM ? e._s : 0);
    if (d < min) { e._x = em._x + dx / d * min; e._y = em._y + dy / d * min; }
  }
  e._x = Math.max(24, Math.min(W - 24, e._x));
  e._y = Math.max(24, Math.min(H - 34, e._y));
}

/** Soft snap: within 8 px / 2 deg (modulo the element's symmetry) of the authored solution -> snap exactly. */
function snap(e: El) {
  const sol = LEVELS[G._li][3], i = G._els.indexOf(e);
  for (let k = 0; k < sol.length; k += 4) if (sol[k] === i) {
    const per = e._t === PRISM ? 120 : e._t >= MIRROR && e._t <= WALL ? 180 : 360;
    const da = ((e._a / DEG - sol[k + 3]) % per + per * 1.5) % per - per / 2;
    if (Math.abs(e._x - sol[k + 1]) <= 8 && Math.abs(e._y - sol[k + 2]) <= 8 && Math.abs(da) <= 2) {
      e._x = sol[k + 1]; e._y = sol[k + 2]; e._a -= da * DEG;
      if (G._touch) navigator.vibrate?.(8); // haptic click on snap (touch only; no-op where unsupported)
    }
  }
}

export function initInput(cv: HTMLCanvasElement) {
  const pos = (e: PointerEvent | WheelEvent) => toLogical(e.clientX, e.clientY);
  let offx = 0, offy = 0, offa = 0, acc = 0, dragId = -1;

  cv.addEventListener('pointerdown', e => {
    G._touch = e.pointerType === 'touch';
    if (e.pointerType === 'mouse') unlock(); // touch / pen only gain user activation at pointerup (see up())
    if (G._mode || G._hold) return;          // a second finger must not hijack the gesture
    const [x, y] = pos(e);
    if (G._scr !== PLAY) {
      if ((G._scr === SOLVED || G._scr === INTRO) && G._t - G._since < 0.6) return; // let the screen land before a stray tap skips it
      // title: a Continue button sits under the tagline when progress exists
      advance(G._scr === TITLE && Math.abs(x - W / 2) < 80 && Math.abs(y - 400) < 22);
      sfx(SFX_CLICK);
      return;
    }
    let bi = -1, bd = hitR(24); // nearest HUD button within the (physical-size) hit radius
    for (let i = 0; i < 3; i++) { const d = Math.hypot(x - HUD[i][0], y - HUD[i][1]); if (d < bd) { bd = d; bi = i; } }
    if (bi >= 0) {
      sfx(SFX_CLICK);
      if (bi === 0) goto(TITLE); else if (bi === 1) toggleMute(); else resetLevel();
      return;
    }
    cv.setPointerCapture(e.pointerId);
    dragId = e.pointerId;
    if (DEV) stat[1]++;
    const sel = G._sel, pad = G._touch ? 12 / Math.min(1, G._view[0]) : 0; // ~12 physical px on any screen
    const p = pick(G._els, x, y, pad);
    if (sel && sel._f & ROT) {
      if (G._touch && !p) for (let i = 0; i < 2; i++) if (near(x, y, MB[i], hitR(MB_R + 10))) {
        G._hold = i ? 1 : -1; holdT = G._t; rotate(sel, G._hold);
        return;
      }
      const h = handlePos(sel);
      if (near(x, y, h, 14 + pad)) { G._mode = 2; offa = sel._a - Math.atan2(y - sel._y, x - sel._x); sfx(SFX_PICK); return; }
    }
    G._sel = p;
    if (p) {
      sfx(SFX_PICK);
      if (p._f & MOVE) { G._mode = 1; offx = p._x - x; offy = p._y - y; }
      else { G._mode = 2; offa = p._t === EMITTER ? 0 : p._a - Math.atan2(y - p._y, x - p._x); } // body drag rotates relative; the horn aims absolutely
    }
  });

  cv.addEventListener('pointermove', e => {
    if (G._mode && e.pointerId !== dragId) return;
    const [x, y] = pos(e), s = G._sel;
    if (G._mode === 1 && s) { s._x = x + offx; s._y = y + offy; clamp(s); }
    else if (G._mode === 2 && s) {
      const dx = x - s._x, dy = y - s._y;
      if (s._t !== EMITTER || dx * dx + dy * dy > 900) s._a = Math.atan2(dy, dx) + offa; // dead zone: the horn tip is the rotation center
    } else if (G._scr === PLAY && e.pointerType === 'mouse') {
      const h = s && s._f & ROT && near(x, y, handlePos(s), 14);
      cv.style.cursor = h || pick(G._els, x, y, 0) ? 'grab' : 'default';
    }
    if (G._mode) { G._dirty = true; cv.style.cursor = 'grabbing'; }
  });

  const up = (e: PointerEvent) => {
    if ((G._mode || G._hold) && e.pointerId !== dragId) return;
    if (e.type === 'pointerup') { unlock(); focus(); } // activation exists here for every pointer type; focus() keeps keys alive in iframes
    if ((G._mode || G._hold) && G._sel) { snap(G._sel); G._dirty = true; sfx(SFX_DROP); }
    G._mode = G._hold = 0;
    cv.style.cursor = 'default';
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (G._scr !== PLAY) return;
    const [x, y] = pos(e);
    const p = G._mode ? G._sel : pick(G._els, x, y, 0) || G._sel; // never re-target during a drag
    if (!p || !(p._f & ROT)) return;
    // a discrete mouse notch = one step; line mode (Firefox: 3 lines per notch) and small trackpad deltas accumulate per 90 units
    let n = 0;
    if (e.deltaMode) acc += e.deltaY * 30;
    else if (Math.abs(e.deltaY) >= 40) { acc = 0; n = Math.sign(e.deltaY); }
    else acc += e.deltaY;
    if (!n) { n = Math.trunc(acc / 90); acc -= n * 90; }
    if (n) { G._sel = p; rotate(p, n * (e.shiftKey ? 0.2 : 1)); }
  }, { passive: false });

  addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), s = G._sel;
    if (e.key.length === 1 || k.startsWith('arrow') || k === 'enter') unlock(); // only keys that grant user activation (not Esc / modifiers / lock keys)
    if (k === 'r') { if (G._scr === PLAY) resetLevel(); }
    else if (k === 'm') toggleMute();
    else if (k === 'escape') goto(TITLE);
    else if (k === 'enter' || k === ' ') { if (G._scr !== PLAY) advance(); }
    else if (s && s._f & ROT && G._scr === PLAY) {
      const st = e.shiftKey ? 0.2 : 1;
      if (k === 'arrowleft' || k === 'q') rotate(s, -st);
      else if (k === 'arrowright' || k === 'e') rotate(s, st);
      else return;
      e.preventDefault();
    }
  });
}
