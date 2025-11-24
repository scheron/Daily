/**
 * Executes a callback function for each item in an array in parallel.
 * @param arr - The array to iterate over.
 * @param cb - The callback function to execute for each item.
 */
export async function forEachAsync<T>(arr: T[], cb: (item: T, index: number) => Promise<void> | void): Promise<void> {
  const promises = arr.map(async (item, index) => await cb(item, index))
  await Promise.allSettled(promises)
}
