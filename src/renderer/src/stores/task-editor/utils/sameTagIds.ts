import {sort} from "fast-sort"

import type {Tag} from "@shared/types/storage"

/**
 * Whether two tag lists contain the same set of tag ids, regardless of order.
 * @example sameTagIds([{id: "a"}], [{id: "a"}]) // true
 */
export function sameTagIds(a: Tag[], b: Tag[]): boolean {
  if (a.length !== b.length) return false
  const aIds = sort(a.map((t) => t.id)).asc()
  const bIds = sort(b.map((t) => t.id)).asc()
  return aIds.every((id, i) => id === bIds[i])
}
