export function compareVersions(left: string, right: string): number {
  const [leftMain, leftPre = ""] = left.split("-", 2)
  const [rightMain, rightPre = ""] = right.split("-", 2)
  const leftParts = leftMain.split(".").map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = rightMain.split(".").map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }

  if (!leftPre && !rightPre) return 0
  if (!leftPre) return 1
  if (!rightPre) return -1

  return leftPre.localeCompare(rightPre, undefined, {numeric: true})
}
