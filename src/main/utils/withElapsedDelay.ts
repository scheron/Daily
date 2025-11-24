import {sleep} from "@shared/utils/common/sleep"

/**
 * Runs a function and waits for a minimum duration before returning the result.
 * @param fn - The function to run.
 * @param minDurationMs - The minimum duration in milliseconds.
 * @returns The result of the function.
 */
export async function withElapsedDelay<T>(fn: () => Promise<T>, minDurationMs: number = 1000): Promise<T> {
  const startTime = Date.now()

  try {
    const result = await fn()

    const elapsed = Date.now() - startTime

    if (elapsed < minDurationMs) {
      await sleep(minDurationMs - elapsed)
    }

    return result
  } catch (error: any) {
    console.error("[withElapsedDelay] Failed to execute function:", error)
    throw error
  }
}
