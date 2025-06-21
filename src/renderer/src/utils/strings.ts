export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

type Position = "before" | "after" | "middle"

export function truncate(text: string, length: number = 10, pos: Position = "after", ellipsis = "..."): string {
  if (text.length <= length) return text
  if (length <= 0) return ellipsis

  if (pos === "before") return ellipsis + text.slice(-length)
  if (pos === "after") return text.slice(0, length) + ellipsis

  const halfLength = Math.floor(length / 2)
  return text.slice(0, halfLength) + ellipsis + text.slice(-halfLength)
}
