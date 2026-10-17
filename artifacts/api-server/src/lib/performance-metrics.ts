export type LatencyKind = "local" | "cache" | "llm";

const MAX_LATENCY_SAMPLES = 500;
const MAX_TOKEN_SAMPLES = 500;

function percentile(values: number[], percentileValue: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Math.round(sorted[Math.ceil(percentileValue * sorted.length) - 1] ?? sorted[sorted.length - 1]);
}

export function createPerformanceMetrics() {
  const latency = new Map<LatencyKind, number[]>([
    ["local", []],
    ["cache", []],
    ["llm", []],
  ]);
  const estimatedTokens: number[] = [];

  return {
    recordLatency(kind: LatencyKind, durationMs: number) {
      if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 60_000) return;
      const samples = latency.get(kind)!;
      samples.push(Math.round(durationMs));
      if (samples.length > MAX_LATENCY_SAMPLES) samples.splice(0, samples.length - MAX_LATENCY_SAMPLES);
    },
    recordEstimatedTokens(tokens: number) {
      if (!Number.isFinite(tokens) || tokens < 0 || tokens > 100_000) return;
      estimatedTokens.push(Math.round(tokens));
      if (estimatedTokens.length > MAX_TOKEN_SAMPLES) {
        estimatedTokens.splice(0, estimatedTokens.length - MAX_TOKEN_SAMPLES);
      }
    },
    snapshot() {
      const localCache = [...latency.get("local")!, ...latency.get("cache")!];
      const llm = latency.get("llm")!;
      const p95LocalCacheMs = percentile(localCache, 0.95);
      const p95LlmMs = percentile(llm, 0.95);
      return {
        averageEstimatedTokens: estimatedTokens.length
          ? Math.round(estimatedTokens.reduce((sum, value) => sum + value, 0) / estimatedTokens.length)
          : 0,
        estimatedTokenSamples: estimatedTokens.length,
        localSamples: latency.get("local")!.length,
        cacheSamples: latency.get("cache")!.length,
        llmSamples: llm.length,
        p95LocalCacheMs,
        p95LlmMs,
        localCacheTargetMs: 1_500,
        llmTargetMs: 3_000,
        localCacheTargetMet: p95LocalCacheMs === null ? null : p95LocalCacheMs <= 1_500,
        llmTargetMet: p95LlmMs === null ? null : p95LlmMs <= 3_000,
      };
    },
  };
}
