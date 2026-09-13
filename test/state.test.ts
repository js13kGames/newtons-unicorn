import { test } from 'node:test';
import assert from 'node:assert/strict';
import { G, PLAY, SOLVED, checkSolved, loadLevel } from '../src/state.ts';
import { TARGET } from '../src/elements.ts';

// checkSolved() only reads the flowers' _ok flags, so the tracer is not involved: level 1 is loaded and its flower forced lit / dark.
const lit = (on: boolean) => G._els.forEach(e => { if (e._t === TARGET) e._ok = on; });
function held(t: number) {
  G._t = t;
  loadLevel(0);
  lit(true);
  G._mode = 1; // a drag is in progress
}

test('solve while held: not before 0.4 s of everything lit, solved after (gesture ended)', () => {
  held(10);
  assert.equal(checkSolved(), false, 'first lit frame starts the hold timer');
  G._t = 10.2; assert.equal(checkSolved(), false, 'not solved at 0.2 s');
  assert.equal(G._scr, PLAY);
  G._t = 10.5; assert.equal(checkSolved(), true, 'solved at 0.5 s');
  assert.equal(G._scr, SOLVED);
  assert.equal(G._mode, 0, 'the gesture is ended');
  assert.equal(G._sel, undefined);
});

test('a flower that flickers dark at 0.3 s restarts the hold timer', () => {
  held(20);
  checkSolved();
  G._t = 20.3; lit(false); assert.equal(checkSolved(), false, 'dark flower');
  G._t = 20.31; lit(true); assert.equal(checkSolved(), false, 'timer restarted');
  G._t = 20.5; assert.equal(checkSolved(), false, 'only 0.19 s since the restart');
  assert.equal(G._scr, PLAY);
  G._t = 20.8; assert.equal(checkSolved(), true, '0.49 s since the restart');
});

test('release with everything lit solves at once; a fresh level does not inherit the timer', () => {
  held(30);
  checkSolved();
  G._mode = 0;
  G._t = 30.05; assert.equal(checkSolved(), true, 'released -> solved immediately');
  // next level: lit under a gesture must again wait 0.4 s
  held(31);
  assert.equal(checkSolved(), false);
  G._t = 31.2; assert.equal(checkSolved(), false, 'the previous level’s timer does not carry over');
});
