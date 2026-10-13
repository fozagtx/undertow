# Undertow

Market intelligence for memecoin traders, in Telegram. Undertow reads every new pump.fun launch live on Solana mainnet and shows who really holds it: which early buys landed in Jito bundles, how much supply the first wallets took, whether they share one funder, and when they start selling.

## What you get
- **Paste a token address** in a DM or group. You get a read in seconds: score 0-100 (CLEAN, CAUTION, BUNDLED), % of supply bought in confirmed Jito bundles, early buyer share, shared funder, Solami intel flags, links to every transaction.
- **Dump alerts.** Every token you paste stays watched for 24h. When its early and bundled wallets sell 25%, 50% or 75% of what they bought, the chat gets pinged.
- **Live feed.** `/feed on` sends every new launch that scores BUNDLED as it happens, and watches it for dumps.
- **Daily digest** at 12:00 UTC to feed chats: launches read, BUNDLED, which dumped, repeat funders.

Commands: `/check <address>`, `/feed on|off`, `/watching`, `/unwatch <address>`, `/help`.

## How it works
1. **Launch stream.** Solami Blur WebSocket `type=token_create&dex=pumpfun` opens a read for every launch.
2. **Evidence.** For each launch:
   - Blur `/data/token/first-buyers`: the buyers in the first 5 slots.
   - Jito's bundle API, per buy signature: is it in a bundle, and which one.
   - Blur `/data/wallet/cluster`: do the early buyers share a first funder.
   - Blur `/data/token/intel`: Solami's own risk score and flags.
   - Solami RPC `getTokenSupply`.
3. **Score.** `bundle-score-v1` in `src/score.ts`, a pure function with published weights:

   | Signal | Weight | Full at |
   |---|---|---|
   | Supply bought in confirmed Jito bundles | 35 | 30% |
   | Supply bought in the first 5 slots | 20 | 40% |
   | Largest shared-funder share of early buyers (3+ wallets) | 25 | 50% |
   | Solami intel score | 10 | 10/10 |
   | Funder already behind a BUNDLED launch | 10 | yes |

   0-29 CLEAN, 30-59 CAUTION, 60-100 BUNDLED.
4. **Watch.** A second Blur stream (`type=swap&side=sell&address=<watched mints>`) triggers a re-check on every sell; a cron sweep re-checks every minute.

Solami's `intel` labels a wallet a bundler when it bought in the exact creation slot. Undertow adds the Jito bundle check, so a bundled buy one or two slots later is caught and a same-slot buy that was not bundled is not counted.

## Run it
Needs [Bun](https://bun.sh) 1.2+ and a Postgres database.

1. Get a Solami API key with the `DataApi` permission at [solami.dev](https://solami.dev) (Dev plan or higher; Free has no WebSocket).
2. Create a bot with [@BotFather](https://t.me/BotFather). For paste-to-read in groups, turn privacy off with `/setprivacy`; `/check` works either way.
3. Configure and start:

```sh
bun install
cp .env.example .env   # fill in all three values
bun start
```

| Env var | What |
|---|---|
| `SOLAMI_API_KEY` | Your Solami key. Used for Blur WebSocket, Blur Data API and RPC. |
| `TELEGRAM_BOT_TOKEN` | Your bot token. |
| `DATABASE_URL` | Postgres connection string. Feed chats, watches, verdicts and funder memory live here. |
| `PORT` | Optional, default 3000. |

## Deploy on Render
1. In Render, New > Blueprint, pick this repo. `render.yaml` creates the `undertow` web service.
2. Fill in `SOLAMI_API_KEY`, `TELEGRAM_BOT_TOKEN` and `DATABASE_URL` when Render asks. `DATABASE_URL` can be the Internal Database URL of a Render Postgres you already have (the free plan allows one); Undertow keeps its tables in its own `undertow` schema.
3. Open the service URL for the metrics page. A cron pings its own `/health` every 10 minutes so the free instance stays awake and the bot keeps polling.

Run one instance per bot token; Telegram allows a single poller.

Endpoints and tuning (early-slot window, queue size, thresholds) live in `src/config.ts`.

## Metrics
`GET /` metrics page, `GET /metrics` JSON, `GET /health` (503 when the launch stream is down). Tracked: launches seen, analysed, skipped, bands, checks, feed and dump alerts, active watches, Jito lookups and hit rate, stream connection and last event age.
