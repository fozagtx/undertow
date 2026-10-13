# Undertow PRD

Market intelligence for memecoin traders: a Telegram bot that reads every new pump.fun launch live and tells you who is really holding it.

## Problem
A trader sees a new pump.fun token climbing in its first minute. The holder list shows dozens of wallets, so it looks like real demand, and they buy. Those wallets were funded by one operator and bought inside Jito bundles at launch. Minutes later they sell together, the price collapses, and the trader is the exit liquidity. The proof is on-chain seconds after launch, but nobody can read slot order, bundles and funding trails in the half minute they have to decide.

## User
Retail Solana memecoin traders who buy launchpad tokens in the first minutes through Telegram. Secondary: call-channel admins and trading groups.

## What the user gets
1. Paste a contract address into the bot (DM or group) and get a verdict in seconds: score 0-100, band CLEAN / CAUTION / BUNDLED, % of supply bought in confirmed Jito bundles, % of early buyers sharing one funder, Solami's own intel score, links to every signature and bundle.
2. Every pasted token stays watched. When its bundle wallets sell, the chat gets a dump alert.
3. `/feed on` pushes every new pump.fun launch that scores BUNDLED, live.
4. Daily digest: bundled launches of the day, which dumped, repeat funders.

## Commands
- paste a mint, or `/check <mint>`: verdict
- `/feed on|off`: live BUNDLED feed for this chat
- `/watching`: tokens this chat watches
- `/unwatch <mint>`
- `/start`, `/help`

## How it works
1. **Extract:** Blur WebSocket `token_create` + `swap` on pump.fun. Every launch opens a window; buys in the first slots are recorded with trader, slot, signature, amount.
2. **Verify:**
   - Jito bundle lookup by signature (`bundles.jito.wtf`) for each early buy: real bundle membership, tipper, bundle id.
   - Blur REST `/data/token/intel` (risk score, bundlers, snipers, insiders), `/data/token/first-buyers`, `/data/wallet/cluster` on early buyers (shared funder), `/data/token/creation`.
   - Supply from Solami RPC `getTokenSupply`.
   - Local funder registry: funders seen behind earlier BUNDLED launches.
3. **Judge:** `bundleScore()` pure function, `bundle-score-v1`, weights published in the README and on `/metrics`.
4. **Watch:** flagged wallets' net position from the swap stream; minute cron re-checks via `first-buyers` holdings and fires dump alerts.

## Score (bundle-score-v1)
- `jitoBundleSupplyPct` (35): % of supply bought by early buys confirmed in a Jito bundle
- `earlySupplyPct` (20): % of supply bought by the first-slot buyers (creator excluded)
- `sharedFunderPct` (25): largest single-funder share of early buyers
- `intelScore` (10): Solami intel score 1-10
- `knownFunder` (10): a funder already behind a BUNDLED launch
- bands: 0-29 CLEAN, 30-59 CAUTION, 60-100 BUNDLED

## Metrics (`/metrics`)
Launches seen, analysed, flagged per band, dump alerts sent, active watches, stream connected and last event age, Jito lookup hit rate.

## Stack
Bun + TypeScript, one flat repo. grammy (Telegram), node-cron, zod, `Bun.sql` on Postgres when `DATABASE_URL` is set, local SQLite otherwise. `Bun.serve` for `/health` and `/metrics`. URLs in `src/config.ts`; env only for `SOLAMI_API_KEY`, `TELEGRAM_BOT_TOKEN`.

## Bounty fit (Superteam MY x Solami)
Runs live on mainnet; uses Solami RPC, Blur WebSocket and Blur Data API as the core; public repo; README explains plugging in your own Solami key; metrics shown.

## Out of scope
Trading, wallets, payments, a web UI beyond `/metrics`.
