import {isUndefined} from "./validators"

/**
 * Debounces a function call by the specified delay
 *
 * @param fn The function to debounce
 * @param delay The delay in milliseconds
 * @returns A debounced function with clear and immediate methods
 *
 * @example
 * ```ts
 * const debouncedFn = debounce(() => console.log('called'), 500)
 * debouncedFn()        // Will call after 500ms
 * debouncedFn.clear()  // Cancel pending call
 * debouncedFn.immediate() // Call immediately
 * ```
 */
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  function debounced(...args: Parameters<T>) {
    if (!isUndefined(timeoutId)) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }

  debounced.clear = () => {
    if (!isUndefined(timeoutId)) clearTimeout(timeoutId)
  }

  debounced.immediate = (...args: Parameters<T>) => {
    debounced.clear()
    fn(...args)
  }

  return debounced
}
