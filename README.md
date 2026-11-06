# Big Fish Frenzy

Called Big Fish Frenzy on both the family site and itch since 2026-11-06 (the family site was
"Fishy" before; the repo, its web address and the score boards keep the old name). A small "eat smaller fish, avoid bigger fish" game built with TypeScript, HTML5 Canvas and Vite.

Play it at https://fishygame.github.io

## Run it

```bash
npm install
npm run dev      # opens a dev server with hot reload (http://localhost:5173)
npm run build    # typechecks and outputs a static site to dist/
npm run deploy   # builds and publishes dist/ to the gh-pages branch (GitHub Pages)
```

`npm run build:itch` builds the itch.io version, "Big Fish Frenzy", into `dist-itch/` and zips it
as `big-fish-frenzy-itch.zip`, ready to upload. It keeps each player's best scores in their own
browser instead of the shared board. The two builds differ only in the settings in `.env` and
`.env.itch`.

`npm run deploy:itch` builds it and uploads `dist-itch/` to https://tclark333.itch.io/big-fish-frenzy
with [butler](https://itch.io/docs/butler/), itch.io's upload tool, on the `html5` channel. It
needs butler on the PATH, signed in once with `butler login`.

Deploying pushes with the GitHub CLI's active account (`gh auth status`), which needs write access
to the fishygame org.

## Controls

- The game opens on a title menu: pick a mode and difficulty (remembered for next time), then
  Start Game, Instructions or High Scores. After a game ends, the Main menu button or Esc goes
  back to it.
- **Classic** scores each fish by its size next to yours (bigger meals are worth far more).
  **Speed** scores every fish the same, times a combo that grows with each bite taken within 2
  seconds of the last (up to x10), plus a time bonus for winning under 5 minutes.
  **Survival** starts you a bit bigger, but you never grow and every fish is bigger than you: you
  score 10 points a second for staying alive, and holding still (no keys or finger, nearly stopped)
  builds a multiplier up to x5, one step a second, which moving resets. A new level comes every
  20 seconds. Survival has no Easy/Medium/Hard (the menu hides the picker): the levels are the
  difficulty, and it keeps one set of boards (stored under `medium`). It's busy from the start: the
  sea begins half full, with a few plain sharks. A hook comes at level 2, a crab and darting sharks
  at 3, two hooks at 4, two crabs at 5, and so on to four hooks and three crabs by level 8; a few
  fish start darting (red eyes) at level 10, more each level after. The crowd and the sharks build
  slowly and peak around levels 13-15. Fish start anywhere from the surface to the sand and hooks
  can drop to the sand, so the bottom is no hideout. How many fish there are scales with the
  screen's size, so a big monitor is as crowded as a laptop. The levels are `survivalRamp()` in `src/settings.ts`.
- **Medium** is the original game. **Easy** has no sharks or crab, a gentler start and rarer
  hooks. **Hard** has more sharks (all of them darters), more hooks and crabs, more fast fish,
  and no red outlines on the fish that can eat you.
- Arrow keys or WASD swim. Your fish builds up speed, then coasts to a stop when you let go.
- On a touch screen, put a finger down anywhere and drag to steer; drag further to swim faster.
  The buttons in the top-right corner pause and mute.
- Eat fish smaller than you to grow. Touch a bigger fish and it's game over. Watch out for
  slow-moving giants.
- Sharks can't be eaten (and most now and then double back in a quick Z), until you're over halfway to the win size. From then on nothing can eat
  you and the screen fills with smaller fish: a feeding frenzy.
- Now and then a fishing line drops in. Touch the hook and you get reeled in (game over), unless
  you're in the frenzy, when you bite through the line instead.
- In Classic and Speed, a single gold coin drops in from the surface every 13-20 s (the first
  5-8 s in) and flutters down like a real coin in water, tumbling end over end and drifting side to
  side, then rocks to a stop on the sand, rests there 5 s (flashing, faster and faster, for the last 1.6 s) and vanishes. Eat it for 100 points, shown
  as a gold "+100"; in Speed it also counts as a bite for the combo. It never hangs from a line, so
  it can't be mistaken for the hook's worm. Not in Survival. (It replaced a clump of fish food worth
  300 points and 6 coins every 40-60 s, so a game pays about the same.)
- Coins and the shop (called the Treasure Chest in the game): every game pays coins: 1 for playing, 1 per tenth of the growth bar, 6 for
  a win and 2 per sinking coin caught (Survival: nothing for playing, then 1 a level got through for levels 1-3, 2
  for 4-6, 4 for 7-9, 6 for 10-12, then 8; the level banner shows each level's coins), times the difficulty (Easy x0.5,
  Medium x1, Hard x2; Survival x1). The main menu shows each difficulty's rate. In play, a named player sees the coins the game has paid so far ("+23", popping as it goes up) next to the score, or under the growth bar on a narrow screen. The High Scores
  screen shows each player's fish in their outfit next to their name (from their wallet; a plain
  fish if they have none); point at (or tap) one to see it big. The Treasure Chest keeps your coins,
  your fish and the Buy button in view while the items scroll, beside them on a wide screen. The Shop sells
  looks, hats and trails for your fish (cosmetics only, so the boards stay about skill), tried on
  in a live preview. Prices are in `ITEMS` in `src/shop.ts`.
- Players: the main menu's "Playing as ..." picks who's playing, so a family can share one device
  and each game's coins go to whoever earned them. Guest is always there, needs no name, and earns
  no coins (its end screen says to add a name). A player is just a name, no password; on the
  family site each player's coins sync through the Lambda, so adding the same name on another
  device brings them along. Taking a player off a device saves their coins first. On itch,
  players go by initials and their coins stay in the browser.
  Nobody should start over as a Guest: the first time a device loads with players, the name it
  last saved a high score under becomes its player (once; `fishy-player-seeded`), and on a device
  with no players a Guest who saves a high score becomes that name.
- Space pauses (the game also pauses if the window loses focus).
- Grow until you nearly fill the screen to win. After a game ends, tap, click, Space or Enter
  restarts.
- Each mode and difficulty has three global top-10 boards: this week (starts fresh every Monday,
  US Eastern), all time, and player best (each name's best score only, matching names whatever
  the capitals). This week and all time allow repeats, so one player can hold every place. A
  score that makes any of them asks for a name (up to 8 characters); for player best, that means
  beating the best of the name last saved on this device (or, with no saved name or one not on
  the board, making the board as a new player). The end screen shows this
  week and all time side by side (player best in place of all time if that's the only other one
  you made), or just one on a narrow screen; the High Scores menu switches between all three.
- Each score also shows how that game ended: BIG FISH (won), Shark bait, Fish food (a bigger
  fish), Hooked or Crab snack. Scores from before 2026-11-02 have no ending and show none.
- M mutes all sound, and N (or the skip button in the corner) skips to the next song. The music
  starts on your first key press, click or tap. The Sound screen on the title menu picks the eating
  sound (a gulp, or the original burp) and which songs play, shuffled or in order, and plays any
  of them to hear what it sounds like.

## Layout

- `src/main.ts`: game loop, input, spawning, collisions, scoring, HUD and screens
- `src/settings.ts`: the game modes, the tuning for each difficulty, and Survival's levels
- `src/fish.ts`: the `Fish` class (movement, and drawing for both fish and sharks)
- `src/hook.ts`: the fishing line that drops in now and then, and sometimes catches a fish
- `src/crab.ts`: the crab that scuttles along the sand now and then
- `src/sinking-coin.ts`: the bonus gold coin that tumbles down from the surface now and then
- `src/shop.ts`: the shop's items and prices, what games pay, and the wallet (local, and synced by
  username through the Lambda)
- `src/hats.ts`, `src/trail.ts`: the shop's hats and trails (looks are in `src/fish.ts`)
- `src/scenery.ts`: the aquarium backdrop (water, sand, seaweed, castle, treasure chest, and
  the whale and sea turtles that swim by now and then)
- `src/sound.ts`: background music (one song after another from the playlist) and sound effects
- `src/music.ts`: the list of songs
- `src/highscores.ts`: talks to the high score board
- `server/high-scores.mjs`: the board itself, an AWS Lambda (see below)
- `src/assets/music/`: the songs, all from Pixabay (Pixabay Content License), re-encoded at 128 kbps
  and evened out to the same loudness (about -12 LUFS)
- `src/assets/gulp.mp3` and `burp.mp3`: the eating sounds ("Gulp - Hard Swallow" by magnuswaker on
  Freesound, CC0; "belchy burp 1" by freesound_community on Pixabay)

## Tweaks worth trying

Constants at the top of `src/main.ts` control win size, growth rate, spawn rate, giant fish,
fish colors, Speed mode scoring, and player speed/acceleration. What changes with difficulty
(sharks, the crowded start, hook and crab timing, red outlines) is in `src/settings.ts`. To add a song, put the mp3 in
`src/assets/music/` (128 kbps, about -12 LUFS) and add it to `src/music.ts`. 

## High scores

The board is the `fishy-high-scores` Lambda in AWS us-east-1, with a public function URL (set in
`src/highscores.ts`) and the `fishy-high-scores` DynamoDB table. The Lambda checks names
(length, characters and a bad-word filter), limits each IP to one score every 10 seconds, and
keeps the top 10 of each mode and difficulty: all time and this week, repeats allowed, and player best. Classic on Medium's
all-time board is the original one, item `board`; the others are `board#<mode>#<difficulty>`
(e.g. `board#speed#hard`). This week's are `week#<Monday>#<mode>#<difficulty>` (e.g.
`week#2026-11-02#speed#hard`, the Monday by US Eastern time) and expire a year later through the
table's TTL on `expires`. Player best is `players#<mode>#<difficulty>` (Classic on Medium too), the
top 10 names by their best score; until a board's first save it's made on the fly from the
all-time and weekly boards. GET returns `{ scores, weekly, players }`; POST returns `{ scores,
rank, weekly, weeklyRank, players, playerRank }`. Requests without a
mode or difficulty get Classic on Medium, so update the Lambda before deploying a game that
sends them. Speed and Survival boards also keep each game's time (`time`, whole seconds); scores saved
before 2026-10-25's time update have none and show a dash. Every score keeps how the game ended (`end`: `won`, `shark`, `fish`, `hook` or `crab`; anything else gets a 400), shown with the labels in `END_LABEL` in `src/highscores.ts`. After editing `server/high-scores.mjs`, upload it with:

```powershell
Copy-Item server/high-scores.mjs index.mjs; Compress-Archive index.mjs fn.zip -Force; Remove-Item index.mjs
aws lambda update-function-code --function-name fishy-high-scores --zip-file fileb://fn.zip; Remove-Item fn.zip
```

(Git Bash on this machine has no `zip`, hence PowerShell.)

The same Lambda keeps the shop's wallets, item `wallet#<username in lower case>`: `earned` (all
coins ever), `owned`, `equipped`, `equippedAt` and `seen` (the last 500 game ids). GET
`?wallet=<name>` reads one; POST `{ wallet, games: [{ id, coins }], owned, equipped, outfitChanged }`
merges a device's changes and returns the result. The merge only adds: each game id pays once (at
most 200 coins an entry; the game splits a bigger game into several), owned is a union of real
shop items, and an outfit sent with `outfitChanged` replaces the stored one, timed by the server's
clock. Unknown items, repeats and bad game entries are dropped, not rejected, so one bad entry can't
block a player's syncing. Nothing new means no write, and each IP gets 30 wallet writes a minute
(row `wip#<ip>`, separate from the score cooldown). The game works out the balance (earned minus the
prices of what's owned). **The Lambda's `CATALOG` must list the same item ids as `ITEMS` in
`src/shop.ts`: when adding an item, deploy the Lambda first.** The game also ignores any item it
doesn't know, so an old page never crashes on a newer item. If a player's coins can't reach the
server, the Who's playing? screen says so and the game retries every 30 seconds. Board responses (GET and a saved score's POST) give each entry its player's `outfit`, looked up
from the wallets (one read per name on the boards). Deploy the Lambda
before a game that syncs wallets.

To test the Lambda without touching the real boards or wallets: `node server/dev/test.mjs` runs
its checks against an in-memory table, and `node server/dev/serve.mjs` serves it on
http://localhost:8787 for a dev server started with `VITE_SCORE_API=http://localhost:8787/`
(in PowerShell: `$env:VITE_SCORE_API = "http://localhost:8787/"; npx vite --port 5174`). A copy run that
way shows a red "Test copy" tag. The local Lambda keeps everything in memory, so restarting it
empties its boards and wallets; `PORT=8788` runs a second one.

To wipe a board: `aws dynamodb delete-item --table-name fishy-high-scores --key '{"pk":{"S":"board"}}'`
(or `board#speed#hard`, and so on)
