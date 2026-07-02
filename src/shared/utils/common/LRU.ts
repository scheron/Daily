import {TTLCache} from "@isaacs/ttlcache"

export type CacheKey = string | number | symbol | boolean

export class LRU<K = CacheKey, T = unknown> {
  private cache: TTLCache<K, T>

  constructor(max: number = 100, ttl: number = 5000) {
    this.cache = new TTLCache<K, T>({max, ttl})
  }

  get(key: K): T | null {
    return this.cache.get(key) ?? null
  }

  set(key: K, value: T) {
    this.cache.set(key, value)
  }

  delete(key: K) {
    this.cache.delete(key)
  }

  has(key: K) {
    return this.cache.has(key)
  }

  clear() {
    this.cache.clear()
  }

  keys(): K[] {
    return Array.from(this.cache.keys())
  }

  values(): T[] {
    return Array.from(this.cache.values())
  }

  entries(): [K, T][] {
    return Array.from(this.cache.entries())
  }

  gc() {
    return this.cache.purgeStale()
  }
}
