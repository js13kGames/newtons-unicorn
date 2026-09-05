import { W, H, drawBg, drawBeams, drawElements, drawTargets } from './render.ts';
import { mkEls, applySolution, type El } from './elements.ts';
import { trace, type Ray } from './trace.ts';
import { LEVELS } from './levels.ts';

const cv = document.getElementById('c') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
let scale = 1, ox = 0, oy = 0, dpr = 1;

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth, h = innerHeight;
  scale = Math.min(w / W, h / H);
  ox = (w - W * scale) / 2; oy = (h - H * scale) / 2;
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
}
addEventListener('resize', resize);
resize();

const q = DEV ? new URLSearchParams(location.search) : undefined;
let li = q ? Math.max(0, (+q.get('level')! || 1) - 1) : 0;
let els: El[] = mkEls(LEVELS[li]);
if (q && q.get('solve')) applySolution(els, LEVELS[li][3]);
let rays: Ray[] = [];

function frame(ms: number) {
  const t = ms / 1000;
  rays = trace(els);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
  drawBg(ctx);
  drawBeams(ctx, rays, t);
  drawElements(ctx, els, undefined, t);
  drawTargets(ctx, els, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
