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

| | |
|---|---|
| Start | 100,000 WebCoins each (host can change it). Passing START pays 10,000, and landing exactly on it pays 5,000 more. |
| Dice | 2 dice. Doubles roll again. Three doubles in a row sends you to The Raft. |
| Properties | 30 cards in 6 groups of 5 (A Amazing Spiders, S Symbiotes, 6 Sinister Six, G Sinister Syndicate, V Villains Inc., W Spider-Verse). You can buy one when you land on it. |
| Rent | Land rent comes from the card and is **doubled if the owner holds all 5** of the group. 1H/2H/3H are houses, and H is the Web HQ. |
| Build | Own **3 of 5** in a group (host setting), then pay the card's BUILD cost per level. |
| Lease (L column) | The bank pays the lease value for the property's current level. While leased it earns no rent and can't be built on. Buying it back costs +10%. |
| **?** Spider-Sense | Draw a card: Bugle photo money, J.J.J. lawsuit, Rhino (jail), pardon card, Aunt May's wheatcakes, and more. |
| **This Way / That Way / Another Way** | Pick one: 3 spaces forward, 3 spaces back, or web-swing to the other signpost for +2,000. |
| **Tax** | 10% of your net worth (minimum 2,000, maximum 15,000). |
| **Jail (The Raft)** | You're jailed by landing on it, drawing a Rhino card, or rolling 3 doubles. To get out, roll doubles (3 tries), pay 5,000 bail, or use a pardon. You still collect rent while jailed. |
| Spider-Sense Stash (corner) | Taxes, fines and bail pile up here, and whoever lands on it takes the pot. |
| Lease Office (corner) | A 2,000 grant, plus buy-backs without interest for the rest of that turn. |
| Multiverse Portal | Pay 2,000 to jump to any property. |
| Debt | Lease properties to raise cash. If that still isn't enough, you're bankrupt and your assets go to the creditor. |
| Win | The last player standing wins. With a time limit set, the richest player wins when it runs out. |

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
