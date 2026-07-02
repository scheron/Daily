import {isNull} from "./validators"

/**
 * Debounces a function call by the specified delay AND coalesces every
 * intermediate input into a single accumulated batch.
 *
 * Each call to the returned function feeds an item through `reduce` into an
 * internal batch. When `delay` ms pass with no further calls, `flush` is
 * invoked once with the accumulated batch, and the batch is reset to `initial`.
 *
 * @param flush  Async callback invoked once per quiescent window with the accumulated batch
 * @param delay  Milliseconds of inactivity before the batch is flushed
 * @param reduce Pure folder that merges the next item into the running batch
 * @param initial Initial (and reset) value of the batch
 * @returns A function that adds an item to the batch and schedules a flush, with `clear` and `immediate` methods
 *
 * @example
 * ```ts
 * const scheduleSave = batchDebounce<Partial<Settings>>(
 *   (batch) => api.save(batch),
 *   300,
 *   (acc, item) => deepMerge(acc, item),
 *   {},
 * )
 *
 * scheduleSave({theme: "dark"})       // schedules flush
 * scheduleSave({layout: "columns"})   // coalesces with previous, reschedules flush
 * // 300ms later → api.save({theme: "dark", layout: "columns"}) fires once
 *
 * scheduleSave.immediate()  // cancel pending timer, flush right now
 * scheduleSave.clear()      // cancel pending timer, drop accumulated batch
 * ```
 */
export function batchDebounce<T>(flush: (batch: T) => void | Promise<void>, delay: number, reduce: (acc: T, item: T) => T, initial: T) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let batch: T = initial

  function fire() {
    timeoutId = null
    const current = batch
    batch = initial
    return flush(current)
  }

  function debounced(item: T) {
    batch = reduce(batch, item)
    if (!isNull(timeoutId)) clearTimeout(timeoutId)
    timeoutId = setTimeout(fire, delay)
  }

  debounced.clear = () => {
    if (!isNull(timeoutId)) clearTimeout(timeoutId)
    timeoutId = null
    batch = initial
  }

  debounced.immediate = () => {
    if (!isNull(timeoutId)) clearTimeout(timeoutId)
    return fire()
  }

  return debounced
}
