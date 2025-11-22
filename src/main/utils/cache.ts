export type Loader<T> = () => Promise<T>
export const CACHE_TTL = 2 * 60 * 1000

/**
 * Creates a caching wrapper around an async loader function with TTL expiry
 * @param loader - Async function that loads the data to be cached
 * @param ttlMs - Time-to-live in milliseconds for cached values
 * @returns Object with get() method to retrieve cached/fresh data and clear() to reset cache
 * @template T - Type of the value being cached
 */
export function createCacheLoader<T>(loader: Loader<T>, ttlMs: number = CACHE_TTL) {
  let cache: {value: T; expiry: number} | null = null
  let inFlight: Promise<T> | null = null

  return {
    async get(): Promise<T> {
      const now = Date.now()

      if (cache && now < cache.expiry) {
        console.log("[CACHE] ✨ Using cached data", cache.value)
        return cache.value
      }

      if (!inFlight) {
        inFlight = loader().then((value) => {
          cache = {value, expiry: now + ttlMs}
          inFlight = null
          return value
        })
      }
      return inFlight
    },
    clear() {
      cache = null
      inFlight = null
      console.log("[CACHE] ❌ Cleared cache")
    },
  }
}
