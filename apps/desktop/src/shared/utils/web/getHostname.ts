/**
 * Extracts the hostname from a URL string, returning the input unchanged when
 * it cannot be parsed.
 *
 * @example getHostname("https://example.com/x?d=1") // "example.com"
 */
export function getHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
