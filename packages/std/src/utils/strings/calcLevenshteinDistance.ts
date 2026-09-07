/**
 * Calculate the Levenshtein distance between two strings
 * @param str1 - The first string
 * @param str2 - The second string
 * @returns The Levenshtein distance
 * @example
 * ```ts
 * calcLevenshteinDistance("kitten", "sitting") // 3
 * calcLevenshteinDistance("flaw", "lawn") // 2
 * calcLevenshteinDistance("test", "test") // 0
 * ```
 */
export function calcLevenshteinDistance(str1: string, str2: string): number {
  if (str1 === str2) return 0

  let m = str1.length
  let n = str2.length

  if (m === 0) return n
  if (n === 0) return m

  // Ensure that str1 is the shorter string to minimize memory usage
  if (m > n) {
    ;[str1, str2] = [str2, str1]
    ;[m, n] = [n, m]
  }

  // prev[i] = distance between prefix(str1[0..i-1]) and prefix(str2[0..j-1]) on the previous step by j
  let prev: number[] = new Array(m + 1)
  let curr: number[] = new Array(m + 1)

  // Initialize the first row: distance to the empty string str2[0..0]
  for (let i = 0; i <= m; i++) {
    prev[i] = i
  }

  // Main loop by characters of str2
  for (let j = 1; j <= n; j++) {
    // curr[0] = distance from the empty str1 to prefix str2[0..j-1] = j
    curr[0] = j
    const char2 = str2[j - 1]

    for (let i = 1; i <= m; i++) {
      const char1 = str1[i - 1]
      const cost = char1 === char2 ? 0 : 1

      curr[i] = Math.min(
        prev[i] + 1, // deletion
        curr[i - 1] + 1, // insertion
        prev[i - 1] + cost, // substitution
      )
    }

    ;[prev, curr] = [curr, prev]
  }

  // In prev is now the last "row" of DP
  return prev[m]
}
