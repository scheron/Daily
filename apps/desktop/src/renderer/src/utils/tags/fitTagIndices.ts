export function fitTagIndices(widths: number[], availableWidth: number, gap: number, moreWidth: number): number[] {
  const allTagsWidth = widths.reduce((total, width) => total + width, 0) + Math.max(0, widths.length - 1) * gap
  if (allTagsWidth <= availableWidth) return widths.map((_, index) => index)

  const visibleIndices: number[] = []
  let usedWidth = moreWidth

  for (let index = 0; index < widths.length; index++) {
    const nextWidth = usedWidth + gap + widths[index]
    if (nextWidth > availableWidth) continue
    visibleIndices.push(index)
    usedWidth = nextWidth
  }

  return visibleIndices
}
