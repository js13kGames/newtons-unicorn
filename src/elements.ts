// Element / level model, transforms and hit-testing. Pure (no DOM) so tests can import it.
export const EMITTER = 0, PRISM = 1, DROP = 2, MIRROR = 3, FILTER = 4, WALL = 5, TARGET = 6;
export const MOVE = 1, ROT = 2;
export const DEG = Math.PI / 180;
export const W = 960, H = 540;

/** Runtime element. `_s` is: prism circumradius, drop/target radius, mirror/filter/wall length, sun-bundle width. */
export interface El {
  _t: number;      // type
  _x: number;
  _y: number;
  _a: number;      // angle, radians
  _s: number;      // size (see above)
  _f: number;      // MOVE | ROT
  _m: number[];    // filter: [mask]; target: accept masks (negative = "contains"); emitter: [rayCount]
  _h: number;      // runtime: incident band mask (targets)
  _ok: boolean;    // runtime: satisfied (targets)
  _w: boolean;     // runtime: was satisfied last frame (bloom burst trigger)
}

/** Compact level: [name, hint, elements, solution]. Element: [type, x, y, angleDeg, size, flags, ...extra]. Solution: [index, x, y, angleDeg, ...]. */
export type Level = [string, string, number[][], number[]];

export const mkEls = (lv: Level): El[] =>
  lv[2].map(d => ({ _t: d[0], _x: d[1], _y: d[2], _a: d[3] * DEG, _s: d[4], _f: d[5], _m: d.slice(6), _h: 0, _ok: false, _w: false }));

export function applySolution(els: El[], sol: number[]) {
  for (let i = 0; i < sol.length; i += 4) {
    const e = els[sol[i]];
    e._x = sol[i + 1]; e._y = sol[i + 2]; e._a = sol[i + 3] * DEG;
  }
}

/** Equilateral prism vertices (flat [x0,y0,x1,y1,x2,y2]); vertex 0 points up at angle 0. */
export function prismVerts(e: El): number[] {
  const v: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = e._a - Math.PI / 2 + k * 2 * Math.PI / 3;
    v.push(e._x + e._s * Math.cos(a), e._y + e._s * Math.sin(a));
  }
  return v;
}
export function prismEdges(e: El): number[][] {
  const v = prismVerts(e);
  return [[v[0], v[1], v[2], v[3]], [v[2], v[3], v[4], v[5]], [v[4], v[5], v[0], v[1]]];
}
/** Segment [x1,y1,x2,y2] of a mirror / filter / wall (centered, length `_s`). */
export function segOf(e: El): number[] {
  const c = Math.cos(e._a) * e._s / 2, s = Math.sin(e._a) * e._s / 2;
  return [e._x - c, e._y - s, e._x + c, e._y + s];
}

export const isSolved = (els: El[]) => els.every(e => e._t !== TARGET || e._ok);

/** Distance from point to segment. */
export function segDist(px: number, py: number, s: number[]) {
  const dx = s[2] - s[0], dy = s[3] - s[1];
  const l2 = dx * dx + dy * dy || 1;
  let u = ((px - s[0]) * dx + (py - s[1]) * dy) / l2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(px - s[0] - u * dx, py - s[1] - u * dy);
}

/** Signed "how far outside" the pointer is from an element's hit area (<= 0 means inside). */
export function elDist(e: El, x: number, y: number) {
  const d = Math.hypot(x - e._x, y - e._y);
  switch (e._t) {
    case EMITTER: return d - 26;
    case PRISM: return d - e._s * 0.85;
    case DROP: case TARGET: return d - e._s;
    default: return segDist(x, y, segOf(e)) - 10;
  }
}

/** Nearest interactive element whose (inflated) hit area contains the point, or undefined. */
export function pick(els: El[], x: number, y: number, pad: number): El | undefined {
  let best: El | undefined, bd = pad;
  for (const e of els) {
    if (!(e._f & (MOVE | ROT))) continue;
    const d = elDist(e, x, y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/** Rotate-handle position: a small ring on a stalk from the element center. */
export function handlePos(e: El): [number, number] {
  const r = e._t === EMITTER ? 40 : (e._t === PRISM || e._t === DROP ? e._s : e._s / 2) + 22;
  return [e._x + Math.cos(e._a) * r, e._y + Math.sin(e._a) * r];
}
