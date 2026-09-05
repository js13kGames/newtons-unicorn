// Procedural unicorn around the emitter: horn tip pinned to (e._x, e._y), head aimed along e._a,
// hooves on the ground when reachable (it floats a little above the hills for a high emitter).
import type { El } from './elements.ts';
import { RGB, rgba, circle, type Ctx } from './render.ts';

const BODY = '#f3efff', SHADE = '#cfc6ee';
const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;

function fillPoly(ctx: Ctx, v: number[]) {
  ctx.beginPath(); ctx.moveTo(v[0], v[1]);
  for (let i = 2; i < v.length; i += 2) ctx.lineTo(v[i], v[i + 1]);
  ctx.fill();
}
function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill();
}
function strand(ctx: Ctx, c: number[], x: number, y: number, cx: number, cy: number, ex: number, ey: number) {
  ctx.strokeStyle = rgba(c, 1);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
}

export function drawUnicorn(ctx: Ctx, e: El, t: number, glow: number) {
  const tx = e._x, ty = e._y, ca = Math.cos(e._a), sa = Math.sin(e._a);
  const a = Math.atan2(sa, Math.abs(ca)), dx = Math.cos(a);   // aim in the right-facing (maybe mirrored) frame
  ctx.save();
  if (ca < 0) { ctx.translate(2 * tx, 0); ctx.scale(-1, 1); } // aiming left: mirror about the horn tip
  const px = tx - 46 * dx, py = ty - 46 * sa;                 // neck pivot (top of the neck)
  const by0 = py + 26 + clamp(433 - py, -14, 22);             // body centre: stand if the ground is reachable
  const leg = clamp(503 - by0, 30, 56);
  const gy = by0 + 13 + leg;                                   // hoof bottoms (516 when standing)
  const by = by0 + Math.sin(t * 2) * 1.5, bx = px - 27;
  const nx = bx + 16, ny = by - 6;                             // neck base
  const l = Math.hypot(px - nx, py - ny), fx = (ny - py) / l, fy = (px - nx) / l; // neck front-side normal
  const rip = (i: number) => Math.sin(t * 4 + i) * 3;
  ctx.lineCap = 'round';
  // tail: 7 strands hanging from the rump
  ctx.lineWidth = 4;
  for (let i = 0; i < 7; i++) {
    const qx = bx - 23 - i * 0.6, qy = by - 10 + i * 2;
    strand(ctx, RGB[i], qx, qy, qx - 14 + rip(i), qy + 4, qx - 9, qy + 22);
  }
  // legs (far pair first), body, near legs
  const legs = (o: number, c: string) => {
    for (let k = -17; k < 18; k += 34) {
      const x = bx + k + o;
      ctx.strokeStyle = c; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(x, by + 6); ctx.lineTo(x, gy - 5); ctx.stroke();
      ctx.fillStyle = '#3a3350'; ell(ctx, x, gy - 3.5, 4.5, 3.5);
    }
  };
  legs(-6, SHADE);
  ctx.fillStyle = SHADE; ell(ctx, bx, by + 2, 27, 17);
  ctx.fillStyle = BODY; ell(ctx, bx, by - 2, 27, 16);
  legs(0, BODY);
  // neck (tapered)
  ctx.fillStyle = BODY;
  fillPoly(ctx, [nx + fx * 9, ny + fy * 9, px + fx * 6, py + fy * 6, px - fx * 6, py - fy * 6, nx - fx * 9, ny - fy * 9]);
  // mane
  ctx.lineWidth = 5;
  for (let i = 0; i < 7; i++) {
    const s = 0.05 + i * 0.15, qx = nx + (px - nx) * s - fx * 5, qy = ny + (py - ny) * s - fy * 5;
    strand(ctx, RGB[i], qx, qy, qx - 14 + rip(i), qy + 3, qx - 13, qy + 19);
  }
  // head (local frame: +x along the aim)
  ctx.translate(px, py); ctx.rotate(a);
  ctx.fillStyle = BODY;
  fillPoly(ctx, [1, -3, 10, -8, 2, -23]);                     // ear
  ctx.fillStyle = '#e9b9d6'; fillPoly(ctx, [4, -8, 7, -10, 3, -18]);
  ctx.fillStyle = BODY;
  circle(ctx, 9, 5, 12); ctx.fill();
  circle(ctx, 20, 13, 7.5); ctx.fill();                        // muzzle
  ctx.fillStyle = '#e9b9d6'; circle(ctx, 14, 11, 2.5); ctx.fill(); // blush
  ctx.fillStyle = '#2a2340';
  ell(ctx, 13, 5, 2.7, t % 4 < 0.12 ? 0.4 : 2.7);              // eye (blinks)
  circle(ctx, 25, 13, 0.9); ctx.fill();                        // nostril
  ctx.fillStyle = '#fff'; circle(ctx, 14, 4, 0.9); ctx.fill();
  strand(ctx, RGB[6], 7, -9, 15 + rip(1), -12, 19, -3);        // forelock
  // horn: 5 slanted gold / white bands, tip exactly at local (46, 0) = emitter
  for (let k = 0; k < 5; k++) {
    const x0 = 12 + k * 6.8, w0 = 4.2 - k * 0.84, w1 = w0 - 0.84;
    ctx.fillStyle = k & 1 ? '#fff' : '#ffd27a';
    fillPoly(ctx, [x0 - w0 * .4, -w0, x0 + 6.8 - w1 * .4, -w1, x0 + 6.8 + w1 * .4, w1, x0 + w0 * .4, w0]);
  }
  ctx.rotate(-a); ctx.translate(-px, -py);
  if (glow > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const mx = (nx + px) / 2 - fx * 10, my = (ny + py) / 2 - fy * 10;
    for (let k = 1; k < 4; k++) {
      ctx.fillStyle = rgba([255, 215, 140], 0.09 * glow); circle(ctx, tx - 20 * dx, ty - 20 * sa, 7 * k); ctx.fill();
      ctx.fillStyle = rgba(RGB[k * 2], 0.05 * glow); circle(ctx, mx, my, 12 * k); ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
