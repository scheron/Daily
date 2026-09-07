/**
 * Scheduler manages automatic processing on a set interval.
 * Provides start/stop controls and tracks processing state.
 */
export type Scheduler = {
  /** Start automatic processing */
  start(): void
  /** Stop automatic processing */
  stop(): void
  /** Check if a processing operation is currently in progress */
  isProcessing(): boolean
}

type SchedulerConfig = {
  /** Interval between processing operations in milliseconds */
  intervalMs: number
  /** Callback function to perform processing operation */
  onProcess: () => Promise<unknown>
}

export function createIntervalScheduler(config: SchedulerConfig): Scheduler {
  const {intervalMs, onProcess} = config

  let intervalId: ReturnType<typeof setInterval> | null = null
  let isSyncing = false

  async function perform() {
    if (isSyncing) return

    isSyncing = true

    try {
      await onProcess()
    } catch (error: any) {
      console.error("[AutoSyncScheduler] Scheduled sync failed:", error)
    } finally {
      isSyncing = false
    }
  }

  function start() {
    if (intervalId) return
    intervalId = setInterval(() => perform(), intervalMs)
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  return {
    start,
    stop,
    isProcessing: () => isSyncing,
  }
}
