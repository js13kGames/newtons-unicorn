// Production pipeline: esbuild -> Terser -> Roadroller -> inline HTML -> zip.
// Usage: node build.mjs [--fast] [--O2] [--tag "milestone name"]
// --fast skips Roadroller (quick size checks); --O2 runs Roadroller's thorough search.
import { build } from 'esbuild';
import { minify } from 'terser';
import { Packer } from 'roadroller';
import { ZipArchive } from 'archiver';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const FAST = args.includes('--fast');
const O2 = args.includes('--O2');
const tagIdx = args.indexOf('--tag');
const TAG = tagIdx >= 0 ? args[tagIdx + 1] : '';
const LIMIT = 13312, TARGET = 12500;

mkdirSync('dist', { recursive: true });

// 1. esbuild
const res = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  define: { DEV: 'false' },
  treeShaking: true,
  metafile: true,
  write: false,
  minify: false,
  charset: 'utf8',
  legalComments: 'none',
});
const bundled = res.outputFiles[0].text;
writeFileSync('dist/meta.json', JSON.stringify(res.metafile, null, 1));
writeFileSync('dist/bundle.js', bundled);
const srcBytes = Object.keys(res.metafile.inputs).reduce((s, k) => s + res.metafile.inputs[k].bytes, 0);

// 2. Terser
const t = await minify(bundled, {
  ecma: 2020,
  module: false,
  toplevel: true,
  compress: { passes: 3, unsafe: true, unsafe_arrows: true, unsafe_math: true, pure_getters: true, drop_console: true, booleans_as_integers: true },
  mangle: { toplevel: true, properties: { regex: /^_/ } },
  format: { comments: false, ascii_only: false },
});
let js = t.code;
// esbuild wraps the iife as (()=>{...})(); terser keeps it. Fine.
writeFileSync('dist/min.js', js);

// 3. Roadroller
let packed = js;
if (!FAST) {
  const packer = new Packer([{ data: js, type: 'js', action: 'eval' }], {});
  await packer.optimize(O2 ? 2 : 1);
  const { firstLine, secondLine } = packer.makeDecoder();
  packed = firstLine + secondLine;
}
writeFileSync('dist/packed.js', packed);

// 4. HTML
const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,user-scalable=no"><title>Newton's Unicorn</title><style>html,body{margin:0;background:#000;height:100%;overflow:hidden}canvas{display:block;touch-action:none}</style><canvas id=c></canvas><script>${packed}</script>`;
writeFileSync('dist/index.html', html);

// 5. Zip
await new Promise((resolve, reject) => {
  const out = createWriteStream('dist/game.zip');
  const zip = new ZipArchive({ zlib: { level: 9 } });
  out.on('close', resolve);
  zip.on('error', reject);
  zip.pipe(out);
  zip.append(readFileSync('dist/index.html'), { name: 'index.html', date: new Date(0) });
  zip.finalize();
});
let zipBytes = statSync('dist/game.zip').size;
let ectNote = '';
try {
  const require = createRequire(import.meta.url);
  const ect = require('ect-bin');
  execFileSync(ect, ['-9', '-zip', '--strict', 'dist/game.zip'], { stdio: 'ignore' });
  const after = statSync('dist/game.zip').size;
  ectNote = ` (ECT: ${zipBytes} -> ${after})`;
  zipBytes = after;
} catch (e) { ectNote = ' (ECT not available)'; }

// 6. Report
const B = (s) => Buffer.byteLength(s, 'utf8');
const row = { source: srcBytes, esbuild: B(bundled), terser: B(js), roadroller: FAST ? B(js) : B(packed), html: B(html), zip: zipBytes, headroom: LIMIT - zipBytes };
console.log('\n  stage        bytes');
for (const [k, v] of Object.entries(row)) console.log(`  ${k.padEnd(12)} ${String(v).padStart(6)}`);
console.log(`  limit        ${LIMIT}   target ${TARGET}${FAST ? '   [--fast: Roadroller skipped]' : ''}${ectNote}`);
const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
if (!existsSync('SIZE_LOG.md')) writeFileSync('SIZE_LOG.md', '# Size log\n\n| when | milestone | source | esbuild | terser | roadroller | zip | headroom |\n|---|---|---|---|---|---|---|---|\n');
appendFileSync('SIZE_LOG.md', `| ${when} | ${TAG || (FAST ? '(fast)' : '')} | ${row.source} | ${row.esbuild} | ${row.terser} | ${FAST ? '-' : row.roadroller} | ${row.zip} | ${row.headroom} |\n`);
if (zipBytes > LIMIT) { console.error(`\n  !!! OVER THE 13,312-BYTE LIMIT BY ${zipBytes - LIMIT} BYTES !!!\n`); process.exit(1); }
if (zipBytes > TARGET) console.warn(`\n  WARNING: above the ${TARGET}-byte target by ${zipBytes - TARGET} bytes.\n`);
console.log(`\n  dist/game.zip written (${zipBytes} bytes)\n`);
