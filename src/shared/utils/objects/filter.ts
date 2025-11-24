export function objectFilter<T extends Record<string, any>>(obj: T, filterCb: (value: T[keyof T], key: keyof T) => boolean): Partial<T> {
  const result = {} as Partial<T>

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key]
      if (filterCb(value, key)) {
        result[key] = value
      }
    }
  }

  return result
}
