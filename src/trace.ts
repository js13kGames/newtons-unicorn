// Pure ray tracer: Snell's law with Cauchy dispersion, TIR, mirrors, filters, the primary-rainbow drop rule.
// No DOM imports: this file runs in Node for the tests.
import type { El } from './elements.ts';
import { EMITTER, PRISM, DROP, MIRROR, FILTER, WALL, TARGET, W, H, prismEdges, segOf } from './elements.ts';

export const BANDS = 7;
/** Wavelengths (nm) R O Y G B I V. */
export const LAMBDA = [700, 620, 580, 530, 470, 440, 400];
/** Cauchy coefficients [A, B(um^2)] - deliberately exaggerated dispersion for legibility. */
export const GLASS = [1.45, 0.03];
/** Water: A chosen so red (700 nm) has the real n = 1.331 and its rainbow angle is the true 42.4 deg; B exaggerates the other bands. */
export const WATER = [1.27, 0.03];
export const EPS = 1e-3;
export const MAX_BOUNCES = 16;

/** Traced polyline for one band of one primary ray. `_k`: event codes (1 refract, 2 reflect, 3 TIR, 4 filter pass).
 *  `_g`: decorative Fresnel "ghost" segments [x1,y1,x2,y2,...] (the partial reflection where the ray enters glass/water). */
export interface Ray { _b: number; _p: number[]; _k: number[]; _g: number[] }

/** Distance along (dx,dy) from (ox,oy) to the canvas edge. */
const toEdge = (ox: number, oy: number, dx: number, dy: number) =>
  Math.min(dx > 0 ? (W - ox) / dx : dx < 0 ? -ox / dx : Infinity, dy > 0 ? (H - oy) / dy : dy < 0 ? -oy / dy : Infinity);

export function refIndex(mat: number[], band: number) {
  const l = LAMBDA[band] / 1e3;
  return mat[0] + mat[1] / (l * l);
}

export function reflect(dx: number, dy: number, nx: number, ny: number): [number, number] {
  const k = 2 * (dx * nx + dy * ny);
  return [dx - k * nx, dy - k * ny];
}

/** Snell, vector form. Normal must face against the ray (n.d < 0). eta = n1/n2. Third value: 1 refracted, 3 TIR. */
export function refract(dx: number, dy: number, nx: number, ny: number, eta: number): [number, number, number] {
  let cosI = -(nx * dx + ny * dy);
  cosI = cosI > 1 ? 1 : cosI < -1 ? -1 : cosI;
  const s2 = eta * eta * (1 - cosI * cosI);
  if (s2 > 1) { const r = reflect(dx, dy, nx, ny); return [r[0], r[1], 3]; }
  const k = eta * cosI - Math.sqrt(1 - s2);
  return [eta * dx + k * nx, eta * dy + k * ny, 1];
}

/** Smallest root > EPS of |o + t d - c|^2 = r^2, or Infinity. */
export function hitCircle(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number) {
  const fx = ox - cx, fy = oy - cy;
  const b = fx * dx + fy * dy, c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc), t1 = -b - s, t2 = -b + s;
  return t1 > EPS ? t1 : t2 > EPS ? t2 : Infinity;
}

/** Ray vs segment [x1,y1,x2,y2]: t > EPS or Infinity. */
export function hitSeg(ox: number, oy: number, dx: number, dy: number, s: number[]) {
  const ex = s[2] - s[0], ey = s[3] - s[1];
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return Infinity;
  const wx = s[0] - ox, wy = s[1] - oy;
  const t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
  return t > EPS && u >= 0 && u <= 1 ? t : Infinity;
}

function castRay(els: El[], segs: number[][][], ox: number, oy: number, dx: number, dy: number, b: number, maxB: number, ghosts: boolean): Ray {
  const pts = [ox, oy], ev: number[] = [], gh: number[] = [], bit = 1 << b;
  let k = 0; // inner-surface hit counter (drop rule)
  for (let n = 0; n < maxB; n++) {
    let bt = toEdge(ox, oy, dx, dy);
    let be: El | undefined, nx = 0, ny = 0;
    for (let i = 0; i < els.length; i++) {
      const e = els[i];
      if (e._t === DROP || e._t === TARGET) {
        const t = hitCircle(ox, oy, dx, dy, e._x, e._y, e._s);
        if (t < bt) { bt = t; be = e; nx = (ox + t * dx - e._x) / e._s; ny = (oy + t * dy - e._y) / e._s; }
      } else for (const s of segs[i]) {
        const t = hitSeg(ox, oy, dx, dy, s);
        if (t < bt) {
          bt = t; be = e;
          const l = Math.hypot(s[2] - s[0], s[3] - s[1]);
          nx = (s[1] - s[3]) / l; ny = (s[2] - s[0]) / l;
          if (e._t === PRISM && nx * ((s[0] + s[2]) / 2 - e._x) + ny * ((s[1] + s[3]) / 2 - e._y) < 0) { nx = -nx; ny = -ny; }
        }
      }
    }
    if (!(bt < Infinity)) break;
    const hx = ox + bt * dx, hy = oy + bt * dy;
    pts.push(hx, hy);
    if (!be) break;
    const t = be._t;
    if (t === TARGET) { be._h |= bit; break; }
    if (t === WALL) break;
    if (t === FILTER) { if (!(be._m[0] & bit)) break; ev.push(4); }
    else if (t === MIRROR) { [dx, dy] = reflect(dx, dy, nx, ny); ev.push(2); }
    else {
      const out = dx * nx + dy * ny > 0;
      if (out) { nx = -nx; ny = -ny; }
      const ri = refIndex(t === DROP ? WATER : GLASS, b);
      let c = 1;
      if (!out) {
        if (ghosts) { const [gx, gy] = reflect(dx, dy, nx, ny), gt = toEdge(hx, hy, gx, gy); gh.push(hx, hy, hx + gx * gt, hy + gy * gt); }
        k = 0; [dx, dy, c] = refract(dx, dy, nx, ny, 1 / ri);
      }
      else if (t === DROP && ++k === 1) { [dx, dy] = reflect(dx, dy, nx, ny); c = 2; }
      else [dx, dy, c] = refract(dx, dy, nx, ny, ri);
      ev.push(c);
    }
    if (dx !== dx || dy !== dy) break;
    ox = hx + dx * EPS; oy = hy + dy * EPS;
  }
  return { _b: b, _p: pts, _k: ev, _g: gh };
}

/** Sun-mode caustic readout: per band, the largest exit angle (degrees) from the reversed beam axis among rays that
 *  completed the drop path (enter -> reflect -> exit) - the minimum-deviation / rainbow angle. -1 for a band when
 *  fewer than half of its `count` rays entered the drop. (ca, sa) is the beam direction. */
export function caustic(rays: Ray[], ca: number, sa: number, count: number): number[] {
  const out = Array(BANDS).fill(-1), hits = Array(BANDS).fill(0);
  for (const r of rays) {
    const k = r._k, p = r._p, n = p.length;
    if (k[0] !== 1) continue;
    hits[r._b]++;
    if (k.length !== 3 || k[1] !== 2 || k[2] !== 1) continue;
    const dx = p[n - 2] - p[n - 4], dy = p[n - 1] - p[n - 3];
    const a = Math.acos(-(dx * ca + dy * sa) / Math.hypot(dx, dy)) * 180 / Math.PI;
    if (a > out[r._b]) out[r._b] = a;
  }
  return out.map((a, b) => hits[b] * 2 >= count ? a : -1);
}

/** Trace every emitter, every band. Sets `_h`/`_ok` on targets; returns the polylines. */
export function trace(els: El[], maxB = MAX_BOUNCES): Ray[] {
  const rays: Ray[] = [];
  const segs = els.map(e => e._t === PRISM ? prismEdges(e) : e._t >= MIRROR && e._t <= WALL ? [segOf(e)] : []);
  for (const e of els) if (e._t === TARGET) e._h = 0;
  for (const em of els) if (em._t === EMITTER) {
    const cnt = em._m[0] || 1, ca = Math.cos(em._a), sa = Math.sin(em._a);
    for (let i = 0; i < cnt; i++) {
      const off = cnt > 1 ? (i / (cnt - 1) - 0.5) * em._s : 0;
      for (let b = 0; b < BANDS; b++) rays.push(castRay(els, segs, em._x - sa * off, em._y + ca * off, ca, sa, b, maxB, cnt === 1));
    }
  }
  for (const e of els) if (e._t === TARGET) e._ok = e._m.some(m => m < 0 ? (e._h & -m) === -m : e._h === m);
  return rays;
}
