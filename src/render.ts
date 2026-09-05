// Canvas 2D rendering: background, beams, elements, flowers, unicorn, HUD, screens.
export const W = 960, H = 540;

/** Tiny deterministic RNG (LCG) so the star field is identical every frame/run. */
export const rng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

let bgCache: HTMLCanvasElement | undefined;

/** Background: midnight gradient, stars, hills, grass line. Rendered once to an offscreen canvas. */
export function drawBg(ctx: CanvasRenderingContext2D) {
  if (!bgCache) {
    bgCache = document.createElement('canvas');
    bgCache.width = W; bgCache.height = H;
    const c = bgCache.getContext('2d')!;
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
    // hills
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
  ctx.drawImage(bgCache, 0, 0);
}
