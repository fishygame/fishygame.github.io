// The background songs, all from Pixabay (Pixabay Content License). They're re-encoded at 128 kbps
// and evened out to the same loudness. Ids are what the title menu remembers, so keep them stable.

import funky70s from "./assets/music/funky-70s.mp3";
import sunburntSmiles from "./assets/music/sunburnt-smiles.mp3";
import retro8Bit from "./assets/music/retro-8-bit.mp3";
import arcadeEnergy from "./assets/music/arcade-energy.mp3";
import quirkyBlocks from "./assets/music/quirky-blocks.mp3";

export interface Track {
  id: string;
  name: string;
  url: string;
}

export const TRACKS: Track[] = [
  { id: "funky-70s", name: "Catchy and Funky 70's", url: funky70s },
  { id: "sunburnt-smiles", name: "Sunburnt Smiles", url: sunburntSmiles },
  { id: "retro-8-bit", name: "Retro 8-Bit", url: retro8Bit },
  { id: "arcade-energy", name: "Arcade Energy", url: arcadeEnergy },
  { id: "quirky-blocks", name: "Quirky Blocks", url: quirkyBlocks },
];
