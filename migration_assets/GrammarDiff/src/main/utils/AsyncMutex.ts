export class AsyncMutex {
  private locked = false
  private queue: Array<() => void> = []

  tryLock(): (() => void) | null {
    if (this.locked) return null
    this.locked = true
    return () => this.release()
  }

  async lock(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true
      return () => this.release()
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
    this.locked = true
    return () => this.release()
  }

  private release(): void {
    const next = this.queue.shift()
    if (next) next()
    else this.locked = false
  }
}
