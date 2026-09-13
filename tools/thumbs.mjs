// One-off: entry-page thumbnails / covers from the DEV build in headless Chromium (viewport 960x540 @ 2x).
// The game canvas is drawn into an offscreen canvas inside page.evaluate and returned as a JPEG data URL.
// Usage: node tools/thumbs.mjs   -> screenshots/title-cover.jpg, level2-thumb.jpg, level3-thumb.jpg, finale-cover.jpg
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const { chromium } = await import('playwright');
mkdirSync('screenshots', { recursive: true });

// DEV bundle (NU global + ?level / ?solve params), same as test/headless.mjs but into dist/thumbs/
mkdirSync('dist/thumbs', { recursive: true });
await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'iife', target: 'es2020', define: { DEV: 'true' }, outfile: 'dist/thumbs/main.js', logLevel: 'error' });
// strip the DEV fps/traces readout (bottom-left green text) so it does not appear in the crops
let js = readFileSync('dist/thumbs/main.js', 'utf8');
const k0 = js.indexOf('txt(ctx, `${fps | 0} fps');
const k1 = k0 < 0 ? -1 : js.indexOf('"left");', k0);
if (k0 >= 0 && k1 > k0) { js = js.slice(0, k0) + js.slice(k1 + '"left");'.length); console.log('readout: stripped from the thumbs bundle'); }
else console.log('WARNING: fps readout call not found in the bundle; it will show in the crops');
writeFileSync('dist/thumbs/main.js', js);
writeFileSync('dist/thumbs/index.html', readFileSync('index.html', 'utf8').replace('<script type="module" src="/src/main.ts"></script>', '<script src="main.js"></script>'));

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  const file = 'dist' + (path.endsWith('/') ? path + 'index.html' : path);
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
  res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/thumbs/index.html`;

const DEG = Math.PI / 180;
const browser = await chromium.launch();
const results = [];

/** JPEG dimensions from the SOF marker. */
function jpegSize(b) {
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return [0, 0];
}

/** Crop [sx, sy, sw, sh] (logical px) from the game canvas -> ow x oh JPEG; re-encode lower if over the byte cap. */
async function capture(page, name, crop, ow, oh, cap) {
  const [sx, sy, sw, sh] = crop;
  const info = await page.evaluate(() => { const g = document.getElementById('c'); return { w: g.width, h: g.height, view: NU._view, scr: NU._scr, mode: NU._mode, sel: NU._sel ? NU._sel._t : null, ok: NU._els.filter(e => e._t === 6).map(e => e._ok) }; });
  if (info.w !== 1920 || info.h !== 1080 || info.view[0] !== 1 || info.view[1] || info.view[2]) console.log(`  WARNING: canvas ${info.w}x${info.h} view=${JSON.stringify(info.view)} (expected 1920x1080, [1,0,0,0])`);
  let q = 0.88, buf, flagged = false;
  for (;;) {
    const url = await page.evaluate(([sx, sy, sw, sh, ow, oh, q]) => {
      const g = document.getElementById('c');
      const c = document.createElement('canvas'); c.width = ow; c.height = oh;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(g, sx * 2, sy * 2, sw * 2, sh * 2, 0, 0, ow, oh);
      return c.toDataURL('image/jpeg', q);
    }, [sx, sy, sw, sh, ow, oh, q]);
    buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    if (buf.length <= cap || q <= 0.5) break;
    if (!flagged) { flagged = true; console.log(`  FLAG: ${name} is ${buf.length} bytes at q=${q} (cap ${cap}); re-encoding lower`); }
    q = Math.round((q - 0.08) * 100) / 100;
  }
  const file = resolve('screenshots', name);
  writeFileSync(file, buf);
  const [w, h] = jpegSize(buf);
  const over = buf.length > cap;
  results.push({ file, w, h, bytes: buf.length, q, cap, over, flagged });
  console.log(`${over ? 'OVER ' : 'ok   '} ${file}  ${w}x${h}  ${buf.length} bytes  q=${q}  [scr=${info.scr} mode=${info.mode} sel=${info.sel} targets=${info.ok.join(',')}]`);
}

const newPage = () => browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });

// 1. title cover: title screen, 2 s after load, 540x540 at x 210..750 -> 500x500
{
  const page = await newPage();
  await page.goto(base); await page.waitForTimeout(2000);
  await capture(page, 'title-cover.jpg', [210, 0, 540, 540], 500, 500, 256000);
  await page.close();
}
// 2. level 2: drag the prism from (360,190) to the authored solution (310,400) and hold -> flower lit, no banner
{
  const page = await newPage();
  await page.goto(base + '?level=2'); await page.waitForTimeout(400);
  await page.mouse.move(360, 190); await page.mouse.down();
  await page.mouse.move(310, 400, { steps: 10 });
  await page.waitForTimeout(500);
  const cx = 310, cy = 400, sx = Math.max(0, Math.min(960 - 540, cx - 270)), sy = Math.max(0, Math.min(540 - 540, cy - 270));
  await capture(page, 'level2-thumb.jpg', [sx, sy, 540, 540], 320, 320, 64000);
  await page.mouse.up(); await page.close();
}
// 3. level 3: rotate-only prism at (235,305): body drag from 50 deg to -27 deg (pointer at angle -77 deg about the center, offa = 50 deg), hold
{
  const page = await newPage();
  await page.goto(base + '?level=3'); await page.waitForTimeout(400);
  await page.mouse.move(235, 305); await page.mouse.down();
  const r = 60, ang = -77 * DEG;
  await page.mouse.move(235 + r * Math.cos(ang), 305 + r * Math.sin(ang), { steps: 10 });
  await page.evaluate(a => { const p = NU._els[1]; p._a = a; NU._dirty = true; }, -27 * DEG); // exact authored angle while still holding
  await page.waitForTimeout(500);
  await capture(page, 'level3-thumb.jpg', [60, 0, 540, 540], 320, 320, 64000);
  await page.mouse.up(); await page.close();
}
// 4. finale cover: ?level=12&solve=1, 1.2 s after load (banner + sky rainbow), x 250..790 -> 500x500
{
  const page = await newPage();
  await page.goto(base + '?level=12&solve=1'); await page.waitForTimeout(1200);
  await capture(page, 'finale-cover.jpg', [250, 0, 540, 540], 500, 500, 256000);
  await page.close();
}

await browser.close();
server.close();
const bad = results.filter(r => r.over);
console.log(bad.length ? `\n${bad.length} file(s) still over the byte cap` : '\nthumbs: all files within their byte caps');
