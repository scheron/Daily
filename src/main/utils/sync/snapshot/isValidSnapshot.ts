import {isObject} from "@shared/utils/common/validators"

export function isValidSnapshot(obj: any): boolean {
  if (!isObject(obj) || !isObject(obj.docs) || !isObject(obj.meta)) return false
  if (typeof obj.meta.updatedAt !== "string" || typeof obj.meta.hash !== "string") return false

  // V2: version === 2
  if (obj.version === 2) {
    return Array.isArray(obj.docs.tasks) && Array.isArray(obj.docs.tags) && Array.isArray(obj.docs.branches) && Array.isArray(obj.docs.files)
  }

  // V1: no version field or version !== 2
  return (
    Array.isArray(obj.docs.tasks) &&
    Array.isArray(obj.docs.tags) &&
    (obj.docs.branches === undefined || Array.isArray(obj.docs.branches)) &&
    Array.isArray(obj.docs.files)
  )
}
