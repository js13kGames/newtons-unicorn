// Level authoring probe: traces a level literal and reports where every band lands, target masks and solved state.
// Usage:
//   node tools/probe.mjs level.json                 trace the initial layout
//   node tools/probe.mjs level.json --solve         apply the level's solution first
//   node tools/probe.mjs level.json --sweep 1:a:-60:60:2     sweep element 1's angle (x|y|a) from -60 to 60 step 2 (after --solve if given)
//   node tools/probe.mjs level.json --grid 1:300:700:20:100:400:20   scan element 1 over x 300..700 step 20, y 100..400 step 20; prints solved cells
//   node tools/probe.mjs --level 5 [--solve]        use LEVELS[4] from src/levels.ts instead of a file
// level.json holds one Level: [name, hint, elements, solution]. Angles in degrees. Output coordinates rounded.
import { readFileSync } from 'node:fs';
import { trace } from '../src/trace.ts';
import { mkEls, applySolution, isSolved, TARGET, DEG } from '../src/elements.ts';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
let lv;
if (flag('--level')) { const { LEVELS } = await import('../src/levels.ts'); lv = LEVELS[+flag('--level') - 1]; }
else lv = JSON.parse(readFileSync(args[0], 'utf8'));
const BAND = 'ROYGBIV';
const maxB = lv[2].some(e => e[0] === 0 && e[6] > 1) ? 24 : 16;

function run(els, verbose) {
  const rays = trace(els, maxB);
  const tg = els.filter(e => e._t === TARGET);
  const out = { solved: isSolved(els), targets: tg.map(e => ({ i: els.indexOf(e), x: e._x, y: e._y, need: e._m, got: e._h, ok: e._ok })) };
  if (verbose) {
    console.log('rays (band: path ... end):');
    for (const r of rays) {
      const p = r._p, n = p.length;
      const pts = [];
      for (let i = 0; i < n; i += 2) pts.push(`(${p[i].toFixed(0)},${p[i + 1].toFixed(0)})`);
      const ex = p[n - 2], ey = p[n - 1];
      let end = 'edge';
      const hit = tg.find(e => Math.hypot(ex - e._x, ey - e._y) <= e._s + 0.01);
      if (hit) end = 'TARGET#' + els.indexOf(hit);
      else if (ex > 0.01 && ex < 959.99 && ey > 0.01 && ey < 539.99) end = 'absorbed(wall/filter)';
      const dirDeg = n >= 4 ? (Math.atan2(ey - p[n - 3], ex - p[n - 4]) / DEG).toFixed(1) : '?';
      console.log(`  ${BAND[r._b]}: ${pts.join(' ')}  events=${r._k.join('')}  exitDir=${dirDeg}deg  ${end}`);
    }
  }
  return out;
}

const els = mkEls(lv);
if (args.includes('--solve')) applySolution(els, lv[3]);

const sweep = flag('--sweep');
const grid = flag('--grid');
if (sweep) {
  const [i, p, a, b, s] = sweep.split(':');
  const e = els[+i];
  for (let v = +a; v <= +b; v += +s) {
    if (p === 'a') e._a = v * DEG; else if (p === 'x') e._x = v; else e._y = v;
    const o = run(els, false);
    console.log(`${p}=${v}\tsolved=${o.solved}\t` + o.targets.map(t => `#${t.i}:${t.got}${t.ok ? '✓' : ''}`).join(' '));
  }
} else if (grid) {
  const [i, x0, x1, xs, y0, y1, ys] = grid.split(':').map(Number);
  const e = els[i];
  for (let y = y0; y <= y1; y += ys) {
    let row = '';
    for (let x = x0; x <= x1; x += xs) { e._x = x; e._y = y; row += run(els, false).solved ? '#' : '.'; }
    console.log(String(y).padStart(4) + ' ' + row);
  }
  console.log('     x from', x0, 'to', x1, 'step', xs);
} else {
  const o = run(els, true);
  console.log('targets:', JSON.stringify(o.targets));
  console.log('solved:', o.solved);
}
