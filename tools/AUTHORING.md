# Level authoring reference (Newton's Unicorn)

## Coordinate system
- Logical canvas 960 x 540, origin top-left, **y grows downward**. Angles are in **degrees** in level data and rotate **clockwise** on screen (because y is down). Angle 0 points right (+x); angle -90 points up; +90 points down.
- The ground/grass line is at y = 518. Flowers grow on stems to the ground, so put flower centers at y <= 470 (any y works, but > 470 looks odd). The top 50 px holds the HUD, the bottom 50 px holds the hint text; keep flowers/elements out of those bands if possible. Keep every element >= 30 px from the canvas edges.
- The unicorn stands at the emitter: its horn tip IS the emitter point. The body occupies roughly a 70 px radius circle behind the tip (opposite the aim direction) and down to the ground. Prefer the emitter on the left (x 60..160, y 250..420) aiming right (angle 0 or a small +-angle). Player-movable elements are clamped to stay >= 70 px from the emitter.

## Level literal
```
[name, hint, elements, solution]
element = [type, x, y, angleDeg, size, flags, ...extra]
type: 0 emitter, 1 prism, 2 drop, 3 mirror, 4 filter, 5 wall, 6 target
flags: 0 fixed, 1 movable, 2 rotatable, 3 both
size: prism = circumradius (60 is a good default, 45..80 ok); drop/target = radius (targets 14..16; drops 40..90);
      mirror/filter/wall = segment length; emitter = sun-bundle width (only used when extra rayCount > 1)
extra: emitter -> [rayCount] (omit or 1 for a single white beam; > 1 = sun mode, parallel bundle of rayCount rays spread over `size` px perpendicular to the beam)
       filter  -> [passMask]   (bits R=1 O=2 Y=4 G=8 B=16 I=32 V=64)
       target  -> [...acceptMasks]  a flower is satisfied when the OR of all bands hitting it EXACTLY equals one of these masks.
                  A NEGATIVE mask means "contains": -64 is satisfied when violet is among the incident bands (used for the finale only).
solution = [elementIndex, x, y, angleDeg, ...] flat, one quadruple per interactive element that must be moved/rotated
           (list every element with flags != 0 even if only one coordinate changes; rotation-only elements keep their x,y).
```
Accept presets: R 1, O 2, Y 4, G 8, B 16, I 32, V 64, white 127, yellow-mix [4, 9] (pure yellow band OR red+green), magenta [65], cyan/teal [24].

## Geometry conventions
- Prism: equilateral triangle. At angle 0, vertex 0 points straight up (-y) and the base is horizontal at the bottom. Rotating by +20 turns it clockwise on screen. A prism has 120-degree symmetry.
- Mirror / filter / wall: a segment of length `size` centered at (x, y) along direction `angleDeg` (angle 90 = vertical). Mirrors reflect from both faces and never change color. Filters pass only the bands in their mask. Walls absorb everything. 180-degree symmetry.
- Drop: circle. Light refracts in, **always reflects once** at the first inner surface hit, then refracts out (the primary-rainbow path). A horizontal beam that hits the drop above its center exits back toward the emitter side going DOWN-left; hitting below the center it exits going UP-left. Deviation depends on the impact parameter b (distance from the center line): near b/r ~ 0.86 the exit angle is stationary (minimum deviation: 42.4 degrees above the reversed beam axis for red, i.e. exit direction -137.6 deg for a beam aimed right; 26.9 degrees / -153.1 deg for violet), and rays bunch there. The caustic ray of a band is the completed enter->reflect->exit ray with the LARGEST angle from the reversed axis.
- Emitter: a single white beam (all 7 bands overlapping) from (x, y) in direction angleDeg.
- Physics: Cauchy n = A + B/lambda^2 with glass A=1.45 B=0.03, water A=1.27 B=0.03 (lambda in um; R 700nm .. V 400nm). Glass n: R 1.511, O 1.528, Y 1.539, G 1.557, B 1.586, I 1.605, V 1.638. Water n: R 1.331, O 1.348, Y 1.359, G 1.377, B 1.406, I 1.425, V 1.458. A 60-degree prism near minimum deviation fans the beam by ~12 degrees (red least deviated). Total internal reflection happens when the exit angle is too steep: if a band shows event code 3 it was internally reflected; usually you want event codes `11` (in, out) for a prism.
- Rays end at: a target (absorbed, recorded), a wall, a filter that rejects the band, or the canvas edge. Max 16 bounces (24 in sun mode).

## Probe tool
```
node tools/probe.mjs my.json                # trace the initial layout; prints every band's polyline, event codes, exit direction, what it hit, target masks, solved
node tools/probe.mjs my.json --solve        # same after applying the solution
node tools/probe.mjs my.json --solve --sweep 1:a:-60:60:2       # sweep element 1's angle (x|y|a) and print solved + target masks per value
node tools/probe.mjs my.json --solve --grid 1:300:700:10:100:400:10   # scan element 1 over x,y; '#' = solved
```
Event codes per band: 1 refract, 2 reflect, 3 TIR, 4 passed a filter. A `got` mask on a target is the OR of the bands that hit it.
Write your JSON with the literal exactly as it will appear in TypeScript (strings for name/hint, numbers elsewhere).

## Design rules (all levels)
1. One intended insight per level; the hint is the only text. Solvable in <= 3 drags, < 60 s for a competent player.
2. The **initial layout must not be solved** and should not be solved by a trivially small nudge, but the solution should be reachable by moving/rotating the flagged elements.
3. The solution must be **tolerant**: the solved region must be at least ~6 px wide in x and y for movable elements and at least ~1.5 degrees wide for rotations (the game soft-snaps within 8 px / 2 degrees of the authored solution, but the player must be able to find it by feel). Verify with --sweep / --grid and report the tolerance.
4. Because of the exact-accept rule, make sure stray bands do not touch a flower in the solution (e.g. the orange band must not clip the red flower). Use flower radius 14-16 and spacing accordingly; a fan of 7 bands at ~400 px from a prism spreads ~80 px, i.e. ~12 px between neighbouring bands, so flowers meant for a single band should sit farther from the prism or use a mirror to lengthen the path. Check `got` on each target in the probe output.
5. Fixed elements (flags 0) are scenery/constraints; use walls to block cheap solutions (e.g. a decoy flower behind a wall, or a wall that blocks the direct beam so the player must use the mirror).
6. Do not place anything within 80 px of the emitter (the unicorn stands there). Do not put flowers under the HUD (y < 50) or under the hint (y > 490).
7. Integers only in the literal (positions, angles, sizes).
