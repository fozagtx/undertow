import cron from "node-cron";
import type { Api } from "grammy";
import { tokenLabel } from "./format.ts";
import { dumps, feed, funders, verdicts } from "./store.ts";
import { sweep } from "./watch.ts";

let sweeping = false;

async function digest(api: Api): Promise<void> {
  const since = Date.now() - 86_400_000;
  const all = verdicts.since(since);
  const bundled = all.filter((v) => v.band === "BUNDLED");
  const dumped = new Map(dumps.since(since).map((d) => [d.mint, d.sold_pct]));
  const repeat = funders.repeat(since);
  const lines = [
    `<b>Undertow, last 24h</b>`,
    `${all.length} launches read, ${bundled.length} BUNDLED, ${dumped.size} dumped after the read.`,
    "",
    ...bundled.slice(0, 5).map((v) => `${v.score}  ${tokenLabel(v.symbol, v.mint)} <code>${v.mint}</code>${dumped.has(v.mint) ? `  sold ${dumped.get(v.mint)}%` : ""}`),
  ];
  if (repeat.length) lines.push("", "<b>Repeat funders</b>", ...repeat.map((r) => `<code>${r.funder}</code> ${r.launches} launches`));
  for (const chat of feed.list()) {
    await api.sendMessage(chat, lines.join("\n"), { parse_mode: "HTML" }).catch((err) => console.error("[digest]", err.message));
  }
}

export function startJobs(api: Api): void {
  cron.schedule("* * * * *", async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await sweep(api);
    } finally {
      sweeping = false;
    }
  });
  cron.schedule("0 12 * * *", () => digest(api).catch((err) => console.error("[digest]", err.message)), { timezone: "UTC" });
}
