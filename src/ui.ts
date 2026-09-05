// HUD, screens (title / intro / solved / ending), particles, sky rainbow, text helper.
import { G, TITLE, INTRO, PLAY, SOLVED, ENDING } from './state.ts';
import { HUD, MB, MB_R } from './input.ts';
import { W, H, RGB, rgba, circle, type Ctx } from './render.ts';
import { ROT } from './elements.ts';
import { LEVELS } from './levels.ts';
import * as S from './strings.ts';

export function txt(ctx: Ctx, s: string, x: number, y: number, size: number, color = '#fff', bold?: boolean, align: CanvasTextAlign = 'center') {
  ctx.font = (bold ? 'bold ' : '') + size + 'px system-ui,sans-serif';
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
const white = (a: number) => `rgba(255,255,255,${a})`;

function button(ctx: Ctx, p: number[], r: number, glyph: string, size: number) {
  circle(ctx, p[0], p[1], r);
  ctx.fillStyle = white(0.08); ctx.fill();
  ctx.strokeStyle = white(0.35); ctx.lineWidth = 1.5; ctx.stroke();
  txt(ctx, glyph, p[0], p[1] + 1, size, white(0.9));
}

export function drawHud(ctx: Ctx) {
  const lv = LEVELS[G._li];
  txt(ctx, (G._li + 1) + ' / ' + LEVELS.length + ' · ' + lv[0], 16, 28, 17, white(0.8), true, 'left');
  if (G._scr === PLAY) { // buttons are not tappable on the solved banner (a tap there advances), so do not draw them
    const g = ['≡', '♪', '⟲'];
    for (let i = 0; i < 3; i++) button(ctx, HUD[i], 17, g[i], 20);
    if (G._mute) { ctx.strokeStyle = '#f66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(HUD[1][0] - 9, HUD[1][1] + 9); ctx.lineTo(HUD[1][0] + 9, HUD[1][1] - 9); ctx.stroke(); }
  }
  txt(ctx, lv[1], W / 2, H - 38, 16, white(0.75));
  if (G._touch && G._sel && G._sel._f & ROT) { button(ctx, MB[0], MB_R, '⟲', 40); button(ctx, MB[1], MB_R, '⟳', 40); }
}

/** Seven-band arc across the top of the sky (finale), `a` = fade 0..1. */
export function drawSkyRainbow(ctx: Ctx, a: number) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 15;
  for (let b = 0; b < 7; b++) {
    ctx.strokeStyle = rgba(RGB[b], 0.3 * a);
    ctx.beginPath(); ctx.arc(W / 2, H + 300, 760 - b * 15, Math.PI, 2 * Math.PI); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

export function spawnBurst(x: number, y: number, c: number[]) {
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * 7, v = 40 + Math.random() * 140;
    G._parts.push([x, y, Math.cos(a) * v, Math.sin(a) * v - 40, 0.8 + Math.random() * 0.6, c[0], c[1], c[2]]);
  }
}
export function drawParticles(ctx: Ctx, dt: number) {
  ctx.globalCompositeOperation = 'lighter';
  G._parts = G._parts.filter(p => {
    p[0] += p[2] * dt; p[1] += p[3] * dt; p[3] += 90 * dt; p[4] -= dt;
    circle(ctx, p[0], p[1], 2.5); ctx.fillStyle = rgba([p[5], p[6], p[7]], Math.max(0, p[4])); ctx.fill();
    return p[4] > 0;
  });
  ctx.globalCompositeOperation = 'source-over';
}

const rainbowText = (ctx: Ctx, x: number, w: number) => {
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  for (let b = 0; b < 7; b++) g.addColorStop(b / 6, rgba(RGB[b], 1));
  return g;
};

export function drawScreens(ctx: Ctx) {
  const t = G._t, dt = t - G._since, s = G._scr;
  if (s === TITLE) {
    ctx.font = 'bold 62px system-ui,sans-serif';
    ctx.fillStyle = rainbowText(ctx, W / 2, 520); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(S.TITLE, W / 2, 175);
    txt(ctx, S.TAGLINE, W / 2, 240, 22, white(0.85));
    txt(ctx, S.TAP, W / 2, 330, 20, white(0.5 + 0.4 * Math.sin(t * 3)));
    if (G._best) {
      ctx.strokeStyle = white(0.4); ctx.lineWidth = 1.5; ctx.strokeRect(W / 2 - 80, 380, 160, 40);
      txt(ctx, S.CONTINUE + ' · ' + (G._best + 1), W / 2, 401, 17, white(0.8));
    }
    if (innerHeight > innerWidth) txt(ctx, S.ROTATE_HINT, W / 2, H - 40, 15, white(0.5));
  } else if (s === INTRO) {
    for (let i = 0; i < 3; i++) {
      const a = Math.min(1, Math.max(0, (dt - i * 0.9) / 0.6));
      txt(ctx, S.INTRO[i], W / 2, 190 + i * 62, 30, white(a * 0.95), i === 2);
    }
    txt(ctx, S.TAP, W / 2, H - 40, 15, white(0.4));
  } else if (s === SOLVED) {
    const a = Math.min(1, dt * 3);
    ctx.globalCompositeOperation = 'lighter';
    txt(ctx, S.SOLVED, W / 2, H / 2 - 30, 110 + 20 * Math.min(1, dt * 2), rgba([120, 255, 160], a * 0.9), true);
    ctx.globalCompositeOperation = 'source-over';
  } else if (s === ENDING) {
    const a = Math.min(1, dt / 1.5);
    ctx.fillStyle = `rgba(0,0,0,${0.5 * a})`; ctx.fillRect(0, 0, W, H);
    const m = Math.floor(G._tot / 60), sec = Math.floor(G._tot % 60);
    txt(ctx, S.ENDING[0], W / 2, 170, 24, white(a * 0.9));
    txt(ctx, S.ENDING[1], W / 2, 206, 24, white(a * 0.9));
    txt(ctx, S.ENDING[2] + m + ':' + (sec < 10 ? '0' : '') + sec, W / 2, 290, 30, white(a), true);
    txt(ctx, S.ENDING[3], W / 2, 400, 15, white(a * 0.6));
  }
}
