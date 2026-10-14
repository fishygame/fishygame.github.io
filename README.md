# Fishy

A small "eat smaller fish, avoid bigger fish" game built with TypeScript, HTML5 Canvas and Vite.

Play it at https://fishygame.github.io

## Run it

```bash
npm install
npm run dev      # opens a dev server with hot reload (http://localhost:5173)
npm run build    # typechecks and outputs a static site to dist/
npm run deploy   # builds and publishes dist/ to the gh-pages branch (GitHub Pages)
```

Deploying pushes with the GitHub CLI's active account (`gh auth status`), which needs write access
to the fishygame org.

## Controls

- The game opens on a title menu (Start Game, Instructions, High Scores). After a game ends,
  the Main menu button or Esc goes back to it.
- Arrow keys or WASD swim. Your fish builds up speed, then coasts to a stop when you let go.
- On a touch screen, put a finger down anywhere and drag to steer; drag further to swim faster.
  The buttons in the top-right corner pause and mute.
- Eat fish smaller than you to grow. Touch a bigger fish and it's game over. Watch out for
  slow-moving giants.
- Sharks can't be eaten, until you're over halfway to the win size. From then on nothing can eat
  you and the screen fills with smaller fish: a feeding frenzy.
- Now and then a fishing line drops in. Touch the hook and you get reeled in (game over), unless
  you're in the frenzy, when you bite through the line instead.
- Space pauses (the game also pauses if the window loses focus).
- Grow until you nearly fill the screen to win. After a game ends, tap, click, Space or Enter
  restarts.
- A top-5 score asks for a name (up to 8 characters) for the global high score board.
- M mutes all sound. The music starts on your first key press, click or tap.

## Layout

- `src/main.ts`: game loop, input, spawning, collisions, HUD and screens
- `src/fish.ts`: the `Fish` class (movement, and drawing for both fish and sharks)
- `src/hook.ts`: the fishing line that drops in now and then, and sometimes catches a fish
- `src/scenery.ts`: the aquarium backdrop (water, sand, seaweed, castle, treasure chest, and
  the whale and sea turtles that swim by now and then)
- `src/sound.ts`: background music and sound effects
- `src/highscores.ts`: talks to the high score board
- `server/high-scores.mjs`: the board itself, an AWS Lambda (see below)
- `src/assets/music.mp3`: the background music ("Catchy and Funky 70's" by Plattenberg)
- `src/assets/burp.mp3`: the eating sound ("belchy burp 1" by freesound_community)

## Tweaks worth trying

Constants at the top of `src/main.ts` control win size, growth rate, spawn rate,
giant fish, sharks, and player speed/acceleration. To change the music, replace
`src/assets/music.mp3` and update the loop points at the top of `src/sound.ts`. In
`src/fish.ts`, the red outline on dangerous fish is the `danger` flag in `draw()`; remove it
for a harder game.

## High scores

The board is the `fishy-high-scores` Lambda in AWS us-east-1, with a public function URL (set in
`src/highscores.ts`) and the `fishy-high-scores` DynamoDB table. The Lambda checks names
(length, characters and a bad-word filter), limits each IP to one score every 10 seconds, and
keeps the top 5. After editing `server/high-scores.mjs`, upload it with:

```bash
cp server/high-scores.mjs index.mjs && zip fn.zip index.mjs && rm index.mjs
aws lambda update-function-code --function-name fishy-high-scores --zip-file fileb://fn.zip && rm fn.zip
```

To wipe the board: `aws dynamodb delete-item --table-name fishy-high-scores --key '{"pk":{"S":"board"}}'`
