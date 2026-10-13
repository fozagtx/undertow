import { SOLAMI, env } from "./config.ts";

export interface FirstBuyer {
  wallet: string;
  tags: string[];
  first_buy_signature: string;
  first_buy_slot: number;
  first_buy_time: number;
  first_buy_amount: number;
  slots_after_launch: number;
  bought: number;
  sold: number;
  holding: number;
  decimals: number;
}

interface Cohort {
  wallets: number;
  held: number;
  initial: number;
  held_pct: string;
  initial_pct: string;
  list: { wallet: string; initial: number; held: number; initial_pct: string; held_pct: string }[];
}

export interface Intel {
  mint: string;
  score: number;
  rugged: boolean;
  flags: { name: string; level: string; detail: string }[];
  dev: Cohort;
  snipers: Cohort;
  bundlers: Cohort;
  insiders: Cohort;
}

export interface Cluster {
  requested: number;
  resolved: number;
  clusters: {
    funder: string;
    funded: number;
    pct_of_requested: string;
    same_slot_funded: number;
    pct_funded_same_slot: string;
    wallets: { wallet: string; first_funded_slot: number; first_funded_time: number; first_funded_amount: number }[];
  }[];
}

export interface Creation {
  mint: string;
  creator: string;
  launchpad: string;
  signature: string;
  slot: number;
  block_time: number;
  name: string;
  symbol: string;
}

export class SolamiError extends Error {
  constructor(public status: number, path: string, body: string) {
    super(`Solami ${path} ${status}: ${body.slice(0, 200)}`);
  }
}

async function data<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const q = new URLSearchParams({ chain: "solana", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: env.solamiKey });
  const res = await fetch(`${SOLAMI.api}${path}?${q}`, { signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  if (!res.ok) throw new SolamiError(res.status, path, text);
  return JSON.parse(text) as T;
}

export const firstBuyers = (mint: string, limit = 100) =>
  data<FirstBuyer[]>("/data/token/first-buyers", { address: mint, limit });

export const intel = (mint: string, sniperSlots: number) =>
  data<Intel>("/data/token/intel", { address: mint, sniper_slots: sniperSlots });

export const walletCluster = (wallets: string[]) =>
  data<Cluster>("/data/wallet/cluster", { address: wallets.join(",") });

export const creation = (mint: string) =>
  data<Creation>("/data/token/creation", { address: mint });

export async function tokenSupply(mint: string): Promise<{ amount: bigint; decimals: number }> {
  const res = await fetch(`${SOLAMI.rpc}?api_key=${env.solamiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [mint] }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as { result?: { value: { amount: string; decimals: number } }; error?: { message: string } };
  if (!body.result) throw new Error(`getTokenSupply ${mint}: ${body.error?.message ?? res.status}`);
  return { amount: BigInt(body.result.value.amount), decimals: body.result.value.decimals };
}
