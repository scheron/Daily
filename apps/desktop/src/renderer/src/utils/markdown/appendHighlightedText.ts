export type MarkdownOffsetRange = [from: number, to: number]

/** Ranges are half-open UTF-16 offsets within the rendered text. */
export function appendHighlightedText(parent: HTMLElement, text: string, ranges: readonly MarkdownOffsetRange[]) {
  let cursor = 0
  for (const [from, to] of ranges) {
    if (cursor < from) parent.append(text.slice(cursor, from))
    const mark = document.createElement("span")
    mark.className = "markdown-search-highlight"
    mark.textContent = text.slice(from, to)
    parent.append(mark)
    cursor = to
  }
  if (cursor < text.length) parent.append(text.slice(cursor))
}
