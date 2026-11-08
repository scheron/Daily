/** The gap of the focus list under `y`: how many of its rows have their middle above it, from 0 up to the row count. */
export function findRowGap(list: HTMLElement | null, y: number): number {
  const rows = Array.from(list?.querySelectorAll("[data-focus-row]") ?? [])
  return rows.filter((row) => {
    const rect = row.getBoundingClientRect()
    return rect.top + rect.height / 2 < y
  }).length
}
