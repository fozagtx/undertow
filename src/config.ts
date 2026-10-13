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

function readEnv(name: string): string {
  const key = Object.keys(process.env).find((k) => k.trim().toUpperCase() === name);
  return (key ? process.env[key] ?? "" : "").trim();
}

export const env = {
  solamiKey: readEnv("SOLAMI_API_KEY"),
  telegramToken: readEnv("TELEGRAM_BOT_TOKEN"),
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: readEnv("DATABASE_URL"),
};

export function missingEnv(): { missing: string[]; seen: string[]; service: string | null } {
  const missing = [
    ["SOLAMI_API_KEY", env.solamiKey],
    ["TELEGRAM_BOT_TOKEN", env.telegramToken],
  ].filter(([, v]) => !v).map(([k]) => k!);
  const seen = Object.keys(process.env)
    .filter((k) => /SOLAMI|TELEGRAM|BOT|TOKEN|API_KEY/i.test(k))
    .map((k) => `${JSON.stringify(k)}${process.env[k]?.trim() ? "" : " (empty)"}`);
  return { missing, seen, service: process.env.RENDER_SERVICE_NAME ?? null };
}
