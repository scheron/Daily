import {isUndefined} from "@shared/utils/common/validators"
import {clamp} from "@shared/utils/numbers/clamp"

export type PaneBounds = {min: number; max: number}

/**
 * Redistribute `delta` px across the boundary between pane `boundaryIndex` and its next
 * neighbour, preserving their combined size; each pane clamps to its own `[min, max]`.
 * @example resizePanes([100, 100], 0, 30, {min: 40, max: 200}, {min: 40, max: 200}) // [130, 70]
 */
export function resizePanes(sizes: number[], boundaryIndex: number, delta: number, boundsA: PaneBounds, boundsB: PaneBounds): number[] {
  const a = boundaryIndex
  const b = boundaryIndex + 1
  if (isUndefined(sizes[a]) || isUndefined(sizes[b])) return sizes

  const combined = sizes[a] + sizes[b]
  const lo = Math.max(boundsA.min, combined - boundsB.max)
  const hi = Math.min(boundsA.max, combined - boundsB.min)
  const nextA = clamp(sizes[a] + delta, lo, hi)
  const next = [...sizes]
  next[a] = nextA
  next[b] = combined - nextA
  return next
}
