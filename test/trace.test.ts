import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refract, reflect, trace, refIndex, GLASS, hitCircle, hitSeg } from '../src/trace.ts';
import { mkEls, EMITTER, PRISM, DROP, TARGET, WALL, W, DEG, type Level } from '../src/elements.ts';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('normal incidence passes straight through', () => {
  const [x, y, c] = refract(1, 0, -1, 0, 1 / 1.5);
  close(x, 1); close(y, 0); assert.equal(c, 1);
  const [x2, y2] = refract(1, 0, -1, 0, 1.5);
  close(x2, 1); close(y2, 0);
});

test('45 degrees into n=1.5 refracts to asin(sin45/1.5)', () => {
  const s = Math.SQRT1_2;
  // surface is the x axis, normal points up (-y) against a ray travelling down-right
  const [x, y] = refract(s, s, 0, -1, 1 / 1.5);
  close(Math.hypot(x, y), 1);
  const theta = Math.atan2(x, y); // angle from the normal (+y axis)
  close(theta, Math.asin(Math.sin(Math.PI / 4) / 1.5));
});

test('beyond the critical angle inside glass -> TIR, unit length, mirrored about the normal', () => {
  const a = 60 * DEG; // incidence 60deg, critical for n=1.5 is 41.8deg
  const dx = Math.sin(a), dy = Math.cos(a);
  const [x, y, c] = refract(dx, dy, 0, -1, 1.5);
  assert.equal(c, 3);
  close(Math.hypot(x, y), 1);
  close(x, dx); close(y, -dy);
});

test('mirror reflection preserves speed and reflects about the normal', () => {
  const [x, y] = reflect(0.6, 0.8, 0, -1);
  close(Math.hypot(x, y), 1); close(x, 0.6); close(y, -0.8);
  // normal sign does not matter for reflection
  const [x2, y2] = reflect(0.6, 0.8, 0, 1);
  close(x2, x); close(y2, y);
  // speed preserved for non-unit vectors too
  const [x3, y3] = reflect(3, 4, Math.SQRT1_2, Math.SQRT1_2);
  close(Math.hypot(x3, y3), 5);
});

test('Cauchy dispersion: n decreases with wavelength', () => {
  for (let b = 1; b < 7; b++) assert.ok(refIndex(GLASS, b) > refIndex(GLASS, b - 1));
});

test('white beam through a 60deg glass prism: seven distinct exits ordered R..V by deviation', () => {
  let checked = false;
  for (let ang = -40; ang <= 40 && !checked; ang += 2) {
    const lv: Level = ['t', '', [[EMITTER, 100, 300, 0, 0, 0], [PRISM, 450, 300, ang, 80, 0]], []];
    const els = mkEls(lv);
    const rays = trace(els);
    // every band must refract in and out (two refraction events, no TIR) and reach the canvas edge
    if (!rays.every(r => r._k.length === 2 && r._k.every(k => k === 1))) continue;
    const dev = rays.map(r => {
      const p = r._p, n = p.length;
      return Math.atan2(p[n - 1] - p[n - 3], p[n - 2] - p[n - 4]); // exit direction angle
    });
    for (let b = 1; b < 7; b++) assert.ok(Math.abs(dev[b]) > Math.abs(dev[b - 1]) + 1e-4, `band ${b} not more deviated than ${b - 1} at prism angle ${ang}`);
    assert.ok(Math.abs(dev[6]) - Math.abs(dev[0]) > 5 * DEG, 'fan too narrow');
    assert.ok(Math.abs(dev[6]) - Math.abs(dev[0]) < 20 * DEG, 'fan too wide');
    checked = true;
  }
  assert.ok(checked, 'no prism angle let all seven bands through');
});

test('drop: refract in, reflect once, refract out (center-offset ray)', () => {
  const lv: Level = ['t', '', [[EMITTER, 100, 270, 0, 0, 0], [DROP, 500, 320, 0, 80, 0]], []];
  const rays = trace(mkEls(lv));
  for (const r of rays) {
    assert.deepEqual(r._k, [1, 2, 1], `band ${r._b} events ${r._k}`);
    assert.equal(r._p.length, 10); // origin, entry, inner hit, exit, edge
    const n = r._p.length;
    assert.ok(r._p[n - 2] < r._p[n - 4], 'exit ray should head back toward the emitter side');
  }
});

test('targets record incident masks; walls absorb; exact accept rule', () => {
  const lv: Level = ['t', '', [[EMITTER, 100, 300, 0, 0, 0], [TARGET, 800, 300, 0, 14, 0, 127]], []];
  const els = mkEls(lv);
  trace(els);
  assert.equal(els[1]._h, 127); assert.equal(els[1]._ok, true);
  els[1]._m = [1];
  trace(els);
  assert.equal(els[1]._ok, false, 'white light must not satisfy a red flower');
  els[1]._m = [-1];
  trace(els);
  assert.equal(els[1]._ok, true, 'negative mask means contains');
  const lv2: Level = ['t', '', [[EMITTER, 100, 300, 0, 0, 0], [WALL, 400, 300, 90, 100, 0], [TARGET, 800, 300, 0, 14, 0, 127]], []];
  const els2 = mkEls(lv2);
  const rays = trace(els2);
  assert.equal(els2[2]._h, 0);
  assert.ok(rays.every(r => r._p.length === 4 && Math.abs(r._p[2] - 400) < 1e-6));
});

test('sun mode emits count parallel rays across width; rays leaving the canvas end on the boundary', () => {
  const lv: Level = ['t', '', [[EMITTER, 0, 270, 0, 140, 0, 24]], []];
  const rays = trace(mkEls(lv));
  assert.equal(rays.length, 24 * 7);
  const ys = new Set(rays.map(r => Math.round(r._p[1])));
  assert.equal(ys.size, 24);
  assert.ok(Math.min(...ys) >= 200 && Math.max(...ys) <= 340);
  for (const r of rays) { close(r._p[2], W); close(r._p[3], r._p[1]); }
});

test('primitive intersections', () => {
  close(hitCircle(0, 0, 1, 0, 10, 0, 3), 7);
  assert.equal(hitCircle(0, 0, -1, 0, 10, 0, 3), Infinity);
  close(hitCircle(10, 0, 1, 0, 10, 0, 3), 3); // from inside
  close(hitSeg(0, 0, 1, 0, [5, -1, 5, 1]), 5);
  assert.equal(hitSeg(0, 0, 1, 0, [5, 1, 5, 2]), Infinity);
  assert.equal(hitSeg(0, 0, 1, 0, [5, 0, 9, 0]), Infinity); // parallel
});

test('numerical hygiene: no NaN in any polyline for a nasty scene', () => {
  // emitter inside a drop, prism overlapping a drop, zero-length wall
  const lv: Level = ['t', '', [[EMITTER, 500, 300, 33, 0, 0], [DROP, 500, 300, 0, 60, 0], [PRISM, 540, 300, 10, 50, 0], [WALL, 700, 300, 0, 0, 0], [TARGET, 900, 100, 0, 14, 0, 1]], []];
  const rays = trace(mkEls(lv), 24);
  for (const r of rays) { assert.ok(r._p.every(v => Number.isFinite(v))); assert.ok(r._k.length <= 24); }
});
