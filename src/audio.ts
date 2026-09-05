// Procedural WebAudio: band tones, fanfare, SFX, ambient pad, mute. Filled in at milestone 5.
export const SFX_PICK = 0, SFX_DROP = 1, SFX_TICK = 2, SFX_WRONG = 3, SFX_CLICK = 4, SFX_WHOOSH = 5;

export function unlock() { /* create the AudioContext on the first gesture */ }
export function sfx(_id: number) { /* ZzFX-style one-shots */ }
export function setTones(_mask: number) { /* ramp band oscillators */ }
export function fanfare(_mask: number) { /* solve arpeggio */ }
export function setMute(_m: boolean) { /* master gain */ }
