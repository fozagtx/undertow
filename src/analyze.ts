import { DETECTOR } from "./config.ts";
import { bundleForTx, mapLimit, type JitoBundle } from "./jito.ts";
import { metrics } from "./metrics.ts";
import { creation, firstBuyers, intel, tokenSupply, walletCluster, type Creation, type FirstBuyer, type Intel } from "./solami.ts";
import { bundleScore, MODEL, type BundleFeatures, type BundleScore } from "./score.ts";
import { funders } from "./store.ts";

export interface BundleEvidence {
  bundleId: string;
  slot: number;
  tipLamports: number;
  includesLaunchTx: boolean;
  buyers: { wallet: string; signature: string; amount: number; pct: number }[];
}

export interface Report {
  mint: string;
  symbol: string;
  name: string;
  creator: string | null;
  launchSlot: number | null;
  launchSignature: string | null;
  decimals: number;
  earlyBuyers: number;
  earlySlots: number;
  bundles: BundleEvidence[];
  topFunder: { funder: string; funded: number; of: number; sameSlotFunded: number; priorMints: string[] } | null;
  intel: { score: number; rugged: boolean; flags: string[]; bundlersPct: number; snipersPct: number; insidersPct: number } | null;
  features: BundleFeatures;
  result: BundleScore;
  flaggedWallets: string[];
  insiderSoldPct: number;
  analysedAt: number;
}

function pctOf(raw: bigint, supply: bigint): number {
  if (supply === 0n) return 0;
  return Number((raw * 1_000_000n) / supply) / 10_000;
}

const settle = <T>(p: Promise<T>) => p.then((v) => v, (err) => { console.error("[analyze]", (err as Error).message); return null; });

export async function analyzeMint(mint: string, hint?: { symbol?: string; name?: string; creator?: string; slot?: number; signature?: string }): Promise<Report> {
  const [created, buyers, intelRes, supply] = await Promise.all([
    hint?.creator && hint.slot ? Promise.resolve<Creation | null>(null) : settle(creation(mint)),
    firstBuyers(mint),
    settle(intel(mint, DETECTOR.earlySlots)),
    tokenSupply(mint),
  ]);

  const creator = hint?.creator ?? created?.creator ?? null;
  const launchSlot = hint?.slot ?? created?.slot ?? null;
  const launchSignature = hint?.signature ?? created?.signature ?? null;
  const symbol = hint?.symbol ?? created?.symbol ?? "";
  const name = hint?.name ?? created?.name ?? "";

  const early: FirstBuyer[] = buyers.filter(
    (b) => b.slots_after_launch >= 0 && b.slots_after_launch <= DETECTOR.earlySlots && b.wallet !== creator && !b.tags.includes("dev"),
  );
  const earlyRaw = early.reduce((sum, b) => sum + BigInt(b.first_buy_amount), 0n);

  const lookups = early.slice(0, DETECTOR.maxJitoLookups);
  const jitoResults = await mapLimit(lookups, DETECTOR.jitoConcurrency, (b) => bundleForTx(b.first_buy_signature));
  const launchBundle = launchSignature ? await bundleForTx(launchSignature) : null;

  const bundleMap = new Map<string, BundleEvidence>();
  const bundledWallets = new Set<string>();
  let bundledRaw = 0n;
  lookups.forEach((b, i) => {
    const bundle: JitoBundle | null = jitoResults[i] ?? null;
    if (!bundle) return;
    const ev = bundleMap.get(bundle.bundleId) ?? {
      bundleId: bundle.bundleId,
      slot: bundle.slot,
      tipLamports: bundle.landedTipLamports,
      includesLaunchTx: !!launchSignature && bundle.txSignatures.includes(launchSignature),
      buyers: [],
    };
    ev.buyers.push({ wallet: b.wallet, signature: b.first_buy_signature, amount: b.first_buy_amount, pct: pctOf(BigInt(b.first_buy_amount), supply.amount) });
    bundleMap.set(bundle.bundleId, ev);
    bundledWallets.add(b.wallet);
    bundledRaw += BigInt(b.first_buy_amount);
  });
  if (launchBundle && !bundleMap.has(launchBundle.bundleId) && launchBundle.txSignatures.length > 1) {
    bundleMap.set(launchBundle.bundleId, {
      bundleId: launchBundle.bundleId,
      slot: launchBundle.slot,
      tipLamports: launchBundle.landedTipLamports,
      includesLaunchTx: true,
      buyers: [],
    });
  }

  let topFunder: Report["topFunder"] = null;
  if (early.length >= 2) {
    const cluster = await settle(walletCluster(early.map((b) => b.wallet)));
    const top = cluster?.clusters[0];
    if (top && top.funded >= 2) {
      topFunder = {
        funder: top.funder,
        funded: top.funded,
        of: cluster!.requested,
        sameSlotFunded: top.same_slot_funded,
        priorMints: funders.priorMints(top.funder, mint),
      };
    }
  }

  const i: Intel | null = intelRes;
  const features: BundleFeatures = {
    jitoBundleSupplyPct: pctOf(bundledRaw, supply.amount),
    earlySupplyPct: pctOf(earlyRaw, supply.amount),
    sharedFunderPct: topFunder ? (topFunder.funded / topFunder.of) * 100 : 0,
    sharedFunderSize: topFunder?.funded ?? 0,
    intelScore: i?.score ?? null,
    knownFunder: !!topFunder && topFunder.priorMints.length > 0,
  };
  const result = bundleScore(features);

  if (topFunder && result.band === "BUNDLED" && topFunder.funded >= MODEL.minClusterSize) {
    funders.record(topFunder.funder, mint, result.score);
  }

  const flagged = new Set<string>([...bundledWallets, ...early.map((b) => b.wallet)]);
  const insiderSoldPct = soldPctOf(buyers.filter((b) => flagged.has(b.wallet)));
  metrics.analyses++;
  metrics.bands[result.band] = (metrics.bands[result.band] ?? 0) + 1;

  return {
    mint,
    symbol,
    name,
    creator,
    launchSlot,
    launchSignature,
    decimals: supply.decimals,
    earlyBuyers: early.length,
    earlySlots: DETECTOR.earlySlots,
    bundles: [...bundleMap.values()].sort((a, b) => b.buyers.length - a.buyers.length),
    topFunder,
    intel: i
      ? {
          score: i.score,
          rugged: i.rugged,
          flags: i.flags.map((f) => f.name),
          bundlersPct: Number(i.bundlers.initial_pct),
          snipersPct: Number(i.snipers.initial_pct),
          insidersPct: Number(i.insiders.initial_pct),
        }
      : null,
    features,
    result,
    flaggedWallets: [...flagged],
    insiderSoldPct,
    analysedAt: Date.now(),
  };
}

export interface Position {
  bought: bigint;
  holding: bigint;
  soldPct: number;
  sellers: number;
}

function soldPctOf(rows: FirstBuyer[]): number {
  const bought = rows.reduce((s, b) => s + BigInt(b.bought), 0n);
  const holding = rows.reduce((s, b) => s + BigInt(Math.max(0, b.holding)), 0n);
  if (bought === 0n || holding >= bought) return 0;
  return Number(((bought - holding) * 10_000n) / bought) / 100;
}

export async function flaggedPosition(mint: string, wallets: string[]): Promise<Position> {
  const set = new Set(wallets);
  const rows = (await firstBuyers(mint)).filter((b) => set.has(b.wallet));
  return {
    bought: rows.reduce((s, b) => s + BigInt(b.bought), 0n),
    holding: rows.reduce((s, b) => s + BigInt(Math.max(0, b.holding)), 0n),
    soldPct: soldPctOf(rows),
    sellers: rows.filter((b) => b.sold > 0).length,
  };
}
