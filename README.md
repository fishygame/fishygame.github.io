# Fishy

A small "eat smaller fish, avoid bigger fish" game built with TypeScript, HTML5 Canvas and Vite.

## Run it

```bash
npm install
npm run dev      # opens a dev server with hot reload (http://localhost:5173)
npm run build    # typechecks and outputs a static site to dist/
npm run deploy   # builds and publishes dist/ to the gh-pages branch (GitHub Pages)
```

## Controls

- Arrow keys or WASD swim. Your fish builds up speed, then coasts to a stop when you let go.
- On a touch screen, put a finger down anywhere and drag to steer; drag further to swim faster.
  The buttons in the top-right corner pause and mute.
- Eat fish smaller than you to grow. Touch a bigger fish and it's game over. Watch out for
  slow-moving giants.
- Sharks can't be eaten at any size. Touching one is always game over.
- Space pauses (the game also pauses if the window loses focus).
- Reach the target size to win. After a game ends, tap, click, Space or Enter restarts.
- M mutes all sound. The music starts on your first key press, click or tap.

## Layout

- `src/main.ts`: game loop, input, spawning, collisions, HUD and screens
- `src/fish.ts`: the `Fish` class (movement, and drawing for both fish and sharks)
- `src/scenery.ts`: the aquarium backdrop (water, sand, seaweed, castle, treasure chest)
- `src/sound.ts`: background music and sound effects
- `src/assets/music.mp3`: the background music ("Catchy and Funky 70's" by Plattenberg)
- `src/assets/burp.mp3`: the eating sound ("belchy burp 1" by freesound_community)

## Tweaks worth trying

Constants at the top of `src/main.ts` control win size, growth rate, spawn rate,
giant fish, sharks, and player speed/acceleration. To change the music, replace
`src/assets/music.mp3` and update the loop points at the top of `src/sound.ts`. In
`src/fish.ts`, the red outline on dangerous fish is the `danger` flag in `draw()`; remove it
for a harder game.
