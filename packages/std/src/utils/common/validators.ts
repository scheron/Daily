function getTag(value: unknown): string {
  if (value === null) return "[object Null]"
  if (value === undefined) return "[object Undefined]"
  return Object.prototype.toString.call(value)
}

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

export function isArray(item: unknown): item is unknown[] {
  return Array.isArray(item)
}

export function isPrimitive(item: unknown): item is string | number | boolean {
  return typeof item === "string" || typeof item === "number" || typeof item === "boolean"
}

export function isUndefined(value: unknown): value is undefined {
  return value === undefined
}

export function isNull(value: unknown): value is null {
  return value === null
}

export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

export function notNullish<T>(v: T | null | undefined): v is NonNullable<T> {
  return v != null
}

export function notNull<T>(v: T | null): v is Exclude<T, null> {
  return v !== null
}

export function notUndefined<T>(v: T): v is Exclude<T, undefined> {
  return v !== undefined
}

export function isObjectLike(value: unknown): value is object {
  return typeof value === "object" && value !== null
}

export function isObject<T extends object = object>(value: unknown): value is T {
  // more safer than typeof value === "object" && value !== null && !Array.isArray(value)
  // because it checks the exact type of the value(skip new RegExp, new Date, etc.)
  return getTag(value) === "[object Object]"
}

export function isPositive(value: unknown): value is number {
  return typeof value === "number" && value > 0
}
