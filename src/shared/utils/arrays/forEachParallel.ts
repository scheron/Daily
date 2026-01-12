/**
 * Executes a callback function for each item in an array in parallel.
 * @param arr - The array to iterate over.
 * @param cb - The callback function to execute for each item.
 * @throws AggregateError containing all errors if any callbacks fail
 */
export async function forEachParallel<T>(arr: T[], cb: (item: T, index: number) => Promise<void>): Promise<void> {
  if (!arr.length) return

  const results = await Promise.allSettled(arr.map((item, index) => cb(item, index)))

  const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason as Error)

  if (errors.length > 0) {
    throw new AggregateError(errors, `${errors.length} error(s) occurred during parallel execution`)
  }
}
