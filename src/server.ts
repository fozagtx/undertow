import { env } from "./config.ts";
import { metrics } from "./metrics.ts";
import { queueDepth } from "./pipeline.ts";
import { MODEL } from "./score.ts";
import { feed, verdicts, watches } from "./store.ts";

function snapshot() {
  const now = Date.now();
  return {
    uptimeSec: Math.round((now - metrics.startedAt) / 1000),
    launches: { seen: metrics.launchesSeen, analysed: metrics.analyses, queued: queueDepth(), skipped: metrics.launchesSkipped, errors: metrics.analysisErrors },
    bands: metrics.bands,
    bandsAllTime: Object.fromEntries(verdicts.count().map((r) => [r.band, r.n])),
    alerts: { checks: metrics.checks, feed: metrics.feedAlerts, dumps: metrics.dumpAlerts },
    watches: watches.count(),
    feedChats: feed.list().length,
    jito: { lookups: metrics.jitoLookups, inBundle: metrics.jitoHits, errors: metrics.jitoErrors },
    swapsSeen: metrics.swapsSeen,
    streams: Object.fromEntries(
      Object.entries(metrics.streams).map(([k, v]) => [k, { connected: v.connected, lastEventAgeSec: v.lastEventAt ? Math.round((now - v.lastEventAt) / 1000) : null, reconnects: v.reconnects }]),
    ),
    model: MODEL,
  };
}

function page(): string {
  const s = snapshot();
  const rows = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => `<tr><td>${k}</td><td>${typeof v === "object" ? JSON.stringify(v) : v}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="10"><title>Undertow metrics</title>
<style>body{font:15px/1.5 ui-sans-serif,system-ui,sans-serif;background:#fff;color:#111;max-width:760px;margin:40px auto;padding:0 16px}h1{font-size:20px}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #eee;padding:8px 4px;vertical-align:top;word-break:break-word}td:first-child{color:#666;width:30%}</style></head>
<body><h1>Undertow</h1><table>${rows({ ...s, model: `${MODEL.name} ${JSON.stringify(MODEL.weights)}` })}</table></body></html>`;
}

export function startServer() {
  return Bun.serve({
    port: env.port,
    routes: {
      "/": () => new Response(page(), { headers: { "content-type": "text/html; charset=utf-8" } }),
      "/health": () => {
        const launch = metrics.streams.launches;
        const ok = !!launch?.connected;
        return Response.json({ ok, launchStream: launch ?? null }, { status: ok ? 200 : 503 });
      },
      "/metrics": () => Response.json(snapshot()),
    },
  });
}
