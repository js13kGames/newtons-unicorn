// Finale GIF for the entry page: drives the level-12 drop into the sun bundle in a DEV build (via globalThis.NU),
// captures ~40 frames at 25 fps with Playwright, encodes screenshots/finale.gif (480 x 270) with gifenc.
// Usage: npm run gif   (needs playwright chromium; writes screenshots/finale.gif; not part of the zip)
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;

const { chromium } = await import('playwright');
mkdirSync('screenshots', { recursive: true });
mkdirSync('dist/dev', { recursive: true });
await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'iife', target: 'es2020', define: { DEV: 'true' }, outfile: 'dist/dev/main.js', logLevel: 'error' });
writeFileSync('dist/dev/index.html', readFileSync('index.html', 'utf8').replace('<script type="module" src="/src/main.ts"></script>', '<script src="main.js"></script>'));

const server = createServer((req, res) => {
  const file = 'dist' + req.url.split('?')[0];
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
  res.end(readFileSync(file));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 0.5 });
await page.goto(`${base}/dev/index.html?level=12`);
await page.waitForTimeout(400);
await page.mouse.click(5, 5); // a gesture, so audio code paths run like in play

// the finale's authored solution: [index, x, y, angle] of the drop
const { LEVELS } = await import('../src/levels.ts');
const sol = LEVELS[LEVELS.length - 1][3];
const FRAMES = 40, DELAY = 40;
const gif = GIFEncoder();
for (let f = 0; f < FRAMES; f++) {
  // frames 0..24: ease the drop from its start to the solution; then hold while the level solves and the sky rainbow fades in
  await page.evaluate(([k, tx, ty]) => {
    const G = globalThis.NU, d = G._els.find(e => e._t === 2);
    if (!G._from) G._from = [d._x, d._y];
    const t = Math.min(1, k / 24), e = t * t * (3 - 2 * t);
    d._x = G._from[0] + (tx - G._from[0]) * e; d._y = G._from[1] + (ty - G._from[1]) * e;
    G._dirty = true;
  }, [f, sol[1], sol[2]]);
  await page.waitForTimeout(DELAY);
  const png = PNG.sync.read(await page.screenshot());
  const rgba = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length);
  const palette = quantize(rgba, 256);
  gif.writeFrame(applyPalette(rgba, palette), png.width, png.height, { palette, delay: DELAY });
  process.stdout.write(`\rframe ${f + 1}/${FRAMES}`);
}
gif.finish();
writeFileSync('screenshots/finale.gif', gif.bytes());
console.log(`\nscreenshots/finale.gif written (${gif.bytes().length} bytes)`);
await browser.close();
server.close();
