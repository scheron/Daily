import {isArray, isObject, isString} from "@shared/utils/common/validators"

import type {Snapshot} from "@/types/sync"

export function isValidSnapshot<T extends Snapshot>(obj: T): boolean {
  if (!isObject(obj) || !isObject(obj.docs) || !isObject(obj.meta)) return false
  if (!isString(obj.meta.updatedAt) || !isString(obj.meta.hash)) return false
  if (obj.version !== 2 && obj.version !== 3 && obj.version !== 4) return false

  return isArray(obj.docs.tasks) && isArray(obj.docs.tags) && isArray(obj.docs.branches) && isArray(obj.docs.files)
}
