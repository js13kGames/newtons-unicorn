# Newton's Unicorn

*Newton had a prism. You have a unicorn.*

An optics puzzle for [js13kGames 2026](https://js13kgames.com) (theme: **Unicorns and Rainbows**). The sky has lost its colors. Your unicorn's horn emits white light; bend it through prisms, raindrops, mirrors and filters to bring color back to grey flowers. The rainbow is never drawn as an image: every colored beam is computed live from Snell's law with wavelength-dependent refraction, and the final level reproduces the physics of a real rainbow, sunlight through a single raindrop with the colors emerging at about 42 degrees.

Entry page: _(js13kgames.com link placeholder)_

## How to play

Each level shows the unicorn, a few optical elements and grey flowers. Every flower has a thin ring in the color it needs. Light a flower with **exactly** that color (a red flower is not satisfied by white light, because white still contains the other six bands). When every flower has its color the level is solved and the game moves on. Twelve levels, five to eight minutes.

### Controls

| action | desktop | touch |
|---|---|---|
| select | click | tap |
| move an element | drag it | drag it |
| rotate an element | drag its rotate handle, mouse wheel over it (1 degree per notch), or `←`/`→` / `Q`/`E` (hold to repeat, `Shift` for 0.2 degrees) | drag its rotate handle, or hold the on-screen ⟲ ⟳ buttons |
| aim the unicorn | drag the horn tip | drag the horn tip |
| reset level | `R` or the ⟲ button | ⟲ button |
| mute | `M` or the ♪ button | ♪ button |
| title screen | `Esc` or the ≡ button | ≡ button |
| continue after a solve | `Enter` / click | tap |

Elements that are drawn dimmer are fixed. Releasing an element close to a working position snaps it into place.

## The physics

The refractive index of each of the seven bands follows Cauchy's equation `n(λ) = A + B/λ²`. For water the constants are anchored so that red light (700 nm) has its real index, 1.331, which puts the red rainbow at the true **42.4°**; the dispersion term is exaggerated for the other six bands so the fan is legible on a 960-pixel canvas (violet lands at 26.9° instead of the real 40.6°). Every surface interaction is Snell's law in vector form with total internal reflection when the exit angle is too steep. Raindrops follow the primary-rainbow path deterministically, refract in, reflect once at the inner surface, refract out, which is why the finale's bundle of sunlight bunches at the rainbow angle with red on the outside. The finale measures that angle live from the traced rays and prints it next to the drop.

## Development

```
npm install
npm run dev        # Vite dev server (http://localhost:5173)
npm test           # tracer + level tests (Node test runner)
npm run build      # esbuild -> Terser -> Roadroller -> dist/index.html -> dist/game.zip (fails if > 13,312 bytes)
npm run build:fast # same without Roadroller (quick size checks)
npm run headless   # Playwright: zero-console-error check + a screenshot of every solved level
```

Dev URL parameters: `?level=N` jumps to a level, `?solve=1` applies its authored solution, `?editor=1` opens the level editor overlay (keys are listed on screen). `node tools/probe.mjs --level N [--solve]` traces a level in Node and prints where each color band lands.

## Credits

- Design and code: mxingweb.
- Sound effects generator derived from [ZzFX](https://github.com/KilledByAPixel/ZzFX) by Frank Force (MIT).
- Compression by [Roadroller](https://github.com/lifthrasiir/roadroller) by Kang Seonghoon (MIT); zip optimized with ECT.

## License

MIT.
