/**
 * Restricts a number to the inclusive [min, max] range.
 *
 * @example clamp(12, 0, 10) // 10
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
