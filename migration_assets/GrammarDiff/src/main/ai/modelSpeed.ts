const BYTES_PER_GB = 1e9

/**
 * Rough relative inference-speed score (0–1) derived from model size. Local inference is
 * memory-bandwidth bound, so throughput scales inversely with the bytes read per token.
 * This is guidance for the model picker, not a measured tokens/sec figure.
 */
export function speedScoreFromSize(sizeBytes: number): number {
  const gb = sizeBytes / BYTES_PER_GB
  const score = 1.4 / gb
  return Math.max(0.05, Math.min(1, Math.round(score * 100) / 100))
}
