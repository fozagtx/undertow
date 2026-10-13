import { JITO_BUNDLES_API } from "./config.ts";
import { metrics } from "./metrics.ts";

export interface JitoBundle {
  bundleId: string;
  slot: number;
  tippers: string[];
  landedTipLamports: number;
  txSignatures: string[];
}

const bundleCache = new Map<string, JitoBundle>();
const txCache = new Map<string, string | null>();

async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (res.status === 429) {
      await Bun.sleep(500 * 2 ** attempt);
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Jito ${url} ${res.status}`);
    return (await res.json()) as T;
  }
  throw new Error(`Jito ${url} rate limited`);
}

export async function bundleForTx(signature: string): Promise<JitoBundle | null> {
  if (txCache.has(signature)) {
    const id = txCache.get(signature);
    return id ? bundleCache.get(id) ?? null : null;
  }
  metrics.jitoLookups++;
  try {
    const rows = await getJson<{ bundle_id: string }[]>(`${JITO_BUNDLES_API}/transaction/${signature}`);
    const id = rows?.[0]?.bundle_id ?? null;
    txCache.set(signature, id);
    if (!id) return null;
    metrics.jitoHits++;
    if (!bundleCache.has(id)) {
      const b = await getJson<JitoBundle[]>(`${JITO_BUNDLES_API}/bundle/${id}`);
      if (b?.[0]) bundleCache.set(id, b[0]);
    }
    return bundleCache.get(id) ?? { bundleId: id, slot: 0, tippers: [], landedTipLamports: 0, txSignatures: [signature] };
  } catch (err) {
    metrics.jitoErrors++;
    console.error("[jito]", (err as Error).message);
    return null;
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}
