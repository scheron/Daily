export function arrayRemoveDuplicates<T extends Record<K, string>, K extends keyof T>(array: T[], key: K): T[] {
  const seen = new Set<string>()

  return array.filter((item) => {
    const value = item[key]

    if (seen.has(value)) return false

    seen.add(value)

    return true
  })
}
