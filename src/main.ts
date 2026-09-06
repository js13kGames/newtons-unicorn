// Boot, resize/letterbox, frame loop, screen flow. Heavy work (tracing, audio) only happens after the first frame / gesture.
import { W, H, drawBg, drawBeams, drawElements, drawTargets, mixColor } from './render.ts';
import { drawHud, drawScreens, drawParticles, spawnBurst, drawSkyRainbow, drawCaustic, txt } from './ui.ts';
import { G, TITLE, PLAY, SOLVED, load, loadLevel, goto, checkSolved, advance } from './state.ts';
import { initInput, tick } from './input.ts';
import { trace, caustic } from './trace.ts';
import { applySolution, TARGET, EMITTER, DROP } from './elements.ts';
import { LEVELS } from './levels.ts';
import { setTones, fanfare, sfx, tickMusic, SFX_WRONG, SFX_WHOOSH } from './audio.ts';
import { drawUnicorn } from './unicorn.ts';

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
goto(TITLE);
initInput(cv);

let fps = 60, prevStart = -1, lastWrong = 0, cau: number[] = [];
function frame(ms: number) {
  const t = ms / 1000, dt = Math.min(0.05, t - G._t);
  G._t = t;
  const s = G._scr, inWorld = s >= PLAY, last = G._li === LEVELS.length - 1;
  if (G._start !== prevStart) { prevStart = G._start; if (inWorld) sfx(SFX_WHOOSH); }
  tick(dt);
  tickMusic();
  const em = G._els[0], sun = em && em._m[0] > 1; // sun-mode emitter (finale) -> live caustic readout
  G._rays = trace(G._els, last ? 24 : 16);
  if (sun) cau = caustic(G._rays, Math.cos(em._a), Math.sin(em._a), em._m[0]);
  let mask = 0;
  if (inWorld) for (const e of G._els) if (e._t === TARGET) {
    const st = e._h | (e._ok ? 128 : 0);
    if (e._ok) mask |= e._h;
    if (st !== e._w) {
      if (e._ok) spawnBurst(e._x, e._y, mixColor(e._h));
      else if (e._h && s === PLAY && t - G._since > 0.2 && t - lastWrong > 0.3) { lastWrong = t; sfx(SFX_WRONG); } // not on the level's first frames
      e._w = st;
    }
  }
  setTones(s === PLAY || s === SOLVED ? mask : 0);
  if (checkSolved()) fanfare(mask);
  if (s === SOLVED && t - G._since > 2.5) advance();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  const v = G._view;
  ctx.setTransform(dpr * v[0], 0, 0, dpr * v[0], v[1] * dpr, v[2] * dpr);
  drawBg(ctx, Math.min(3, dpr * v[0]));
  if (last && s > PLAY) drawSkyRainbow(ctx, Math.min(1, (t - G._since) / 2 + (s > SOLVED ? 1 : 0)));
  drawBeams(ctx, G._rays, t);
  drawElements(ctx, G._els, inWorld ? G._sel : undefined, t);
  if (inWorld) {
    drawTargets(ctx, G._els, t);
    const d = sun && G._els.find(e => e._t === DROP);
    if (d) drawCaustic(ctx, d, cau, Math.cos(em._a), Math.sin(em._a), s > PLAY);
  }
  for (const e of G._els) if (e._t === EMITTER) drawUnicorn(ctx, e, t, s > PLAY ? Math.min(1, (t - G._since) * 2) : 0);
  drawParticles(ctx, dt);
  if (s === PLAY || s === SOLVED) drawHud(ctx);
  drawScreens(ctx);

  if (DEV) {
    fps += (1 / (dt || 1 / 60) - fps) * 0.05;
    const segs = G._rays.reduce((a, r) => a + r._p.length / 2 - 1, 0);
    const masks = G._els.filter(e => e._t === TARGET).map(e => e._h + (e._ok ? '✓' : '')).join(' ');
    txt(ctx, `${fps | 0} fps · ${G._rays.length} rays · ${segs} segs · solved ${G._els.every(e => e._t !== TARGET || e._ok)} · masks ${masks}`, 8, H - 8, 11, '#8f8', false, 'left');
    const ed = (globalThis as any).NU_ED; // editor overlay hook (set by dev/editor.ts)
    if (ed) ed(ctx, dt);
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
