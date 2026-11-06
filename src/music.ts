// The background songs, all from Pixabay (Pixabay Content License). They're re-encoded at 128 kbps
// and evened out to the same loudness. Ids are what the title menu remembers, so keep them stable.

import funky70s from "./assets/music/funky-70s.mp3";
import sunburntSmiles from "./assets/music/sunburnt-smiles.mp3";
import retro8Bit from "./assets/music/retro-8-bit.mp3";
import quirkyBlocks from "./assets/music/quirky-blocks.mp3";
import happyUkulele from "./assets/music/happy-ukulele.mp3";
import reggaeUnited from "./assets/music/reggae-united.mp3";
import smoothPartyFunk from "./assets/music/smooth-party-funk.mp3";
import tropicalIsland from "./assets/music/tropical-island.mp3";
import magicPearl from "./assets/music/magic-pearl.mp3";
import underwaterFantasy from "./assets/music/underwater-fantasy.mp3";
import funkyGroove from "./assets/music/funky-groove.mp3";
import surfRock from "./assets/music/surf-rock.mp3";
import arcadeGame from "./assets/music/arcade-game.mp3";
import epicAdventure from "./assets/music/epic-adventure.mp3";
import chiptuneStart from "./assets/music/chiptune-start.mp3";
import retroSurfRock from "./assets/music/retro-surf-rock.mp3";

export interface Track {
  id: string;
  name: string;
  url: string;
}

export const TRACKS: Track[] = [
  { id: "funky-70s", name: "Catchy and Funky 70's", url: funky70s },
  { id: "sunburnt-smiles", name: "Sunburnt Smiles", url: sunburntSmiles },
  { id: "retro-8-bit", name: "Retro 8-Bit", url: retro8Bit },
  { id: "quirky-blocks", name: "Quirky Blocks", url: quirkyBlocks },
  { id: "happy-ukulele", name: "Happy Ukulele", url: happyUkulele },
  { id: "reggae-united", name: "Reggae United", url: reggaeUnited },
  { id: "smooth-party-funk", name: "Smooth Party Funk", url: smoothPartyFunk },
  { id: "tropical-island", name: "Tropical Island", url: tropicalIsland },
  { id: "magic-pearl", name: "The Magic Pearl", url: magicPearl },
  { id: "underwater-fantasy", name: "Underwater Fantasy", url: underwaterFantasy },
  { id: "funky-groove", name: "Funky Groove", url: funkyGroove },
  { id: "surf-rock", name: "Surf Rock", url: surfRock },
  { id: "arcade-game", name: "Arcade Game", url: arcadeGame },
  { id: "epic-adventure", name: "Epic Adventure", url: epicAdventure },
  { id: "chiptune-start", name: "Chiptune Start", url: chiptuneStart },
  { id: "retro-surf-rock", name: "Retro Surf Rock", url: retroSurfRock },
];
