/**
 * Execute async callback for each array item with concurrency limit.
 *
 * Items are processed with controlled parallelism. Up to `limit` items
 * are processed at once. As each completes, the next one starts immediately.
 *
 * @param arr - Array to iterate over
 * @param cb - Async callback function
 * @param limit - Maximum number of concurrent executions (must be >= 1)
 * @throws AggregateError if any callbacks fail
 *
 * @example
 * ```ts
 * // Process max 5 items at a time
 * await forEachConcurrent(images, async (image) => {
 *   await downloadImage(image);
 * }, 5);
 *
 * // First 5 start immediately
 * // As each completes, the next one starts
 * // Maintains 5 concurrent operations until all are done
 * ```
 */
export async function forEachConcurrent<T>(arr: T[], cb: (item: T, index: number) => Promise<void>, limit: number = 10): Promise<void> {
  // For avoid negative limit
  if (limit < 1) limit = 1

  if (arr.length === 0) {
    return
  }

  if (limit >= arr.length) {
    await Promise.all(arr.map((item, index) => cb(item, index)))
    return
  }

  let currentIndex = 0
  const errors: Error[] = []

  async function worker(): Promise<void> {
    while (currentIndex < arr.length) {
      const index = currentIndex++
      const item = arr[index]

      try {
        await cb(item, index)
      } catch (error) {
        errors.push(error as Error)
      }
    }
  }

  const workers = Array.from({length: Math.min(limit, arr.length)}, worker)
  await Promise.all(workers)

  if (errors.length > 0) {
    throw new AggregateError(errors, `${errors.length} error(s) occurred during concurrent execution`)
  }
}
