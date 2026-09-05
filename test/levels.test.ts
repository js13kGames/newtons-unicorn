import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trace } from '../src/trace.ts';
import { mkEls, applySolution, isSolved, EMITTER, TARGET, MOVE, ROT, W, H } from '../src/elements.ts';
import { LEVELS } from '../src/levels.ts';

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
}
