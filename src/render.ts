// Canvas 2D rendering: background, beams, elements, flowers, HUD, screens.
import type { El } from './elements.ts';
import { EMITTER, PRISM, DROP, MIRROR, FILTER, WALL, TARGET, ROT, W, H, prismVerts, segOf, handlePos } from './elements.ts';
import type { Ray } from './trace.ts';

export { W, H };
export type Ctx = CanvasRenderingContext2D;

/** Band render colors R O Y G B I V. */
export const RGB: number[][] = [[255, 40, 40], [255, 140, 30], [255, 232, 30], [40, 255, 90], [30, 140, 255], [80, 60, 255], [180, 60, 255]];
export const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Additive mix of the bands in a mask (0 -> grey). */
export function mixColor(mask: number): number[] {
  if (mask === 127) return [255, 255, 255];
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < 7; i++) if (mask >> i & 1) { r += RGB[i][0]; g += RGB[i][1]; b += RGB[i][2]; n++; }
  if (!n) return [120, 120, 130];
  const m = Math.max(r, g, b) / 255;
  return [r / m, g / m, b / m];
}

/** Tiny deterministic RNG (LCG) so the star field is identical every frame/run. */
export const rng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

let bgCache: HTMLCanvasElement | undefined, bgK = 0;

/** Background: midnight gradient, stars, hills, grass line. Cached offscreen at device resolution `k` (redrawn when it changes). */
export function drawBg(ctx: Ctx, k: number) {
  if (!bgCache || k !== bgK) {
    bgK = k;
    bgCache = document.createElement('canvas');
    bgCache.width = Math.max(1, W * k | 0); bgCache.height = Math.max(1, H * k | 0);
    const c = bgCache.getContext('2d')!;
    c.scale(k, k);
    const g = c.createRadialGradient(W / 2, H * 0.9, 50, W / 2, H * 0.5, 700);
    g.addColorStop(0, '#1a1746'); g.addColorStop(1, '#05040d');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const r = rng(7);
    for (let i = 0; i < 60; i++) {
      c.globalAlpha = 0.3 + r() * 0.7;
      c.fillStyle = '#fff';
      const s = 0.6 + r() * 1.4;
      c.fillRect(r() * W, r() * H * 0.8, s, s);
    }
    c.globalAlpha = 1;
    for (let k = 0; k < 2; k++) {
      c.fillStyle = k ? '#0b0a1c' : '#100e28';
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 40) c.lineTo(x, H - 40 - k * 25 - 18 * Math.sin(x / (120 + k * 60) + k * 2) - 8 * Math.sin(x / 37));
      c.lineTo(W, H); c.fill();
    }
    c.fillStyle = '#0d1a12'; c.fillRect(0, H - 22, W, 22);
    c.strokeStyle = '#1f4a2c'; c.lineWidth = 1.5;
    c.beginPath();
    for (let x = 0; x < W; x += 6) { c.moveTo(x, H - 22); c.lineTo(x + (r() - 0.5) * 6, H - 26 - r() * 8); }
    c.stroke();
  }
  ctx.drawImage(bgCache, 0, 0, W, H);
}

/** Beams: additive, three passes per band polyline (glow / body / core). */
export function drawBeams(ctx: Ctx, rays: Ray[], t: number) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = ctx.lineJoin = 'round';
  // sun mode (many parallel rays): dimmer per ray and no wide glow pass, or the bundle washes out to white
  const sun = rays.length > 7, k = sun ? 0.35 : 1;
  const passes = sun ? [[3, 0.25], [1, 0.9]] : [[10, 0.06], [4, 0.25], [1.5, 0.9]];
  for (const [w, a] of passes) {
    ctx.lineWidth = w;
    for (const r of rays) {
      const p = r._p;
      ctx.strokeStyle = rgba(RGB[r._b], a * k * (0.9 + 0.1 * Math.sin(t * 6 + r._b)));
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.stroke();
    }
  }
  // Fresnel ghosts: the faint partial reflection where a beam enters glass / water (decoration only)
  ctx.lineWidth = 1;
  for (const r of rays) for (let i = 0; i < r._g.length; i += 4) {
    ctx.strokeStyle = rgba(RGB[r._b], 0.1);
    ctx.beginPath(); ctx.moveTo(r._g[i], r._g[i + 1]); ctx.lineTo(r._g[i + 2], r._g[i + 3]); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function poly(ctx: Ctx, v: number[]) {
  ctx.beginPath();
  ctx.moveTo(v[0], v[1]);
  for (let i = 2; i < v.length; i += 2) ctx.lineTo(v[i], v[i + 1]);
  ctx.closePath();
}
export function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
}
function line(ctx: Ctx, s: number[]) {
  ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke();
}

/** Optical elements (not targets / emitter). Selected element gets a pulsing outline + rotate handle. */
export function drawElements(ctx: Ctx, els: El[], sel: El | undefined, t: number) {
  for (const e of els) {
    ctx.globalAlpha = e._f ? 1 : 0.7;
    const s = e._s;
    if (e._t === PRISM) {
      const v = prismVerts(e);
      poly(ctx, v);
      ctx.fillStyle = 'rgba(180,220,255,0.12)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      line(ctx, [v[0] * 0.8 + e._x * 0.2, v[1] * 0.8 + e._y * 0.2, v[2] * 0.7 + e._x * 0.3, v[3] * 0.7 + e._y * 0.3]);
    } else if (e._t === DROP) {
      circle(ctx, e._x, e._y, s);
      ctx.fillStyle = 'rgba(150,200,255,0.14)'; ctx.fill();
      ctx.strokeStyle = 'rgba(200,230,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(e._x - s * 0.4, e._y - s * 0.4, s * 0.16, s * 0.09, -0.8, 0, 7); ctx.fill();
    } else if (e._t === MIRROR) {
      const sg = segOf(e);
      const g = ctx.createLinearGradient(sg[0], sg[1], sg[2], sg[3]);
      g.addColorStop(0, '#8a9bb0'); g.addColorStop(0.5, '#eef4ff'); g.addColorStop(1, '#8a9bb0');
      ctx.strokeStyle = g; ctx.lineWidth = 6; ctx.lineCap = 'butt'; line(ctx, sg);
    } else if (e._t === FILTER) {
      const sg = segOf(e);
      ctx.strokeStyle = rgba(mixColor(e._m[0]), 0.45); ctx.lineWidth = 10; ctx.lineCap = 'butt'; line(ctx, sg);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; line(ctx, sg);
    } else if (e._t === WALL && e._m[0]) {
      // cloud wall: a soft column of pale puffs along the (still absorbing) segment
      const sg = segOf(e), n = e._s / 20 | 0;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i <= n; i++) {
        const u = i / n, px = sg[0] + (sg[2] - sg[0]) * u + Math.sin(i * 2.3) * 6, py = sg[1] + (sg[3] - sg[1]) * u + Math.cos(i * 1.9) * 6;
        circle(ctx, px, py, 16 + 6 * Math.sin(i * 1.7 + t * 0.5)); ctx.fillStyle = 'rgba(200,215,255,0.09)'; ctx.fill();
        circle(ctx, px - 3, py - 4, 8); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (e._t === WALL) {
      const sg = segOf(e);
      const g = ctx.createLinearGradient(sg[0], sg[1], sg[2], sg[3]);
      g.addColorStop(0, '#3a3548'); g.addColorStop(0.5, '#55506a'); g.addColorStop(1, '#3a3548');
      ctx.strokeStyle = g; ctx.lineWidth = 12; ctx.lineCap = 'round'; line(ctx, sg);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; line(ctx, sg);
    }
    ctx.globalAlpha = 1;
    if (e === sel) {
      const p = 0.55 + 0.45 * Math.sin(t * 5);
      ctx.strokeStyle = rgba([255, 240, 200], 0.4 + 0.4 * p); ctx.lineWidth = 2;
      if (e._t === PRISM) { poly(ctx, prismVerts(e)); ctx.stroke(); }
      else if (e._t === DROP) { circle(ctx, e._x, e._y, s + 4); ctx.stroke(); }
      else if (e._t !== EMITTER) { ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.globalAlpha = 0.25; line(ctx, segOf(e)); ctx.globalAlpha = 1; }
      if (e._f & ROT) {
        const [hx, hy] = handlePos(e);
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,240,200,0.7)';
        line(ctx, [e._x, e._y, hx, hy]);
        circle(ctx, hx, hy, 9); ctx.fillStyle = 'rgba(30,25,50,0.9)'; ctx.fill(); ctx.stroke();
        circle(ctx, hx, hy, 3); ctx.fillStyle = '#ffe0a0'; ctx.fill();
      }
    }
  }
}

/** Flowers: grey with a ring in the needed color; wrong mix shows the incident mix at half saturation; correct -> full color + glow. */
export function drawTargets(ctx: Ctx, els: El[], t: number) {
  for (const e of els) if (e._t === TARGET) {
    const need = mixColor(e._m.reduce((a, m) => a | Math.abs(m), 0));
    const r = e._s;
    // stem
    ctx.strokeStyle = '#2d6a3a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    line(ctx, [e._x, e._y + r, e._x, H - 20]);
    let petal: number[], alpha = 1, ring = 0.7;
    if (e._ok) {
      petal = need;
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 3; k > 0; k--) { circle(ctx, e._x, e._y, r * (1 + k * 0.6)); ctx.fillStyle = rgba(need, 0.07); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
    } else if (e._h) {
      const m = mixColor(e._h);
      petal = m.map(v => v * 0.5 + 60);
      ring = 0.5 + 0.5 * Math.sin(t * 10);
    } else petal = [110, 110, 125];
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + (e._ok ? t : 0);
      circle(ctx, e._x + Math.cos(a) * r * 0.55, e._y + Math.sin(a) * r * 0.55, r * 0.45);
      ctx.fillStyle = rgba(petal, alpha); ctx.fill();
    }
    circle(ctx, e._x, e._y, r * 0.3); ctx.fillStyle = e._ok ? '#fff7d0' : '#3a3a48'; ctx.fill();
    if (!e._ok) { circle(ctx, e._x, e._y, r + 3); ctx.strokeStyle = rgba(need, ring); ctx.lineWidth = 2; ctx.stroke(); }
  }
}
