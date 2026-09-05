// Boot, resize/letterbox, frame loop, screen flow. Heavy work (tracing, audio) only happens after the first frame / gesture.
import { W, H, drawBg, drawBeams, drawElements, drawTargets, mixColor, circle } from './render.ts';
import { drawHud, drawScreens, drawParticles, spawnBurst, drawSkyRainbow, txt } from './ui.ts';
import { G, PLAY, SOLVED, ENDING, load, loadLevel, checkSolved, advance } from './state.ts';
import { initInput, rotate } from './input.ts';
import { trace } from './trace.ts';
import { applySolution, TARGET, EMITTER } from './elements.ts';
import { LEVELS } from './levels.ts';
import { setTones, fanfare } from './audio.ts';

const cv = document.getElementById('c') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
let dpr = 1;

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth, h = innerHeight, s = Math.min(w / W, h / H);
  G._view = [s, (w - W * s) / 2, (h - H * s) / 2];
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
}
addEventListener('resize', resize);
resize();
load();
initInput(cv);

/** Placeholder unicorn (replaced by the procedural one at milestone 7): a body blob + horn from the emitter tip. */
function drawUnicorn(c: CanvasRenderingContext2D) {
  for (const e of G._els) if (e._t === EMITTER) {
    circle(c, e._x - Math.cos(e._a) * 40, e._y - Math.sin(e._a) * 40, 26);
    c.fillStyle = '#e8e4ff'; c.fill();
    c.strokeStyle = '#ffd27a'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(e._x - Math.cos(e._a) * 30, e._y - Math.sin(e._a) * 30); c.lineTo(e._x, e._y); c.stroke();
  }
}

let fps = 60;
function frame(ms: number) {
  const t = ms / 1000, dt = Math.min(0.05, t - G._t);
  G._t = t;
  const s = G._scr, inWorld = s === PLAY || s === SOLVED || s === ENDING;
  if (G._hold && G._sel) rotate(G._sel, G._hold * dt * 75);
  let mask = 0;
  if (inWorld) {
    G._rays = trace(G._els, G._li === LEVELS.length - 1 ? 24 : 16);
    for (const e of G._els) if (e._t === TARGET) {
      if (e._ok) { mask |= e._h; if (!e._w) spawnBurst(e._x, e._y, mixColor(e._h)); }
      e._w = e._ok;
    }
  }
  setTones(s === PLAY || s === SOLVED ? mask : 0);
  if (checkSolved()) fanfare(mask);
  if (s === SOLVED && t - G._since > 2.5) advance();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  const v = G._view;
  ctx.setTransform(dpr * v[0], 0, 0, dpr * v[0], v[1] * dpr, v[2] * dpr);
  drawBg(ctx);
  if (inWorld) {
    if (G._li === LEVELS.length - 1 && s !== PLAY) drawSkyRainbow(ctx, Math.min(1, (t - G._since) / 2 + (s === ENDING ? 1 : 0)));
    drawBeams(ctx, G._rays, t);
    drawElements(ctx, G._els, G._sel, t);
    drawTargets(ctx, G._els, t);
  }
  drawUnicorn(ctx);
  drawParticles(ctx, dt);
  if (inWorld && s !== ENDING) drawHud(ctx);
  drawScreens(ctx);

  if (DEV) {
    fps += (1 / (dt || 1 / 60) - fps) * 0.05;
    const segs = G._rays.reduce((a, r) => a + r._p.length / 2 - 1, 0);
    const masks = G._els.filter(e => e._t === TARGET).map(e => e._h + (e._ok ? '✓' : '')).join(' ');
    txt(ctx, `${fps | 0} fps · ${G._rays.length} rays · ${segs} segs · solved ${G._els.every(e => e._t !== TARGET || e._ok)} · masks ${masks}`, 8, H - 8, 11, '#8f8', false, 'left');
  }
  requestAnimationFrame(frame);
}

if (DEV) {
  (globalThis as any).NU = G;
  const q = new URLSearchParams(location.search);
  const n = +q.get('level')!;
  if (n) {
    loadLevel(n - 1);
    if (q.get('solve')) applySolution(G._els, LEVELS[n - 1][3]);
  }
  if (q.get('editor')) import('./dev/editor.ts').then(m => m.initEditor(cv, ctx));
}
requestAnimationFrame(frame);
