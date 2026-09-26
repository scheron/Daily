/**
 * Reduces a task's markdown content to one line of plain text, for places that cannot render markdown.
 * @example
 * toTaskTitle("# Ship **promo** codes\nmore") // "Ship promo codes"
 */
export function toTaskTitle(content: string): string {
  const line = content.split("\n").find((candidate) => candidate.trim().length > 0)
  if (!line) return ""

  let title = stripLeadingMarkers(line.trim())
  title = title.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
  title = title.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  title = title.replace(/\*\*|__|~~|`/g, "")

  return title.trim()
}

function stripLeadingMarkers(line: string): string {
  const leadingMarkerPatterns = [/^#{1,6} /, /^> /, /^(?:[-*+] |\d+\. )/, /^\[[ xX]\] /]

  let title = line
  let stripped = true

  while (stripped) {
    stripped = false
    for (const pattern of leadingMarkerPatterns) {
      if (pattern.test(title)) {
        title = title.replace(pattern, "")
        stripped = true
        break
      }
    }
  }

  return title
}
