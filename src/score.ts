export const MODEL = {
  name: "bundle-score-v1",
  weights: { jitoBundleSupply: 35, earlySupply: 20, sharedFunder: 25, intel: 10, knownFunder: 10 },
  saturation: { jitoBundleSupplyPct: 30, earlySupplyPct: 40, sharedFunderPct: 50 },
  minClusterSize: 3,
  bands: { CAUTION: 30, BUNDLED: 60 },
};

export type Band = "CLEAN" | "CAUTION" | "BUNDLED";

export interface BundleFeatures {
  jitoBundleSupplyPct: number;
  earlySupplyPct: number;
  sharedFunderPct: number;
  sharedFunderSize: number;
  intelScore: number | null;
  knownFunder: boolean;
}

export interface BundleScore {
  score: number;
  band: Band;
  parts: Record<keyof typeof MODEL.weights, number>;
}

function clip(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function bandFor(score: number): Band {
  if (score >= MODEL.bands.BUNDLED) return "BUNDLED";
  if (score >= MODEL.bands.CAUTION) return "CAUTION";
  return "CLEAN";
}

export function bundleScore(f: BundleFeatures): BundleScore {
  const w = MODEL.weights;
  const s = MODEL.saturation;
  const parts = {
    jitoBundleSupply: w.jitoBundleSupply * clip(f.jitoBundleSupplyPct / s.jitoBundleSupplyPct, 0, 1),
    earlySupply: w.earlySupply * clip(f.earlySupplyPct / s.earlySupplyPct, 0, 1),
    sharedFunder: f.sharedFunderSize >= MODEL.minClusterSize ? w.sharedFunder * clip(f.sharedFunderPct / s.sharedFunderPct, 0, 1) : 0,
    intel: f.intelScore == null ? 0 : w.intel * clip((f.intelScore - 1) / 9, 0, 1),
    knownFunder: f.knownFunder ? w.knownFunder : 0,
  };
  const score = Math.round(clip(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100));
  return { score, band: bandFor(score), parts };
}
