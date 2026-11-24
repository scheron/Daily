/**
 * Coalesces concurrent async operations that share a key into a single in-flight execution.
 * Callers awaiting the same key receive the same promise; once settled (resolved or rejected),
 * the key is cleared so subsequent calls execute fresh.
 */
export class SingleFlight<K = string> {
  private _inFlight = new Map<K, Promise<unknown>>()

  /** Runs `fn` for `key`, or returns the active promise if `key` is already in flight. */
  run<T>(key: K, fn: () => Promise<T>): Promise<T> {
    const existing = this._inFlight.get(key) as Promise<T> | undefined
    if (existing) return existing

    let work: Promise<T>
    try {
      work = fn()
    } catch (error) {
      return Promise.reject(error)
    }

    const pending = work.finally(() => {
      if (this._inFlight.get(key) === pending) this._inFlight.delete(key)
    })
    this._inFlight.set(key, pending)
    return pending
  }

  has(key: K): boolean {
    return this._inFlight.has(key)
  }

  delete(key: K): boolean {
    return this._inFlight.delete(key)
  }

  clear(): void {
    this._inFlight.clear()
  }

  get size(): number {
    return this._inFlight.size
  }
}
