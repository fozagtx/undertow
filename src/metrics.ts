export const metrics = {
  startedAt: Date.now(),
  launchesSeen: 0,
  launchesQueued: 0,
  launchesSkipped: 0,
  analyses: 0,
  analysisErrors: 0,
  bands: { CLEAN: 0, CAUTION: 0, BUNDLED: 0 } as Record<string, number>,
  checks: 0,
  dumpAlerts: 0,
  feedAlerts: 0,
  jitoLookups: 0,
  jitoHits: 0,
  jitoErrors: 0,
  swapsSeen: 0,
  streams: {} as Record<string, { connected: boolean; lastEventAt: number; reconnects: number }>,
};

export function streamState(name: string) {
  return (metrics.streams[name] ??= { connected: false, lastEventAt: 0, reconnects: 0 });
}
