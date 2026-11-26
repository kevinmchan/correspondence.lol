// The meadow: the reward for the first bar of energy (shared/energy.js). A
// room wears it once it is earned: grass in the map's squares, a hedge in
// flower for its walls, its table a picnic blanket, the sun out (in the dark,
// the moon and fireflies), and a butterfly (room/meadow.css). It is paint only:
// nothing that can be pressed moves or changes size.
//
// It is on from the moment it is earned. The meadow at the end of the bar on
// the home page takes it off and puts it back on; that choice is kept on this
// device. Everything here goes on working, unremembered, without storage.

import { ENERGY_KEY, folkOf, meadowEarned, read } from '/shared/energy.js';
import { load, save } from '/shared/identity.js';

export const MEADOW_KEY = 'correspondence:meadow:v1'; // 'off' when it has been taken off

export const earned = () => meadowEarned(read(load(ENERGY_KEY)));
export const wearing = () => earned() && load(MEADOW_KEY) !== 'off';
export function wear(on) {
  save(MEADOW_KEY, on ? null : 'off');
}

// Three stages, a bar of energy each (folkOf, in shared/energy.js). The first bar is the meadow, and the things in it
// are things. The second is the discovery: energy runs through everything, and the things to press were alive all
// along, and asleep (room/folk.js draws them, a current going through them one after another). The third bar, more
// energy and wonder, wakes them.
// Who is in the meadow now, and whether they are awake: nobody, where the meadow is not worn.
export const folk = () => (wearing() ? folkOf(read(load(ENERGY_KEY))) : { kinds: [], awake: false });
