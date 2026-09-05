import { W, H, drawBg } from './render.ts';

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

function frame() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
  drawBg(ctx);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 40px system-ui,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText("Newton's Unicorn", W / 2, H / 2);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
