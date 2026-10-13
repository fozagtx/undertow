import type { Api } from "grammy";
import { flaggedPosition, type Report } from "./analyze.ts";
import { DETECTOR } from "./config.ts";
import { formatDump } from "./format.ts";
import { metrics } from "./metrics.ts";
import { dumps, watches } from "./store.ts";

let onChange: () => void = () => {};
export function setWatchChangeHandler(fn: () => void) {
  onChange = fn;
}

function crossed(soldPct: number): number {
  return DETECTOR.dumpThresholds.filter((t) => soldPct >= t).pop() ?? 0;
}

export function watchReport(chatId: string, r: Report, hours: number): boolean {
  if (!r.flaggedWallets.length) return false;
  const isNew = !watches.forMint(r.mint).length;
  watches.upsert({
    chat_id: chatId,
    mint: r.mint,
    symbol: r.symbol,
    wallets: r.flaggedWallets,
    initial: String(r.insiderSoldPct),
    expires_at: Date.now() + hours * 3_600_000,
  });
  const already = crossed(r.insiderSoldPct);
  if (already) watches.setAlerted(chatId, r.mint, already);
  if (isNew) onChange();
  return true;
}

const lastCheck = new Map<string, number>();

export async function checkMint(api: Api, mint: string): Promise<void> {
  const list = watches.forMint(mint);
  if (!list.length) return;
  lastCheck.set(mint, Date.now());
  const wallets = [...new Set(list.flatMap((w) => w.wallets))];
  const pos = await flaggedPosition(mint, wallets);
  const level = crossed(pos.soldPct);
  for (const w of list) {
    if (level <= w.last_alert_pct) continue;
    watches.setAlerted(w.chat_id, mint, level);
    try {
      await api.sendMessage(w.chat_id, formatDump(w.symbol, mint, pos.soldPct, pos.sellers, wallets.length), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
      metrics.dumpAlerts++;
    } catch (err) {
      console.error("[watch] send", (err as Error).message);
    }
  }
  if (level) dumps.record(mint, Math.round(pos.soldPct));
}

const pending = new Map<string, Timer>();
export function onSell(api: Api, mint: string): void {
  if (pending.has(mint)) return;
  const wait = Math.max(0, 10_000 - (Date.now() - (lastCheck.get(mint) ?? 0)));
  pending.set(
    mint,
    setTimeout(() => {
      pending.delete(mint);
      checkMint(api, mint).catch((err) => console.error("[watch]", (err as Error).message));
    }, wait + 3_000),
  );
}

export async function sweep(api: Api): Promise<void> {
  const before = watches.mints().length;
  watches.purge();
  for (const mint of watches.mints()) {
    try {
      await checkMint(api, mint);
    } catch (err) {
      console.error(`[sweep] ${mint}`, (err as Error).message);
    }
  }
  if (watches.mints().length !== before) onChange();
}
