type FilterOptions = {
  /** drop null/undefined values from incoming */
  skipNullish?: boolean
  /** if true, allow arrays to pass through as-is (replace behavior) */
  allowArrays?: boolean
}

export function stripUnknown<S>(shape: S, incoming: any, options: FilterOptions = {}): Partial<S> {
  const skipNullish = options.skipNullish ?? false
  const allowArrays = options.allowArrays ?? true

  if (incoming == null) return incoming

  if (Array.isArray(shape)) {
    if (!allowArrays) return undefined as any
    return Array.isArray(incoming) ? (incoming as any) : (undefined as any)
  }

  if (isPlainObject(shape) && isPlainObject(incoming)) {
    const out: any = {}
    for (const key of Object.keys(incoming)) {
      if (!(key in (shape as any))) continue

      const val = incoming[key]
      if (skipNullish && (val === null || val === undefined)) continue

      const shapeVal = (shape as any)[key]
      out[key] = stripUnknown(shapeVal, val, options)
    }
    return out
  }

  return incoming
}

function isPlainObject(x: any): x is Record<string, any> {
  if (x === null || typeof x !== "object") return false
  if (Array.isArray(x)) return false
  const proto = Object.getPrototypeOf(x)
  return proto === Object.prototype || proto === null
}
