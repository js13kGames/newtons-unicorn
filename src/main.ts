// Boot, resize/letterbox, frame loop, screen flow. Heavy work (tracing, audio) only happens after the first frame / gesture.
import { W, H, drawBg, drawBeams, drawElements, drawTargets, mixColor } from './render.ts';
import { drawHud, drawScreens, drawParticles, spawnBurst, drawSkyRainbow, drawCaustic, txt } from './ui.ts';
import { G, TITLE, PLAY, SOLVED, ENDING, load, loadLevel, goto, checkSolved, advance } from './state.ts';
import { initInput, tick, stat } from './input.ts';
import { trace, caustic } from './trace.ts';
import { applySolution, isSolved, TARGET, EMITTER, DROP } from './elements.ts';
import { LEVELS } from './levels.ts';
import { setTones, fanfare, sfx, tickMusic, SFX_WRONG, SFX_WHOOSH } from './audio.ts';
import { drawUnicorn } from './unicorn.ts';

const cv = document.getElementById('c') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
let dpr = 1;

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth || 1, h = innerHeight || 1; // never 0 (hidden / 0x0 iframe would break the bg cache)
  // portrait on a touch device: the 960x540 game is drawn turned 90 degrees so it fills the screen once the phone is turned
  // (works with rotation lock); tall desktop windows keep the plain letterbox
  const rot = h > w && (matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0) ? 1 : 0;
  const s = rot ? Math.min(w / H, h / W) : Math.min(w / W, h / H);
  G._view = rot ? [s, w / 2, h / 2, 1] : [s, (w - W * s) / 2, (h - H * s) / 2, 0];
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  G._dirty = true;
}
addEventListener('resize', resize);
resize();
load();
goto(TITLE);
initInput(cv);

let fps = 60, prevStart = -1, lastWrong = 0, cau: number[] = [], frames = 0, traces = 0, tps = 0, lastSec = 0, lastTraces = 0, prevScr = 0;
function frame(ms: number) {
  const t = ms / 1000, dt = Math.min(0.05, t - G._t);
  G._t = t;
  const s = G._scr, inWorld = s >= PLAY, last = G._li === LEVELS.length - 1;
  if (G._start !== prevStart) { prevStart = G._start; if (inWorld) sfx(SFX_WHOOSH); }
  tick(dt);
  tickMusic();
  const em = G._els[0], sun = em && em._m[0] > 1; // sun-mode emitter (finale) -> live caustic readout
  if (G._dirty) { // retrace only when geometry changed; drawing (shimmer, animations) still happens every frame
    G._dirty = false;
    G._rays = trace(G._els, last ? 24 : 16);
    if (sun) cau = caustic(G._rays, Math.cos(em._a), Math.sin(em._a), isSolved(G._els) ? 0 : em._m[0]); // once solved, always show the angle
    if (DEV) traces++;
  }
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
  if (checkSolved()) {
    fanfare(mask);
    if (DEV) { console.log(`L${G._li + 1} ${(G._t - G._start).toFixed(1)} ${stat[0]} ${stat[1]}`); stat[0] = stat[1] = 0; } // playtest line: level, seconds, resets, gestures
  }
  if (s === SOLVED && t - G._since > 2.5) advance();
  if (DEV) { if (G._scr === ENDING && prevScr !== ENDING) console.log(`TOTAL ${G._tot.toFixed(1)}`); prevScr = G._scr; }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  const v = G._view, k = dpr * v[0];
  // landscape: scale + letterbox offset; portrait: translate to the center, rotate 90 degrees, scale, translate(-480,-270)
  if (v[3]) ctx.setTransform(0, k, -k, 0, v[1] * dpr + H / 2 * k, v[2] * dpr - W / 2 * k);
  else ctx.setTransform(k, 0, 0, k, v[1] * dpr, v[2] * dpr);
  drawBg(ctx, Math.min(3, k));
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
    frames++;
    if (t - lastSec >= 1) { tps = traces - lastTraces; lastTraces = traces; lastSec = t; (globalThis as any).NU_STAT = [frames, traces]; }
    const segs = G._rays.reduce((a, r) => a + r._p.length / 2 - 1, 0);
    const masks = G._els.filter(e => e._t === TARGET).map(e => e._h + (e._ok ? '✓' : '')).join(' ');
    txt(ctx, `${fps | 0} fps · ${tps} traces/s · ${G._rays.length} rays · ${segs} segs · solved ${G._els.every(e => e._t !== TARGET || e._ok)} · masks ${masks}`, 8, H - 8, 11, '#8f8', false, 'left');
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
    if (q.get('solve')) { applySolution(G._els, LEVELS[n - 1][3]); G._dirty = true; }
  }
  if (q.get('editor')) import('./dev/editor.ts').then(m => m.initEditor(cv, ctx));
}
requestAnimationFrame(frame);
