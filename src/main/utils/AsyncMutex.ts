/**
 * Simple implementation of Async Mutex.
 *
 * Ensures that within a single process, only one
 * `runExclusive(...)` executes at any given moment.
 *
 * Other calls will wait in a queue.
 */
export class AsyncMutex {
  private _locked = false
  private _queue: Array<() => void> = []

  /**
   * Acquire the mutex.
   * Returns a function `release()`, which must be called in finally.
   */
  private async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        const next = this._queue.shift()

        if (next) {
          next()
        } else {
          this._locked = false
        }
      }

      if (!this._locked) {
        this._locked = true
        resolve(release)
      } else {
        this._queue.push(() => {
          this._locked = true
          resolve(release)
        })
      }
    })
  }

  /**
   * Execute a function within a critical section.
   * @param fn - The function to execute.
   * @returns The result of the function.
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire()
    try {
      return await fn()
    } finally {
      release()
    }
  }
}
