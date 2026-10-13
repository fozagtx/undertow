export const SOLAMI = {
  rpc: "https://rpc.solami.dev/sol",
  api: "https://api.solami.dev",
  blurWs: "wss://ws.solami.dev/data/subscribe",
};

export const JITO_BUNDLES_API = "https://bundles.jito.wtf/api/v1/bundles";

export const LINKS = {
  tx: (sig: string) => `https://solscan.io/tx/${sig}`,
  token: (mint: string) => `https://solscan.io/token/${mint}`,
  account: (addr: string) => `https://solscan.io/account/${addr}`,
};

export const DETECTOR = {
  launchpad: "pumpfun",
  earlySlots: 5,
  analyzeDelayMs: 20_000,
  maxConcurrentAnalyses: 2,
  maxQueue: 40,
  maxJitoLookups: 15,
  jitoConcurrency: 3,
  watchHours: 24,
  feedWatchHours: 6,
  dumpThresholds: [25, 50, 75],
};

export const env = {
  solamiKey: process.env.SOLAMI_API_KEY ?? "",
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",
};

export function requireEnv(): void {
  const missing = [
    ["SOLAMI_API_KEY", env.solamiKey],
    ["TELEGRAM_BOT_TOKEN", env.telegramToken],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`Missing env: ${missing.join(", ")}. See README.`);
    process.exit(1);
  }
}
