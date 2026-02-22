import {isObject} from "@shared/utils/common/validators"

export function isValidSnapshot(obj: any): boolean {
  return (
    isObject(obj) &&
    isObject(obj.docs) &&
    Array.isArray(obj.docs.tasks) &&
    Array.isArray(obj.docs.tags) &&
    (obj.docs.branches === undefined || Array.isArray(obj.docs.branches)) &&
    Array.isArray(obj.docs.files) &&
    isObject(obj.meta) &&
    typeof obj.meta.updatedAt === "string" &&
    typeof obj.meta.hash === "string"
  )
}
