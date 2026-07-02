import {isNull} from "./validators"

/**
 * Throttles a function so it runs at most once per `delay` ms, on the trailing edge.
 *
 * The run is invoked with the arguments of the last call.
 *
 * @param fn The function to throttle
 * @param delay Minimum milliseconds between runs
 * @returns A throttled function with `clear` (drop the pending run) and `immediate` (run now, cancelling the pending run) methods
 *
 * @example
 * ```ts
 * const flush = throttle(applyBuffer, 50)
 * flush()            // opens a window, schedules applyBuffer in 50ms
 * flush(); flush()   // coalesced into the same run
 * flush.immediate()  // cancel the pending run, apply the buffer right now
 * flush.clear()      // cancel the pending run, do nothing
 * ```
 */
export function throttle<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  function throttled(...args: Parameters<T>) {
    if (!isNull(timeoutId)) return
    timeoutId = setTimeout(() => {
      timeoutId = null
      fn(...args)
    }, delay)
  }

  throttled.clear = () => {
    if (!isNull(timeoutId)) clearTimeout(timeoutId)
    timeoutId = null
  }

  throttled.immediate = (...args: Parameters<T>) => {
    throttled.clear()
    return fn(...args)
  }

  return throttled
}
