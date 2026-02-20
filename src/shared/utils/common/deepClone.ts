type AnyRecord = Record<string, any>

/**
 * Deep clone
 * - primitives, arrays, plain objects
 * - Map, Set, ArrayBuffer, TypedArray, DataView
 * - Date, RegExp
 */
export function deepClone<T>(value: T, cache = new WeakMap<AnyRecord, any>()): T {
  try {
    if (value === null || typeof value !== "object") return value

    if (typeof value === "function") return value

    // Circular refs
    const cached = cache.get(value as any)
    if (cached) return cached

    if (Array.isArray(value)) {
      const arr: any[] = new Array(value.length)
      cache.set(value as any, arr)
      for (let i = 0; i < value.length; i++) arr[i] = deepClone((value as any)[i], cache)
      return arr as any
    }

    if (value instanceof Date) return new Date(value.getTime()) as any

    if (value instanceof RegExp) {
      const re = new RegExp(value.source, value.flags)
      ;(re as any).lastIndex = value.lastIndex
      return re as any
    }

    if (value instanceof Map) {
      const m = new Map()
      cache.set(value as any, m)
      for (const [k, v] of value.entries()) {
        m.set(deepClone(k as any, cache), deepClone(v as any, cache))
      }
      return m as any
    }

    if (value instanceof Set) {
      const s = new Set()
      cache.set(value as any, s)
      for (const v of value.values()) s.add(deepClone(v as any, cache))
      return s as any
    }

    if (value instanceof ArrayBuffer) {
      const buf = value.slice(0)
      // no need to cache; ArrayBuffer can't self-reference meaningfully
      return buf as any
    }

    if (ArrayBuffer.isView(value)) {
      // TypedArray / DataView
      if (value instanceof DataView) {
        const dv = new DataView(value.buffer.slice(0), value.byteOffset, value.byteLength)
        return dv as any
      }
      const Ctor = (value as any).constructor
      return new Ctor(value) as any
    }

    // Only deep-clone plain objects. Class instances are returned as-is (safe default).
    if (isPlainObject(value)) {
      const out: AnyRecord = {}
      cache.set(value as any, out)
      for (const key of Object.keys(value as AnyRecord)) {
        out[key] = deepClone((value as AnyRecord)[key], cache)
      }
      return out as any
    }

    return value
  } catch (error) {
    console.error("Error in deepCopy:", error)
    return value
  }
}

function isPlainObject(value: any): value is AnyRecord {
  if (value === null || typeof value !== "object") return false
  if (Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
