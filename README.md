# Webopoly 🕷️

An online multiplayer, Spider-Verse-themed property trading board game for 2–6 players. It has private rooms, peer-to-peer voice chat, text chat, emoji reactions, trading, and a real two-dice roll.

- **Client:** React 19, Vite, Tailwind v4, shadcn/ui (Radix), Motion, Sonner
- **Server:** Node, Express, Socket.IO. The server holds the authoritative game state, so clients can't cheat on dice or money.
- **Voice:** a WebRTC mesh. The server only relays signaling; audio goes directly between browsers.

## Run locally

```bash
npm install
npm run dev          # game server on :3001 + Vite on http://localhost:5180
```

To play against yourself, open several browser tabs. Each tab is a separate player, and a refresh reconnects you to your seat.
Other devices on your Wi-Fi can join at `http://<your-LAN-IP>:5180`. Voice chat only works on `localhost` or HTTPS.

```bash
npm run build        # type-check, then build the client (dist/) and bundle the server (dist-server/)
npm start            # production: one Node process serves the site and the websockets on $PORT
npx tsx scripts/simulate.ts 300   # bots play 300 games to smoke-test the rules engine
npx tsx scripts/rules-check.ts    # exact checks for the house rules
```

## Project layout

| Path | What |
|---|---|
| `shared/board.ts` | All 40 tiles and the 30 property cards (transcribed from `CARDS.pdf`) |
| `shared/rules.ts` | Rent, build, lease, tax and net-worth math, shared by the client and server |
| `shared/cards.ts` | The 16-card "Spider-Sense ?" deck |
| `server/game.ts` | Game engine: turns, dice, jail, debt, bankruptcy, trades, turn timer |
| `server/index.ts` | Rooms, reconnects, chat, and voice signaling over Socket.IO |
| `src/components/game/*` | Board, dice, action panel, property cards, trades, voice controls |
| `public/board.webp`, `public/tiles/` | Your board art, plus each tile cut out of it |

## Rules

Everything below is also in the game: the **Rules** tab in the sidebar (the rule book), the **Rules** button at the top, and a popup when you click any special spot. Click a player to see their cards.

- **Direction:** anticlockwise; from START you go down the left side first. Roll 2 dice. **Doublets never give an extra roll** (except in jail, below).
- **START:** 5,000 each time you cross or land on it. **Ultimate START** (100,000; offered to every player before the first roll, and sold in the Token Shop) raises that to 10,000.
- **Cards:** build on any card you own (3 houses, then a hotel). **Set bonus:** hold 3+ cards of one color and each earns +2,000 rent.
- **UNO (?) / CHANCE (This Way / That Way):** the dice total that brought you there picks the result (land with a 6 → result 6). There is no extra roll.
  - UNO results: tax-for-card free · Token Shop ban · go to your place · no START reward once · collect 5,000 from each player · pay 1.5x rent · free Jail card · pay double rent · +20,000 · destroy one of your buildings · +100,000.
  - CHANCE results: go to Tax · go to the Token Shop · surrender a card · go to START · give 5,000 to each player · pay half rent · go to jail · set bonus +2,000 for 2 rounds (counted from that spot) · lose 20,000 · free house-tax card · lose 100,000.
  - Half / 1.5x / double rent applies to your **next 2 rent payments** to other players.
- **Tax:** 1,000 per card, 500 per house, 1,000 per hotel.
- **Token Shop (spider emblem corner):** only **one item per visit**. Items: Start card 3,000 · Ultimate Start card 5,000 (Ultimate START owners only) · Jail card 17,000 · Ultimate START 100,000 · Tax for card 8,000 · Tax for house & hotel 11,000 · Random roll 12,000 (1 die) · Sinister 6 card 8,000 (needs a "6" card) · Web card 17,000 (needs a "W" card) · Symbiote card 12,000 (needs an "S" card).
  - **Sinister 6:** +2,000 rent on each of your "6" cards for 2 rounds, counted from where you activate it.
  - **Web:** glue an opponent who lands on your place for 3 more turns and collect rent each turn.
  - **Symbiote:** pull an opponent onto your place and they pay the rent. Cards can be combined.
- **Jail:** up to 5 turns, with no income while inside.
  - Doublet: one roll per jail turn, 3 chances in total. A doublet frees you and you move that same turn.
  - Paying 20,000 or using a Jail card frees you, but you move on your next turn.
  - When you get out you hold a **Criminal card**: no buying or building on the first spot you land on.
- **Spider-Verse:**
  - You may pay 15,000 to jump to your own card or an unowned card (not a special spot).
  - From your next turn you roll and move **backward**, stopping on the Spider-Verse even if your roll is bigger. Then you roll again right away to carry on forward.
  - While reversing, the spots you land on still apply, but Jail can't lock you up.
- **Lease:** at the Lease spot, lease a card for 3 rounds. A round is counted each time the renter comes back to the Lease spot.
  - From the unowned pile you pick the level (base, 1-3 houses or hotel) and pay that level's lease value each round.
  - Between players, both must agree and the card keeps its current level.
  - The renter collects the rent but gets no set bonus. Afterwards the card returns to its owner or the unowned pile.
- **Debt:** sell whole cards back to the bank for their price plus everything spent building on them. If that still isn't enough, you're bankrupt.

## Hosting

The server keeps each game in memory and needs long-lived WebSocket connections. Host it as **one always-on Node service**, not as serverless functions.

**Recommended: Railway** (simplest, about $5/month)
1. Push this folder to a GitHub repo.
2. On railway.app, create a New Project, choose Deploy from GitHub, and pick the repo. Railway detects the `Dockerfile`.
3. Under Settings, Networking, click Generate Domain. You get HTTPS, which voice chat requires.

**Alternatives**
- **Render (free):** `render.yaml` uses the free plan. It sleeps after ~15 min idle; first visit wakes it in ~1 min.
- **Fly.io:** `fly launch` uses the Dockerfile. Pick a region close to your players.
- **Vercel:** not a good fit for this server. Its functions don't keep the long-running Socket.IO process and in-memory rooms. You can put the frontend on Vercel (set `VITE_SERVER_URL`) and the server on Railway, but one Railway service is simpler.

**Voice across strict networks:** STUN works for most home networks. Some mobile carrier and corporate networks need a TURN relay. Get one from Cloudflare Calls TURN or metered.ca, then set:

```
TURN_URLS=turn:your.turn.host:3478,turns:your.turn.host:5349
TURN_USERNAME=...
TURN_CREDENTIAL=...
```

Other env vars: `PORT` (set by the host), `CORS_ORIGIN` (only needed when the client is hosted on a different domain).
