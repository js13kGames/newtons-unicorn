import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trace } from '../src/trace.ts';
import { mkEls, applySolution, isSolved, pick, handlePos, elDist, EMITTER, TARGET, MOVE, ROT, W, H, type El } from '../src/elements.ts';
import { LEVELS } from '../src/levels.ts';
import { HUD, MB, MB_R } from '../src/input.ts';

assert.ok(LEVELS.length >= 10, 'at least 10 levels');

for (let i = 0; i < LEVELS.length; i++) {
  const lv = LEVELS[i];
  test(`level ${i + 1} "${lv[0]}": initial layout is not solved, authored solution solves it`, () => {
    const els = mkEls(lv);
    assert.ok(els.some(e => e._t === EMITTER), 'has an emitter');
    assert.ok(els.some(e => e._t === TARGET), 'has a target');
    for (const e of els) assert.ok(e._x >= 0 && e._x <= W && e._y >= 0 && e._y <= H, 'element on canvas');
    trace(els, i === LEVELS.length - 1 ? 24 : 16);
    assert.equal(isSolved(els), false, 'initial layout must not be solved');
    const sol = lv[3];
    assert.ok(sol.length && sol.length % 4 === 0, 'solution is [index,x,y,angle]*');
    for (let k = 0; k < sol.length; k += 4) {
      const e = els[sol[k]];
      assert.ok(e, `solution index ${sol[k]} exists`);
      assert.ok(e._f & (MOVE | ROT), `solution element ${sol[k]} is interactive`);
    }
    applySolution(els, sol);
    trace(els, i === LEVELS.length - 1 ? 24 : 16);
    const masks = els.filter(e => e._t === TARGET).map(e => `${e._h}${e._ok ? '' : '!'}`).join(' ');
    assert.equal(isSolved(els), true, `solution should solve the level (target masks: ${masks})`);
  });

  // Pickability guard: every interactive piece is what pick() returns at its own center and (ROT) at its rotate ring - the
  // emitter's ring is the horn tip - and no interactive hit area (body or ring) overlaps a HUD button or, in levels that show
  // them, a mobile rotate button. Checked in the initial layout and at the authored solution.
  test(`level ${i + 1} "${lv[0]}": interactive pieces are pickable at their center and ring, clear of the buttons`, () => {
    const els = mkEls(lv), hasRot = els.some(e => e._f & ROT);
    const hit = (e: El, x: number, y: number) => { // pick's metric: signed distance to the body or the 12 px ring
      const [hx, hy] = handlePos(e);
      return Math.min(elDist(e, x, y), e._f & ROT ? Math.hypot(x - hx, y - hy) - 12 : 1e9);
    };
    const check = (label: string) => {
      for (const e of els) if (e._f & (MOVE | ROT)) {
        const k = els.indexOf(e);
        assert.equal(pick(els, e._x, e._y, 0), e, `${label}: element ${k} is picked at its center`);
        if (e._f & ROT) { const [hx, hy] = handlePos(e); assert.equal(pick(els, hx, hy, 0), e, `${label}: element ${k} is picked at its rotate ring`); }
        if (e._t === EMITTER) assert.equal(pick(els, e._x, e._y, 0), e, `${label}: the horn tip picks the emitter`);
        for (const b of HUD) assert.ok(hit(e, b[0], b[1]) >= 24, `${label}: element ${k} overlaps a HUD button at ${b}`);
        if (hasRot) for (const b of MB) assert.ok(hit(e, b[0], b[1]) >= MB_R + 10, `${label}: element ${k} overlaps a mobile rotate button at ${b}`);
      }
    };
    check('initial');
    applySolution(els, lv[3]);
    check('solved');
  });
}
