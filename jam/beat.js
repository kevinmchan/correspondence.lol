// A beat, as a short piece of text: what is saved, and what goes in a link.
//
// A beat is which tiles hold a note, for each of the four instruments, and
// the tempo. Eight steps by seven rows is 56 tiles, which is seven bytes an
// instrument: 28 bytes, and one in front for the kind of code this is and the
// tempo. In letters that are safe in an address that comes to 39 characters,
// so a whole beat fits in a link and nothing has to be kept on a server.

//
// The deck can hold four sounds more, recorded ones (jam/mic.js), each with a
// part of its own. A beat with a note in any of those is written the longer
// way: eight parts, 57 bytes, 76 characters. One without is written as it
// always was, so that every link there has ever been still means what it did.

export const STEPS = 8;
export const ROWS = 7;
export const LAYER_COUNT = 4; // the instruments
export const DECK_COUNT = 8; // and with the sounds that can be put beside them
export const TEMPO_COUNT = 4;
const TILES = STEPS * ROWS;
const KINDS = { 1: LAYER_COUNT, 2: DECK_COUNT }; // the first half of the first byte: how many parts are written after it
const SAFE = { '+': '-', '/': '_' };
const BACK = { '-': '+', '_': '/' };

// { tempo, notes }: tempo is which of the tempos (0 to 3); notes is, for each
// part, the tiles that hold a note (step * ROWS + row).
export function encode({ tempo, notes }) {
  const kind = notes.slice(LAYER_COUNT).some((tiles) => tiles?.length) ? 2 : 1;
  const bytes = new Uint8Array(1 + KINDS[kind] * 7);
  bytes[0] = (kind << 4) | (tempo & 0x0f);
  for (let layer = 0; layer < KINDS[kind]; layer++) {
    for (const tile of notes[layer] ?? []) {
      if (Number.isInteger(tile) && tile >= 0 && tile < TILES) bytes[1 + layer * 7 + (tile >> 3)] |= 1 << (tile & 7);
    }
  }
  return btoa(String.fromCharCode(...bytes)).replace(/[+/]/g, (c) => SAFE[c]).replace(/=+$/, '');
}

// The beat a code stands for, or null if it is not one (a link cut short, or
// made up). Its notes are as many parts as were written: four, or eight.
export function decode(code) {
  if (typeof code !== 'string' || !/^([A-Za-z0-9_-]{39}|[A-Za-z0-9_-]{76})$/.test(code)) return null;
  let raw;
  try {
    raw = atob(code.replace(/[-_]/g, (c) => BACK[c]) + (code.length === 39 ? '=' : ''));
  } catch {
    return null;
  }
  const parts = KINDS[raw.charCodeAt(0) >> 4];
  if (!parts || raw.length !== 1 + parts * 7) return null;
  const tempo = raw.charCodeAt(0) & 0x0f;
  if (tempo >= TEMPO_COUNT) return null;
  const notes = [];
  for (let layer = 0; layer < parts; layer++) {
    const tiles = [];
    for (let tile = 0; tile < TILES; tile++) {
      if (raw.charCodeAt(1 + layer * 7 + (tile >> 3)) & (1 << (tile & 7))) tiles.push(tile);
    }
    notes.push(tiles);
  }
  if (parts === DECK_COUNT && notes.slice(LAYER_COUNT).every((tiles) => tiles.length === 0)) return null; // (written the long way for nothing: not as encode writes it)
  return { tempo, notes };
}

export const isEmpty = (beat) => beat.notes.every((tiles) => tiles.length === 0);
