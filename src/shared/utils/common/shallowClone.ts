type AnyRecord = Record<string, any>

/**
 * Shallow clone.
 * - Arrays: [...arr]
 * - Plain objects: { ...obj }
 * - Map, Set, Date, RegExp: new Map(map) / new Set(set) / new Date(date) / new RegExp(regexp)
 */
export function shallowClone<T>(value: T): T {
  try {
    if (value === null || typeof value !== "object") return value

    if (Array.isArray(value)) return value.slice() as any

    if (value instanceof Date) return new Date(value.getTime()) as any
    if (value instanceof RegExp) return new RegExp(value.source, value.flags) as any

    if (value instanceof Map) return new Map(value) as any
    if (value instanceof Set) return new Set(value) as any

    if (value instanceof ArrayBuffer) return value.slice(0) as any
    if (ArrayBuffer.isView(value)) {
      if (value instanceof DataView) return new DataView(value.buffer.slice(0), value.byteOffset, value.byteLength) as any
      const Ctor = (value as any).constructor
      return new Ctor(value) as any
    }

    if (isPlainObject(value)) return {...(value as AnyRecord)} as any

    return value
  } catch (error) {
    console.error("Error in shallowCopy:", error)
    return value
  }
}

function isPlainObject(value: any): value is AnyRecord {
  if (value === null || typeof value !== "object") return false
  if (Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
