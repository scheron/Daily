import {sort} from "fast-sort"

import type {Tag} from "../../types/storage"

export function sortTags(tags: Tag[]): Tag[] {
  return sort(tags).asc((tag) => tag.name)
}
