import { Bot, type Context } from "grammy";
import { analyzeMint } from "./analyze.ts";
import { DETECTOR, env } from "./config.ts";
import { formatReport, HELP, tokenLabel } from "./format.ts";
import { metrics } from "./metrics.ts";
import { saveReport } from "./pipeline.ts";
import { SolamiError } from "./solami.ts";
import { feed, watches } from "./store.ts";
import { watchReport } from "./watch.ts";

const MINT_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;

export const COMMANDS = [
  { command: "check", description: "Read a token by address" },
  { command: "feed", description: "Live feed of BUNDLED launches: on or off" },
  { command: "watching", description: "Tokens this chat is watching" },
  { command: "unwatch", description: "Stop watching a token" },
  { command: "help", description: "How Undertow works" },
];

function errorText(err: unknown): string {
  if (err instanceof SolamiError && (err.status === 401 || err.status === 403)) return "Solami rejected the API key.";
  const msg = (err as Error).message ?? "";
  if (msg.includes("getTokenSupply")) return "That address is not a token mint.";
  return "Could not read that token right now. Try again in a few seconds.";
}

async function check(ctx: Context, mint: string): Promise<void> {
  metrics.checks++;
  const pending = await ctx.reply(`Reading <code>${mint}</code>...`, { parse_mode: "HTML" });
  try {
    const r = await analyzeMint(mint);
    saveReport(r);
    const watching = watchReport(String(ctx.chat!.id), r, DETECTOR.watchHours);
    const text = formatReport(r) + (watching ? `\n\nWatching ${r.flaggedWallets.length} early wallets for ${DETECTOR.watchHours}h.` : "");
    await ctx.api.editMessageText(ctx.chat!.id, pending.message_id, text, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  } catch (err) {
    console.error(`[check] ${mint}`, (err as Error).message);
    await ctx.api.editMessageText(ctx.chat!.id, pending.message_id, errorText(err));
  }
}

export function createBot(): Bot {
  const bot = new Bot(env.telegramToken);

  bot.command(["start", "help"], (ctx) => ctx.reply(HELP, { parse_mode: "HTML" }));

  bot.command("check", async (ctx) => {
    const mint = ctx.match.match(MINT_RE)?.[0];
    if (!mint) return void (await ctx.reply("Send /check followed by a token address."));
    await check(ctx, mint);
  });

  bot.command("feed", async (ctx) => {
    const id = String(ctx.chat.id);
    const arg = ctx.match.trim().toLowerCase();
    if (arg === "off") {
      feed.remove(id);
      return void (await ctx.reply("Feed off."));
    }
    if (arg === "on" || !feed.has(id)) {
      feed.add(id);
      return void (await ctx.reply("Feed on. Every new pump.fun launch that scores BUNDLED lands here, and its early wallets get watched."));
    }
    await ctx.reply("Feed is on. /feed off to stop.");
  });

  bot.command("watching", async (ctx) => {
    const list = watches.forChat(String(ctx.chat.id));
    if (!list.length) return void (await ctx.reply("Not watching anything. Paste a token address."));
    const lines = list.map((w) => `${tokenLabel(w.symbol, w.mint)} <code>${w.mint}</code> until ${new Date(w.expires_at).toISOString().slice(11, 16)} UTC`);
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("unwatch", async (ctx) => {
    const mint = ctx.match.match(MINT_RE)?.[0];
    if (!mint) return void (await ctx.reply("Send /unwatch followed by a token address."));
    watches.remove(String(ctx.chat.id), mint);
    await ctx.reply("Stopped watching.");
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const mint = ctx.message.text.match(MINT_RE)?.[0];
    if (mint) await check(ctx, mint);
  });

  bot.catch((err) => console.error("[bot]", err.message));
  return bot;
}
