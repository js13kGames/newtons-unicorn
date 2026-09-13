// One-off pre-upload check: list a zip's entries, extract it to a fresh temp folder, serve THAT folder locally,
// and drive the production page with real input in headless Chromium (no URL params, no DEV globals).
// Usage: node tools/verify-zip.mjs <path/to/game.zip> <shotPrefix>   -> screenshots/<prefix>-title.png, <prefix>-play.png
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createServer } from 'node:http';

const [zipPath, prefix = 'final'] = process.argv.slice(2);
const buf = readFileSync(zipPath);
const errs = [];

// --- minimal zip reader (central directory) ---
let eocd = -1;
for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
if (eocd < 0) { console.log('FAIL  no end-of-central-directory record'); process.exit(1); }
const count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
const entries = [];
for (let p = cdOff, k = 0; k < count; k++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) { errs.push('bad central directory signature'); break; }
  const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
  const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
  const name = buf.toString('utf8', p + 46, p + 46 + nlen);
  entries.push({ name, method, csize, usize, lho });
  p += 46 + nlen + xlen + clen;
}
console.log(`zip ${resolve(zipPath)}  (${buf.length} bytes, ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})`);
for (const e of entries) console.log(`  entry "${e.name}"  method=${e.method === 8 ? 'deflate' : e.method === 0 ? 'store' : e.method}  compressed=${e.csize}  uncompressed=${e.usize}`);
if (!entries.some(e => e.name === 'index.html')) errs.push('no entry named exactly "index.html" at the zip root');
for (const e of entries) if (e.name.includes('/') || e.name.includes(String.fromCharCode(92))) errs.push(`entry has a folder prefix: "${e.name}"`);

// --- extract to a fresh temp folder ---
const dir = mkdtempSync(join(process.env.VERIFY_TMP || tmpdir(), `nu-verify-${prefix}-`));
for (const e of entries) {
  const p = e.lho;
  if (buf.readUInt32LE(p) !== 0x04034b50) { errs.push(`bad local header for ${e.name}`); continue; }
  const nlen = buf.readUInt16LE(p + 26), xlen = buf.readUInt16LE(p + 28), start = p + 30 + nlen + xlen;
  const raw = buf.subarray(start, start + e.csize);
  const data = e.method === 8 ? inflateRawSync(raw) : e.method === 0 ? raw : null;
  if (!data) { errs.push(`unsupported compression method ${e.method} for ${e.name}`); continue; }
  if (data.length !== e.usize) errs.push(`size mismatch for ${e.name}: ${data.length} != ${e.usize}`);
  const out = join(dir, e.name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, data);
}
console.log(`extracted to ${dir}`);
if (!existsSync(join(dir, 'index.html'))) { errs.push('extracted folder has no index.html'); }

// --- serve the extracted folder only ---
const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  const file = join(dir, path.endsWith('/') ? path + 'index.html' : path);
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
  res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

// --- drive with real input ---
const { chromium } = await import('playwright');
mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => {
  addEventListener('unhandledrejection', e => console.error('unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)));
});
const reqs = [];
page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('requestfailed', r => errs.push('requestfailed: ' + r.url()));
page.on('request', r => reqs.push(r.url()));
page.on('response', r => { if (r.status() >= 400) errs.push(`http ${r.status()}: ${r.url()}`); });

const resp = await page.goto(`${base}/index.html`);
if (!resp || !resp.ok()) errs.push('index.html did not load: ' + (resp && resp.status()));
await page.waitForTimeout(1000);
await page.screenshot({ path: `screenshots/${prefix}-title-start.png` });
await page.mouse.click(480, 270); await page.waitForTimeout(400);              // title -> intro
await page.screenshot({ path: `screenshots/${prefix}-intro.png` });
await page.mouse.click(480, 270); await page.waitForTimeout(400);              // intro -> level 1
await page.mouse.move(150, 380); await page.mouse.down();
await page.mouse.move(180, 380, { steps: 10 }); await page.mouse.up();         // drag a piece 30 px
await page.waitForTimeout(300);
await page.screenshot({ path: `screenshots/${prefix}-play.png` });
await page.keyboard.press('r'); await page.waitForTimeout(150);                // reset
await page.keyboard.press('m'); await page.waitForTimeout(150);                // mute toggle
await page.keyboard.press('Escape');                                            // -> title
await page.waitForTimeout(3000);
await page.screenshot({ path: `screenshots/${prefix}-title.png` });
const external = reqs.filter(u => !u.startsWith(base));
if (external.length) errs.push('non-local requests: ' + external.join(', '));
console.log(`requests: ${reqs.length} (all local: ${external.length === 0})  ->  ${reqs.map(u => u.replace(base, '')).join(', ')}`);
await browser.close();
server.close();

console.log(errs.length ? `HEADLESS FAIL (${errs.length})` : 'HEADLESS PASS');
for (const e of errs) console.log('  ' + e);
console.log(`screenshots: screenshots/${prefix}-title.png, screenshots/${prefix}-play.png (also -title-start, -intro)`);
process.exit(errs.length ? 1 : 0);
