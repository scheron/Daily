export function arrayRemoveDuplicates<T extends Record<K, string>, K extends keyof T>(array: T[], key: K): T[] {
  const seen = new Set<string>()

  return array.filter((item) => {
    const value = item[key]

    if (seen.has(value)) return false

    seen.add(value)

    return true
  })
}

/**
 * Executes a callback function for each item in an array in parallel.
 * @param arr - The array to iterate over.
 * @param cb - The callback function to execute for each item.
 */
export async function forEachAsync<T>(arr: T[], cb: (item: T, index: number) => Promise<void> | void): Promise<void> {
  const promises = arr.map(async (item, index) => await cb(item, index))
  await Promise.allSettled(promises)
}
