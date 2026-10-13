import { SQL } from "bun";
import { env } from "./config.ts";

export const sql = new SQL(env.databaseUrl);

export interface Watch {
  chat_id: string;
  mint: string;
  symbol: string | null;
  wallets: string[];
  initial: string;
  last_alert_pct: number;
  expires_at: number;
}

let watchedMints: string[] = [];

async function refreshMints(): Promise<void> {
  const rows = await sql`SELECT DISTINCT mint FROM watches WHERE expires_at > ${Date.now()}`;
  watchedMints = rows.map((r: { mint: string }) => r.mint);
}

export async function initStore(): Promise<void> {
  await sql.unsafe(`
CREATE TABLE IF NOT EXISTS feed_chats (chat_id TEXT PRIMARY KEY, added_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS verdicts (
  mint TEXT PRIMARY KEY, symbol TEXT, score INTEGER NOT NULL, band TEXT NOT NULL,
  report TEXT NOT NULL, analysed_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS funders (funder TEXT NOT NULL, mint TEXT NOT NULL, score INTEGER NOT NULL, seen_at BIGINT NOT NULL, PRIMARY KEY (funder, mint));
CREATE TABLE IF NOT EXISTS watches (
  chat_id TEXT NOT NULL, mint TEXT NOT NULL, symbol TEXT, wallets TEXT NOT NULL,
  initial TEXT NOT NULL, last_alert_pct INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, PRIMARY KEY (chat_id, mint)
);
CREATE TABLE IF NOT EXISTS dumps (mint TEXT NOT NULL, sold_pct INTEGER NOT NULL, at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS watches_mint ON watches (mint);
`);
  await refreshMints();
}

export const feed = {
  add: async (chatId: string) => {
    await sql`INSERT INTO feed_chats VALUES (${chatId}, ${Date.now()}) ON CONFLICT DO NOTHING`;
  },
  remove: async (chatId: string) => {
    await sql`DELETE FROM feed_chats WHERE chat_id = ${chatId}`;
  },
  list: async (): Promise<string[]> => (await sql`SELECT chat_id FROM feed_chats`).map((r: { chat_id: string }) => r.chat_id),
  has: async (chatId: string): Promise<boolean> => (await sql`SELECT 1 FROM feed_chats WHERE chat_id = ${chatId}`).length > 0,
};

export const verdicts = {
  save: async (mint: string, symbol: string, score: number, band: string, report: unknown) => {
    await sql`INSERT INTO verdicts VALUES (${mint}, ${symbol}, ${score}, ${band}, ${JSON.stringify(report)}, ${Date.now()})
      ON CONFLICT (mint) DO UPDATE SET symbol = EXCLUDED.symbol, score = EXCLUDED.score, band = EXCLUDED.band, report = EXCLUDED.report, analysed_at = EXCLUDED.analysed_at`;
  },
  since: async (ms: number): Promise<{ mint: string; symbol: string; score: number; band: string }[]> =>
    sql`SELECT mint, symbol, score, band FROM verdicts WHERE analysed_at >= ${ms} ORDER BY score DESC`,
  count: async (): Promise<{ band: string; n: number }[]> => sql`SELECT band, COUNT(*)::int AS n FROM verdicts GROUP BY band`,
};

export const funders = {
  record: async (funder: string, mint: string, score: number) => {
    await sql`INSERT INTO funders VALUES (${funder}, ${mint}, ${score}, ${Date.now()}) ON CONFLICT DO NOTHING`;
  },
  priorMints: async (funder: string, excludeMint: string): Promise<string[]> =>
    (await sql`SELECT mint FROM funders WHERE funder = ${funder} AND mint != ${excludeMint}`).map((r: { mint: string }) => r.mint),
  repeat: async (sinceMs: number): Promise<{ funder: string; launches: number }[]> =>
    sql`SELECT funder, COUNT(*)::int AS launches FROM funders WHERE seen_at >= ${sinceMs} GROUP BY funder HAVING COUNT(*) > 1 ORDER BY launches DESC LIMIT 5`,
};

function rowToWatch(r: any): Watch {
  return { ...r, wallets: JSON.parse(r.wallets), expires_at: Number(r.expires_at), last_alert_pct: Number(r.last_alert_pct) };
}

export const watches = {
  upsert: async (w: Omit<Watch, "last_alert_pct">) => {
    await sql`INSERT INTO watches (chat_id, mint, symbol, wallets, initial, created_at, expires_at)
      VALUES (${w.chat_id}, ${w.mint}, ${w.symbol}, ${JSON.stringify(w.wallets)}, ${w.initial}, ${Date.now()}, ${w.expires_at})
      ON CONFLICT (chat_id, mint) DO UPDATE SET wallets = EXCLUDED.wallets, initial = EXCLUDED.initial, expires_at = GREATEST(watches.expires_at, EXCLUDED.expires_at)`;
    await refreshMints();
  },
  remove: async (chatId: string, mint: string) => {
    await sql`DELETE FROM watches WHERE chat_id = ${chatId} AND mint = ${mint}`;
    await refreshMints();
  },
  forChat: async (chatId: string): Promise<Watch[]> =>
    (await sql`SELECT * FROM watches WHERE chat_id = ${chatId} AND expires_at > ${Date.now()}`).map(rowToWatch),
  forMint: async (mint: string): Promise<Watch[]> =>
    (await sql`SELECT * FROM watches WHERE mint = ${mint} AND expires_at > ${Date.now()}`).map(rowToWatch),
  setAlerted: async (chatId: string, mint: string, pct: number) => {
    await sql`UPDATE watches SET last_alert_pct = ${pct} WHERE chat_id = ${chatId} AND mint = ${mint}`;
  },
  purge: async () => {
    await sql`DELETE FROM watches WHERE expires_at <= ${Date.now()}`;
    await refreshMints();
  },
  count: async (): Promise<number> => (await sql`SELECT COUNT(*)::int AS n FROM watches WHERE expires_at > ${Date.now()}`)[0].n,
  mints: (): string[] => watchedMints,
};

export const dumps = {
  record: async (mint: string, soldPct: number) => {
    await sql`INSERT INTO dumps VALUES (${mint}, ${soldPct}, ${Date.now()})`;
  },
  since: async (ms: number): Promise<{ mint: string; sold_pct: number }[]> =>
    sql`SELECT mint, MAX(sold_pct) AS sold_pct FROM dumps WHERE at >= ${ms} GROUP BY mint`,
};
