export type ConflictError = {status?: number; [key: string]: any}

export type RetryOptions = {
  /** Maximum number of attempts (default: 3) */
  maxRetries?: number
  /** Logger, can be passed console or your own Logger */
  logger?: {
    debug?: (...args: any[]) => void
    info?: (...args: any[]) => void
    warn?: (...args: any[]) => void
    error?: (...args: any[]) => void
  }
}

/**
 * Runs an operation with retry support for PouchDB conflicts (409).
 *
 * @param label     - label for logging, e.g. "[SETTINGS]" or "[TASKS]"
 * @param operation - function that performs one attempt (read → merge → put)
 * @param options   - retry settings and logger
 *
 * @returns result of operation (if it returns anything) or undefined, if we gave up on conflicts
 */
export async function withRetryOnConflict<T>(
  label: string,
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T | null> {
  const {maxRetries = 3, logger = console} = options

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await operation(attempt)
      return result
    } catch (error: any) {
      const status = (error as ConflictError)?.status

      if (status === 409) {
        logger.warn?.(`${label} Conflict on save (attempt ${attempt + 1}/${maxRetries})`)

        if (attempt < maxRetries - 1) continue

        logger.warn?.(`${label} Giving up after conflicts; another writer won the race.`)
        return null
      }

      logger.error?.(`${label} Failed to complete operation:`, error)
      throw error
    }
  }

  return null
}
