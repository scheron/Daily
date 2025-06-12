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

/**
 * Gets a nested value from an object using a path string with a delimiter
 * @example
 * const obj = { foo: { bar: { baz: 123 } } }
 * getObjectValueFromPath(obj, "foo.bar.baz") // returns 123
 * getObjectValueFromPath(obj, "foo.bar") // returns { baz: 123 }
 * getObjectValueFromPath(obj, "foo-bar-baz", "-") // returns 123
 * 
 * @template T The type of the value to return
 * @param {Record<string, any>} obj - The object to get the value from
 * @param {string} path - The path to the value, separated by the delimiter
 * @param {string} [delimiter="."] - The character that separates the path parts
 * @returns {T | undefined} The value at the path, or undefined if not found
 */
export function getObjectValueFromPath<T>(obj: Record<string, any>, path: string, delimiter = "."): T | undefined {
  if (!obj || !path) return

  const parts = path.split(delimiter)

  const getValue = <T>(obj: Record<string, any>, pathParts: string[]): T | undefined => {
    if (!obj || !pathParts.length) return obj as T

    const [firstPart, ...restParts] = pathParts

    if (!restParts.length) return obj[firstPart] as T

    if (!(firstPart in obj) || typeof obj[firstPart] !== "object" || obj[firstPart] === null) return

    return getValue<T>(obj[firstPart], restParts)
  }

  return getValue<T>(obj, parts)
}

/**
 * Creates a nested object from a path string and a value
 * @example
 * transformObjectFromPath("foo.bar.baz", 123) // returns { foo: { bar: { baz: 123 } } }
 * transformObjectFromPath("foo.bar", { baz: 123 }) // returns { foo: { bar: { baz: 123 } } }
 * transformObjectFromPath("foo-bar-baz", 123, "-") // returns { foo: { bar: { baz: 123 } } }
 * 
 * @template T The type of the value to set
 * @param {string} path - The path where to set the value, separated by the delimiter
 * @param {T} value - The value to set at the path
 * @param {string} [delimiter="."] - The character that separates the path parts
 * @returns {Record<string, any>} The resulting nested object
 */
export function transformObjectFromPath<T>(path: string, value: T, delimiter = "."): Record<string, any> {
  if (!path) return {}

  const parts = path.split(delimiter)
  const result: Record<string, any> = {}
  let current = result

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (i === parts.length - 1) {
      current[part] = value
    } else {
      current[part] = {}
      current = current[part]
    }
  }

  return result
}
