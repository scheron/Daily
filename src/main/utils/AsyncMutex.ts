/**
 * Asynchronous mutex for coordinating access to shared resources.
 *
 * A mutex (mutual exclusion) ensures that only one asynchronous operation
 * can execute in a critical section at any given time. Other operations
 * wait in a queue until the lock is released.
 *
 */
export class AsyncMutex {
  /**  Whether the mutex is currently locked.  */
  private _locked = false
  /**  Queue of waiting acquire requests.  */
  private _queue: Array<() => void> = []

  /**
   * Acquires the mutex lock.
   *
   * If the mutex is already locked, the caller is added to a queue
   * and will be resolved when the lock becomes available.
   *
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise that resolves with a release function
   * @throws Error if timeout is reached before acquiring lock
   * @private
   */
  private async acquire(timeoutMs: number = 0): Promise<() => void> {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const release = () => {
        if (timeoutId) clearTimeout(timeoutId)

        const next = this._queue.shift()
        if (next) {
          next()
        } else {
          this._locked = false
        }
      }

      const acquireLock = () => {
        this._locked = true
        resolve(release)
      }

      if (!this._locked) {
        acquireLock()
      } else {
        this._queue.push(acquireLock)

        if (timeoutMs) {
          timeoutId = setTimeout(() => {
            const index = this._queue.indexOf(acquireLock)
            if (index !== -1) {
              this._queue.splice(index, 1)
              reject(new Error(`Mutex acquire timeout after ${timeoutMs}ms`))
            }
          }, timeoutMs)
        }
      }
    })
  }

  /**
   * Executes a function within a critical section.
   *
   * Acquires the mutex, executes the function, and releases the mutex.
   * The release happens even if the function throws an error.
   *
   * @param fn - The async function to execute exclusively
   * @param timeoutMs - Optional timeout for acquiring the lock
   * @returns Promise that resolves with the function's result
   * @throws Error from the function or timeout error
   *
   * @example
   * ```ts
   * await mutex.runExclusive(async () => {
   *   // Critical section - only one execution at a time
   *   const data = await readSharedResource();
   *   await modifySharedResource(data);
   * });
   * ```
   */
  async runExclusive<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    const release = await this.acquire(timeoutMs)
    try {
      return await fn()
    } finally {
      release()
    }
  }

  /**
   * Attempts to acquire the lock without waiting.
   * @returns Release function if lock was acquired, null if already locked
   *
   * @example
   * ```ts
   * const release = mutex.tryLock();
   * if (release) {
   *   try {
   *     // Do work
   *   } finally {
   *     release();
   *   }
   * } else {
   *   console.log('Already locked');
   * }
   * ```
   */
  tryLock(): (() => void) | null {
    if (this._locked) {
      return null
    }

    this._locked = true

    return () => {
      const next = this._queue.shift()
      if (next) {
        next()
      } else {
        this._locked = false
      }
    }
  }

  /**
   * Checks if the mutex is currently locked.
   * @returns True if locked, false otherwise
   */
  get isLocked(): boolean {
    return this._locked
  }

  /**
   * Gets the number of operations waiting in queue.
   * @returns Number of waiting operations
   */
  get queueLength(): number {
    return this._queue.length
  }
}
