import { DETECTOR, requireEnv } from "./src/config.ts";
requireEnv();

import { createBot, COMMANDS } from "./src/bot.ts";
import { formatReport } from "./src/format.ts";
import { startJobs } from "./src/jobs.ts";
import { metrics } from "./src/metrics.ts";
import { enqueueLaunch, setReportHandler } from "./src/pipeline.ts";
import { startServer } from "./src/server.ts";
import { feed, initStore, watches } from "./src/store.ts";
import { BlurStream, type Swap, type TokenCreate } from "./src/stream.ts";
import { onSell, setWatchChangeHandler, watchReport } from "./src/watch.ts";

process.on("unhandledRejection", (err: any) => {
  if (err?.error_code === 409) return console.log("[bot] 409 conflict, another instance is polling");
  console.error("[unhandled]", err);
});

const bot = createBot();

setReportHandler(async (r) => {
  if (r.result.band !== "BUNDLED") return;
  for (const chat of await feed.list()) {
    await watchReport(chat, r, DETECTOR.feedWatchHours);
    await bot.api
      .sendMessage(chat, formatReport(r), { parse_mode: "HTML", link_preview_options: { is_disabled: true } })
      .then(() => metrics.feedAlerts++)
      .catch((err) => console.error("[feed]", err.message));
  }
});

const launches = new BlurStream("launches", () => ({ type: "token_create", dex: DETECTOR.launchpad, metadata: "false" }), (e) => {
  if (e.type === "token_create") enqueueLaunch(e as TokenCreate);
});

const watched = new BlurStream("watches", () => {
  const mints = watches.mints();
  return mints.length ? { type: "swap", side: "sell", address: mints.join(","), metadata: "false" } : null;
}, (e) => {
  if (e.type !== "swap") return;
  metrics.swapsSeen++;
  onSell(bot.api, (e as Swap).mint);
});

let restartTimer: Timer | null = null;
setWatchChangeHandler(() => {
  if (restartTimer) return;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    watched.restart();
  }, 2_000);
});

await initStore();
const server = startServer();
console.log(`[server] http://localhost:${server.port}`);
launches.start();
watched.start();
startJobs(bot.api);
await bot.api.setMyCommands(COMMANDS).catch((err) => {
  console.error(`[bot] Telegram rejected TELEGRAM_BOT_TOKEN: ${err.description ?? err.message}`);
  process.exit(1);
});
bot.start({ onStart: (me) => console.log(`[bot] @${me.username} polling`) });
