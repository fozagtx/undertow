import { analyzeMint, type Report } from "./analyze.ts";
import { DETECTOR } from "./config.ts";
import { metrics } from "./metrics.ts";
import type { TokenCreate } from "./stream.ts";
import { verdicts } from "./store.ts";

const queue: TokenCreate[] = [];
let running = 0;

export type OnReport = (r: Report) => Promise<void>;
let onReport: OnReport = async () => {};
export function setReportHandler(fn: OnReport) {
  onReport = fn;
}

export async function saveReport(r: Report) {
  await verdicts.save(r.mint, r.symbol, r.result.score, r.result.band, r);
}

export function enqueueLaunch(e: TokenCreate): void {
  metrics.launchesSeen++;
  setTimeout(() => {
    if (queue.length >= DETECTOR.maxQueue) {
      metrics.launchesSkipped++;
      return;
    }
    queue.push(e);
    metrics.launchesQueued++;
    drain();
  }, DETECTOR.analyzeDelayMs);
}

function drain(): void {
  while (running < DETECTOR.maxConcurrentAnalyses && queue.length) {
    const e = queue.shift()!;
    running++;
    analyzeMint(e.mint, { symbol: e.symbol, name: e.name, creator: e.creator, slot: e.slot, signature: e.signature })
      .then(async (r) => {
        await saveReport(r);
        await onReport(r);
      })
      .catch((err) => {
        metrics.analysisErrors++;
        console.error(`[pipeline] ${e.mint}`, (err as Error).message);
      })
      .finally(() => {
        running--;
        drain();
      });
  }
}

export const queueDepth = () => queue.length;
