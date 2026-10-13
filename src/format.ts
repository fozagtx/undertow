import { LINKS } from "./config.ts";
import type { Report } from "./analyze.ts";
import { MODEL } from "./score.ts";

const short = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const link = (href: string, text: string) => `<a href="${href}">${esc(text)}</a>`;
const pct = (n: number) => `${n.toFixed(1)}%`;

export function tokenLabel(symbol: string | null | undefined, mint: string): string {
  return symbol ? `$${esc(symbol)}` : short(mint);
}

export function formatReport(r: Report): string {
  const lines: string[] = [];
  lines.push(`<b>${r.result.band} ${r.result.score}/100</b>  ${tokenLabel(r.symbol, r.mint)}`);
  lines.push(`<code>${r.mint}</code>`);
  lines.push("");

  const bundledBuys = r.bundles.reduce((n, b) => n + b.buyers.length, 0);
  if (bundledBuys > 0) {
    lines.push(`<b>Jito bundles:</b> ${bundledBuys} early buys in ${r.bundles.length} bundle${r.bundles.length > 1 ? "s" : ""} took ${pct(r.features.jitoBundleSupplyPct)} of supply`);
    for (const b of r.bundles.slice(0, 3)) {
      const first = b.buyers[0];
      const tx = first ? link(LINKS.tx(first.signature), "tx") : "";
      lines.push(`  ${b.buyers.length} buys, slot ${b.slot}${b.includesLaunchTx ? ", with the launch tx" : ""} ${tx}`);
    }
  } else if (r.bundles.some((b) => b.includesLaunchTx)) {
    lines.push(`<b>Jito bundles:</b> launch tx landed in a bundle, no early buys in it`);
  } else {
    lines.push(`<b>Jito bundles:</b> none found in the first ${r.earlySlots} slots`);
  }

  lines.push(`<b>Early buyers</b> (first ${r.earlySlots} slots): ${r.earlyBuyers} wallets, ${pct(r.features.earlySupplyPct)} of supply`);

  if (r.topFunder) {
    const prior = r.topFunder.priorMints.length ? `, behind ${r.topFunder.priorMints.length} earlier flagged launch${r.topFunder.priorMints.length > 1 ? "es" : ""}` : "";
    lines.push(`<b>Shared funder:</b> ${r.topFunder.funded} of ${r.topFunder.of} early buyers funded by ${link(LINKS.account(r.topFunder.funder), short(r.topFunder.funder))}${r.topFunder.sameSlotFunded ? ` (${r.topFunder.sameSlotFunded} in the same slot)` : ""}${prior}`);
  }

  if (r.intel) {
    const flags = r.intel.flags.length ? ` (${r.intel.flags.join(", ")})` : "";
    lines.push(`<b>Solami intel:</b> ${r.intel.score}/10${flags}${r.intel.rugged ? ", rugged" : ""}`);
  }

  if (r.insiderSoldPct > 0) lines.push(`<b>Early wallets sold:</b> ${pct(r.insiderSoldPct)} of what they bought`);

  lines.push("");
  lines.push(`${link(LINKS.token(r.mint), "token")}${r.launchSignature ? ` | ${link(LINKS.tx(r.launchSignature), "launch tx")}` : ""}  <i>${MODEL.name}</i>`);
  return lines.join("\n");
}

export function formatDump(symbol: string | null, mint: string, soldPct: number, sellers: number, wallets: number): string {
  return [
    `<b>DUMP ${tokenLabel(symbol, mint)}</b>`,
    `Early and bundled wallets sold ${pct(soldPct)} of what they bought (${sellers} of ${wallets} wallets selling).`,
    `<code>${mint}</code>`,
    link(LINKS.token(mint), "token"),
  ].join("\n");
}

export const HELP = [
  "<b>Undertow</b> reads every new pump.fun launch live and shows who really holds it.",
  "",
  "Paste a token address to get a read: Jito bundles at launch, early buyer share, shared funders, Solami intel. The token stays watched and you get pinged when the early wallets sell.",
  "",
  "/check &lt;address&gt; read a token",
  "/feed on | off  live feed of launches that score BUNDLED",
  "/watching  tokens this chat is watching",
  "/unwatch &lt;address&gt;",
].join("\n");
