// Headless Chromium check (Playwright): the production zip's index.html must load with zero console errors,
// then a DEV bundle is opened at ?level=N&solve=1 for every level and screenshotted.
// Usage: node test/headless.mjs   (run `npm run build` first)
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const { chromium } = await import('playwright');
mkdirSync('screenshots', { recursive: true });

// DEV bundle for level screenshots
mkdirSync('dist/dev', { recursive: true });
await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'iife', target: 'es2020', define: { DEV: 'true' }, outfile: 'dist/dev/main.js', logLevel: 'error' });
writeFileSync('dist/dev/index.html', readFileSync('index.html', 'utf8').replace('<script type="module" src="/src/main.ts"></script>', '<script src="main.js"></script>'));

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  const file = 'dist' + (path.endsWith('/') ? path + 'index.html' : path);
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
  res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch();
let failures = 0;
async function open(url, ms, shot, act) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errs.push('requestfailed: ' + r.url()));
  const reqs = [];
  page.on('request', r => reqs.push(r.url()));
  await page.goto(url);
  if (act) await act(page);
  await page.waitForTimeout(ms);
  await page.screenshot({ path: shot });
  const external = reqs.filter(u => !u.startsWith(base));
  if (external.length) errs.push('external requests: ' + external.join(', '));
  const state = await page.evaluate(() => globalThis.NU ? { scr: NU._scr, li: NU._li } : null).catch(() => null);
  await page.close();
  const ok = errs.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${url.replace(base, '')}  -> ${shot}${state ? `  [scr=${state.scr} level=${state.li + 1}]` : ''}`);
  for (const e of errs) console.log('      ' + e);
  return state;
}

// 1. production build, title screen, 3 s, no errors, no network
await open(`${base}/index.html`, 3000, 'screenshots/title.png');
// 1b. production build: click through title -> intro -> level 1 and drag something
await open(`${base}/index.html`, 1500, 'screenshots/play.png', async page => {
  await page.mouse.click(480, 270); await page.waitForTimeout(300);
  await page.mouse.click(480, 270); await page.waitForTimeout(300);
  await page.mouse.move(150, 380); await page.mouse.down(); await page.mouse.move(400, 200, { steps: 10 }); await page.mouse.up();
  await page.keyboard.press('e'); await page.keyboard.press('r'); await page.keyboard.press('m');
});
// 2. DEV bundle: every level solved via URL
const { LEVELS } = await import('../src/levels.ts');
for (let n = 1; n <= LEVELS.length; n++) {
  const st = await open(`${base}/dev/index.html?level=${n}&solve=1`, 1200, `screenshots/level${String(n).padStart(2, '0')}.png`);
  if (st && st.scr !== 3 && !(n === LEVELS.length && st.scr === 4)) { failures++; console.log(`      level ${n} did not reach the solved screen (scr=${st.scr})`); }
}
await browser.close();
server.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nheadless: all checks passed');
process.exit(failures ? 1 : 0);
