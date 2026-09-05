// 12 levels as compact arrays. Element: [type, x, y, angleDeg, size, flags, ...extra]
// type: 0 emitter, 1 prism, 2 drop, 3 mirror, 4 filter, 5 wall, 6 target. flags: 1 move, 2 rot.
// extra: emitter -> ray count (sun mode if > 1, size = bundle width); filter -> pass mask; target -> accept masks.
// Solution: [elementIndex, x, y, angleDeg, ...] applied by the tests, `?solve=1`, and the soft snap.
import type { Level } from './elements.ts';

export const R = 1, O = 2, Y = 4, G = 8, B = 16, I = 32, V = 64, WHITE = 127;

export const LEVELS: Level[] = [
  ['First Light', 'Drag the horn to aim.',
    [[0, 120, 400, -30, 0, 2], [6, 820, 130, 0, 16, 0, WHITE]],
    [0, 120, 400, -21]],
  ['Prism', 'White light hides seven colors. Drag the prism into the beam.',
    [[0, 100, 300, 0, 0, 0], [1, 400, 150, 0, 60, 3], [6, 860, 250, 0, 14, 0, R]],
    [1, 450, 300, 20]],
];
