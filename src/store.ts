import { Database } from "bun:sqlite";
import { env } from "./config.ts";

export const db = new Database(env.dbPath, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
CREATE TABLE IF NOT EXISTS feed_chats (chat_id TEXT PRIMARY KEY, added_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS verdicts (
  mint TEXT PRIMARY KEY, symbol TEXT, score INTEGER NOT NULL, band TEXT NOT NULL,
  report TEXT NOT NULL, analysed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS funders (funder TEXT NOT NULL, mint TEXT NOT NULL, score INTEGER NOT NULL, seen_at INTEGER NOT NULL, PRIMARY KEY (funder, mint));
CREATE TABLE IF NOT EXISTS watches (
  chat_id TEXT NOT NULL, mint TEXT NOT NULL, symbol TEXT, wallets TEXT NOT NULL,
  initial TEXT NOT NULL, last_alert_pct INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY (chat_id, mint)
);
CREATE TABLE IF NOT EXISTS dumps (mint TEXT NOT NULL, sold_pct INTEGER NOT NULL, at INTEGER NOT NULL);
`);

export interface Watch {
  chat_id: string;
  mint: string;
  symbol: string | null;
  wallets: string[];
  initial: string;
  last_alert_pct: number;
  expires_at: number;
}

export const feed = {
  add: (chatId: string) => db.run("INSERT OR IGNORE INTO feed_chats VALUES (?, ?)", [chatId, Date.now()]),
  remove: (chatId: string) => db.run("DELETE FROM feed_chats WHERE chat_id = ?", [chatId]),
  list: () => (db.query("SELECT chat_id FROM feed_chats").all() as { chat_id: string }[]).map((r) => r.chat_id),
  has: (chatId: string) => !!db.query("SELECT 1 FROM feed_chats WHERE chat_id = ?").get(chatId),
};

export const verdicts = {
  save: (mint: string, symbol: string, score: number, band: string, report: unknown) =>
    db.run("INSERT OR REPLACE INTO verdicts VALUES (?, ?, ?, ?, ?, ?)", [mint, symbol, score, band, JSON.stringify(report), Date.now()]),
  since: (ms: number) =>
    db.query("SELECT mint, symbol, score, band, analysed_at FROM verdicts WHERE analysed_at >= ? ORDER BY score DESC").all(ms) as {
      mint: string; symbol: string; score: number; band: string; analysed_at: number;
    }[],
  count: () => db.query("SELECT band, COUNT(*) AS n FROM verdicts GROUP BY band").all() as { band: string; n: number }[],
};

export const funders = {
  record: (funder: string, mint: string, score: number) =>
    db.run("INSERT OR IGNORE INTO funders VALUES (?, ?, ?, ?)", [funder, mint, score, Date.now()]),
  priorMints: (funder: string, excludeMint: string) =>
    (db.query("SELECT mint FROM funders WHERE funder = ? AND mint != ?").all(funder, excludeMint) as { mint: string }[]).map((r) => r.mint),
  repeat: (sinceMs: number) =>
    db.query("SELECT funder, COUNT(*) AS launches FROM funders WHERE seen_at >= ? GROUP BY funder HAVING launches > 1 ORDER BY launches DESC LIMIT 5").all(sinceMs) as {
      funder: string; launches: number;
    }[],
};

function rowToWatch(r: any): Watch {
  return { ...r, wallets: JSON.parse(r.wallets) };
}

export const watches = {
  upsert: (w: Omit<Watch, "last_alert_pct">) =>
    db.run(
      `INSERT INTO watches (chat_id, mint, symbol, wallets, initial, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, mint) DO UPDATE SET wallets = excluded.wallets, initial = excluded.initial, expires_at = MAX(watches.expires_at, excluded.expires_at)`,
      [w.chat_id, w.mint, w.symbol, JSON.stringify(w.wallets), w.initial, Date.now(), w.expires_at],
    ),
  remove: (chatId: string, mint: string) => db.run("DELETE FROM watches WHERE chat_id = ? AND mint = ?", [chatId, mint]),
  forChat: (chatId: string) => (db.query("SELECT * FROM watches WHERE chat_id = ? AND expires_at > ?").all(chatId, Date.now()) as any[]).map(rowToWatch),
  active: () => (db.query("SELECT * FROM watches WHERE expires_at > ?").all(Date.now()) as any[]).map(rowToWatch),
  forMint: (mint: string) => (db.query("SELECT * FROM watches WHERE mint = ? AND expires_at > ?").all(mint, Date.now()) as any[]).map(rowToWatch),
  setAlerted: (chatId: string, mint: string, pct: number) =>
    db.run("UPDATE watches SET last_alert_pct = ? WHERE chat_id = ? AND mint = ?", [pct, chatId, mint]),
  purge: () => db.run("DELETE FROM watches WHERE expires_at <= ?", [Date.now()]),
  count: () => (db.query("SELECT COUNT(*) AS n FROM watches WHERE expires_at > ?").get(Date.now()) as { n: number }).n,
  mints: () => (db.query("SELECT DISTINCT mint FROM watches WHERE expires_at > ?").all(Date.now()) as { mint: string }[]).map((r) => r.mint),
};

export const dumps = {
  record: (mint: string, soldPct: number) => db.run("INSERT INTO dumps VALUES (?, ?, ?)", [mint, soldPct, Date.now()]),
  since: (ms: number) => db.query("SELECT mint, MAX(sold_pct) AS sold_pct FROM dumps WHERE at >= ? GROUP BY mint").all(ms) as { mint: string; sold_pct: number }[],
};
