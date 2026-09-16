import type {Task} from "@daily/protocol"

/** Whether two task id lists contain the same set of ids, regardless of order. */
export function sameIds(a: Task["id"][], b: Task["id"][]): boolean {
  if (a.length !== b.length) return false
  const bIds = new Set(b)
  return a.every((id) => bIds.has(id))
}
