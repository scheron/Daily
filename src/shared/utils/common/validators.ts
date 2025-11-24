export function isFunction(item: unknown): item is Function {
  return typeof item === "function"
}

export function isString(item: unknown): item is string {
  return typeof item === "string"
}

export function isNumber(item: unknown): item is number {
  return typeof item === "number"
}

export function isBoolean(item: unknown): item is boolean {
  return typeof item === "boolean"
}

export function isObject(item: unknown): item is Record<string, unknown> {
  return typeof item === "object" && item !== null && !Array.isArray(item)
}

export function isArray(item: unknown): item is unknown[] {
  return Array.isArray(item)
}

export function isNull(item: unknown): item is null {
  return item === null
}

export function isNullOrUndefined(item: unknown): item is null {
  return item == null
}

export function isUndefined(item: unknown): item is undefined {
  return item === undefined
}

export function isPrimitive(item: unknown): item is string | number | boolean {
  return typeof item === "string" || typeof item === "number" || typeof item === "boolean"
}
