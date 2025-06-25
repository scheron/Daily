export type Loader<T> = () => Promise<T>
export const CACHE_TTL = 2 * 60 * 1000

/**
 * Creates a cache wrapper around an async loader function with a time-to-live.
 * @param loader Async function that fetches the data
 * @param ttlMs Time-to-live in milliseconds
 */
export function createCacheLoader<T>(loader: Loader<T>, ttlMs: number = CACHE_TTL) {
  let cache: {value: T; expiry: number} | null = null
  let inFlight: Promise<T> | null = null

  return {
    /**
     * Returns cached value if valid, otherwise calls loader to refresh.
     */
    async get(): Promise<T> {
      const now = Date.now()

      if (cache && now < cache.expiry) {
        console.log("cache hit", cache)
        return cache.value
      }

      if (!inFlight) {
        inFlight = loader().then((value) => {
          console.log("cache miss", value)
          cache = {value, expiry: now + ttlMs}
          inFlight = null
          return value
        })
      }
      return inFlight
    },
    /** Clears the cache immediately */
    clear() {
      cache = null
      inFlight = null
    },
  }
}
