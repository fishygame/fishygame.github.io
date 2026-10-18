/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "local" keeps high scores in the player's browser; anything else uses the shared board. */
  readonly VITE_SCORE_BOARD?: string;
  /** The game's name, shown on the title screen and the browser tab. */
  readonly VITE_TITLE?: string;
}
