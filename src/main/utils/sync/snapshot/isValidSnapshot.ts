import {isObject} from "@shared/utils/common/validators"

export function isValidSnapshot(obj: any): boolean {
  if (!isObject(obj) || !isObject(obj.docs) || !isObject(obj.meta)) return false
  if (typeof obj.meta.updatedAt !== "string" || typeof obj.meta.hash !== "string") return false
  if (obj.version !== 2) return false

  return Array.isArray(obj.docs.tasks) && Array.isArray(obj.docs.tags) && Array.isArray(obj.docs.branches) && Array.isArray(obj.docs.files)
}
