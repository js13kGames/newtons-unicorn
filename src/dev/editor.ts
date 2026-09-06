// DEV-only level editor (never bundled: main.ts imports it dynamically under ?editor=1).
// Every edit mutates G._els and is mirrored into LEVELS[G._li] (in memory only), so R restores your layout and
// Ctrl+S prints it as a levels.ts literal. Flow: place / drag the initial layout, Ctrl+S (commits it), drag the
// pieces into the solved pose, S (stores the solution), R (back to the layout), Ctrl+S (final dump).
import { G, PLAY, SOLVED, loadLevel } from '../state.ts';
import { LEVELS } from '../levels.ts';
import { EMITTER, PRISM, DROP, MIRROR, FILTER, WALL, TARGET, DEG, W, H, elDist, type El, type Level } from '../elements.ts';
import { RGB, rgba, circle } from '../render.ts';
import { txt } from '../ui.ts';
import { toLogical } from '../input.ts';

/** Defaults for new elements: [size, flags, extra masks]. */
const DEF: Record<number, [number, number, number[]]> = {
  [PRISM]: [60, 3, []], [DROP]: [60, 1, []], [MIRROR]: [120, 3, []], [FILTER]: [120, 3, [127]], [WALL]: [160, 0, []], [TARGET]: [14, 0, [127]],
};
/** Target accept presets cycled by T: R O Y G B I V white, yellow-mix, magenta, cyan. */
const PRESETS = [[1], [2], [4], [8], [16], [32], [64], [127], [4, 9], [65], [24]];
const LEGEND = [
  'EDITOR   1 prism  2 drop  3 mirror  4 filter  5 wall   T target (over one: cycle accept)   E emitter to pointer',
  'F flags   Del remove   S store solution   Ctrl+S dump literal (+commit layout)   L load literal   q/arrows/wheel rotate   R reset',
];

const mk = (t: number, x: number, y: number, s: number, f: number, m: number[]): El =>
  ({ _t: t, _x: x, _y: y, _a: 0, _s: s, _f: f, _m: m, _h: 0, _ok: false, _w: 0 });
/** Angle as integer degrees normalized to (-180, 180]. */
const deg = (a: number) => { const d = Math.round(a / DEG) % 360; return d > 180 ? d - 360 : d <= -180 ? d + 360 : d; };
/** Compact element literal, exactly as in levels.ts. */
const lit = (e: El) => [e._t, Math.round(e._x), Math.round(e._y), deg(e._a), e._s, e._f, ...e._m];
const lv = () => LEVELS[G._li];

/** Mirror the current elements into the level data (what R restores and Ctrl+S prints). */
function sync() { lv()[2] = G._els.map(lit); }

/** Re-index the stored solution after inserting (d = 1) or deleting (d = -1) the element at index i. */
function reindex(i: number, d: number) {
  const s = lv()[3], out: number[] = [];
  for (let k = 0; k < s.length; k += 4) {
    if (s[k] === i && d < 0) continue;
    out.push(s[k] >= i ? s[k] + d : s[k], s[k + 1], s[k + 2], s[k + 3]);
  }
  lv()[3] = out;
}

function add(t: number, x: number, y: number) {
  const [s, f, m] = DEF[t];
  G._els.push(G._sel = mk(t, x, y, s, f, [...m]));
  sync();
}
function remove(e: El) {
  const i = G._els.indexOf(e);
  G._els.splice(i, 1);
  reindex(i, -1);
  if (G._sel === e) G._sel = undefined;
  sync();
}
function placeEmitter(x: number, y: number) {
  const em = G._els.find(e => e._t === EMITTER);
  if (em) { em._x = x; em._y = y; }
  else { G._els.unshift(mk(EMITTER, x, y, 0, 2, [])); reindex(0, 1); } // emitter first, like the authored levels
  sync();
}
function cycleAccept(e: El) {
  const cur = JSON.stringify(e._m), i = PRESETS.findIndex(p => JSON.stringify(p) === cur);
  e._m = [...PRESETS[(i + 1) % PRESETS.length]];
  sync();
}
/** Current transforms of every interactive element -> level solution (drives the soft snap and ?solve=1). */
function storeSolution() {
  lv()[3] = G._els.flatMap((e, i) => e._f ? [i, Math.round(e._x), Math.round(e._y), deg(e._a)] : []);
  console.log('editor: solution stored', JSON.stringify(lv()[3]));
}
/** Print the level in the exact literal format of levels.ts (one element per line); also copied to the clipboard when allowed. */
function dump() {
  sync();
  const l = lv(), q = (s: string) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'", row = (a: number[]) => '[' + a.join(', ') + ']';
  const s = `  [${q(l[0])}, ${q(l[1])},\n    [${l[2].map(row).join(',\n     ')}],\n    ${row(l[3])}],`;
  console.log(s);
  try { navigator.clipboard?.writeText(s).catch(() => { /* no permission / window not focused */ }); } catch { /* insecure context */ }
}
/** Replace the current level with a literal from prompt(): JSON, or a levels.ts entry (single quotes, R..WHITE names, trailing comma). */
function loadLiteral() {
  const s = prompt('Level literal: ["name", "hint", [[type, x, y, angle, size, flags, ...extra], ...], [index, x, y, angle, ...]]');
  if (!s) return;
  try {
    const l = new Function('R,O,Y,G,B,I,V,WHITE', 'return ' + s.trim().replace(/,$/, ''))(1, 2, 4, 8, 16, 32, 64, 127) as Level;
    if (!Array.isArray(l[2]) || !Array.isArray(l[3])) throw new Error('expected [name, hint, elements, solution]');
    LEVELS[G._li] = l;
    loadLevel(G._li);
  } catch (err) { console.error('editor: bad literal -', err); }
}

export function initEditor(cv: HTMLCanvasElement, _ctx: CanvasRenderingContext2D) {
  let px = W / 2, py = H / 2; // pointer in logical canvas coordinates
  cv.addEventListener('pointermove', e => {
    const p = toLogical(e.clientX, e.clientY);
    px = Math.round(p[0]); py = Math.round(p[1]);
  });
  /** Nearest element (optionally of type t) under the pointer - unlike `pick` this also finds fixed elements (walls, flowers). */
  const over = (t?: number) =>
    G._els.filter(e => t === undefined || e._t === t).sort((a, b) => elDist(a, px, py) - elDist(b, px, py)).find(e => elDist(e, px, py) <= 4);

  // Key routing: input.ts binds e/q (rotate), r, m, escape, enter/space on window in the bubble phase. This listener is on
  // window in the CAPTURE phase, so it runs first, and stopImmediatePropagation() hides every key the editor consumes from
  // the game - notably 'e', which the editor takes for "place emitter" (rotate with q / arrow keys / wheel / the handle).
  addEventListener('keydown', e => {
    if (G._mode || (G._scr !== PLAY && G._scr !== SOLVED) || e.altKey || e.repeat) return; // drag in progress / not in a level
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, sel = G._sel || over(); // F / Del: selection, else hovered
    if (ctrl && k === 's') dump();
    else if (ctrl) return;
    else if (/^[1-5]$/.test(k)) add(+k, px, py);
    else if (k === 't') { const t = over(TARGET); if (t) cycleAccept(t); else add(TARGET, px, py); }
    else if (k === 'e') placeEmitter(px, py);
    else if (k === 'f' && sel) { sel._f = (sel._f + 1) & 3; sync(); }
    else if ((k === 'delete' || k === 'backspace') && sel) remove(sel);
    else if (k === 's') storeSolution();
    else if (k === 'l') loadLiteral();
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  /** Overlay, called by main.ts after everything else each frame (logical coordinates, transform already applied). */
  function draw(c: CanvasRenderingContext2D) {
    // Hold the Solved screen (no auto-advance) so a level solved mid-edit is not left behind: R resumes editing, a tap advances.
    if (G._scr === SOLVED) G._since = G._t - 1;
    if (G._scr !== PLAY && G._scr !== SOLVED) return;
    c.save();
    c.shadowColor = '#000'; c.shadowBlur = 3;
    G._els.forEach((e, i) => {
      txt(c, i + '', e._x + 8, e._y - 10, 11, 'rgba(255,255,255,0.85)', true, 'left');
      if (e === G._sel) {
        const m = e._t === TARGET || e._t === FILTER ? '  m' + JSON.stringify(e._m) : '';
        txt(c, `${Math.round(e._x)},${Math.round(e._y)}  ${deg(e._a)}°  f${e._f}${m}`, e._x + 8, e._y + 12, 11, '#ffe0a0', false, 'left');
      }
    });
    // Sun mode: a dot in the band color where each ray leaves the canvas (for placing the finale flowers on the caustic).
    if (G._els.some(e => e._t === EMITTER && e._m[0] > 1)) for (const r of G._rays) {
      const p = r._p, x = p[p.length - 2], y = p[p.length - 1];
      if (Math.min(x, y, W - x, H - y) < 0.5) { circle(c, x, y, 3); c.fillStyle = rgba(RGB[r._b], 0.9); c.fill(); }
    }
    const status = `ptr ${px},${py}   level ${G._li + 1}   solution entries ${lv()[3].length / 4}   ${G._scr === SOLVED ? 'SOLVED - press R to keep editing' : ''}`;
    [...LEGEND, status].forEach((s, i) => txt(c, s, 16, 52 + i * 14, 11, 'rgba(255,255,255,0.55)', false, 'left'));
    c.restore();
  }
  (globalThis as any).NU_ED = draw;
  console.log('editor: active (see legend top-left)');
}
