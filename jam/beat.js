// A beat, as a short piece of text: what is saved, and what goes in a link.
//
// A beat is which tiles hold a note, for each of the four instruments, and
// the tempo. Eight steps by seven rows is 56 tiles, which is seven bytes an
// instrument: 28 bytes, and one in front for the kind of code this is and the
// tempo. In letters that are safe in an address that comes to 39 characters,
// so a whole beat fits in a link and nothing has to be kept on a server.

export const STEPS = 8;
export const ROWS = 7;
export const LAYER_COUNT = 4;
export const TEMPO_COUNT = 4;
const TILES = STEPS * ROWS;
const KIND = 1; // the first half of the first byte: this layout of the board
const SAFE = { '+': '-', '/': '_' };
const BACK = { '-': '+', '_': '/' };

// { tempo, notes }: tempo is which of the tempos (0 to 3); notes is, for each
// instrument, the tiles that hold a note (step * ROWS + row).
export function encode({ tempo, notes }) {
  const bytes = new Uint8Array(1 + LAYER_COUNT * 7);
  bytes[0] = (KIND << 4) | (tempo & 0x0f);
  for (let layer = 0; layer < LAYER_COUNT; layer++) {
    for (const tile of notes[layer] ?? []) {
      if (Number.isInteger(tile) && tile >= 0 && tile < TILES) bytes[1 + layer * 7 + (tile >> 3)] |= 1 << (tile & 7);
    }
  }
  return btoa(String.fromCharCode(...bytes)).replace(/[+/]/g, (c) => SAFE[c]).replace(/=+$/, '');
}

// The beat a code stands for, or null if it is not one (a link cut short, or made up).
export function decode(code) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{39}$/.test(code)) return null;
  let raw;
  try {
    raw = atob(code.replace(/[-_]/g, (c) => BACK[c]) + '=');
  } catch {
    return null;
  }
  if (raw.length !== 1 + LAYER_COUNT * 7 || raw.charCodeAt(0) >> 4 !== KIND) return null;
  const tempo = raw.charCodeAt(0) & 0x0f;
  if (tempo >= TEMPO_COUNT) return null;
  const notes = [];
  for (let layer = 0; layer < LAYER_COUNT; layer++) {
    const tiles = [];
    for (let tile = 0; tile < TILES; tile++) {
      if (raw.charCodeAt(1 + layer * 7 + (tile >> 3)) & (1 << (tile & 7))) tiles.push(tile);
    }
    notes.push(tiles);
  }
  return { tempo, notes };
}

export const isEmpty = (beat) => beat.notes.every((tiles) => tiles.length === 0);
