/**
 * Recursively merges two objects/arrays.
 *
 * For objects: recursively merges matching keys.
 * For arrays: if every element in the source array is a mergeable object for which `getId`
 *            returns a defined value, then each element is merged into the target array based on matching ids.
 *            Otherwise, the source array replaces the target array.
 *
 * @param target - The target object to merge into.
 * @param source - The source object with updates.
 * @param getId  - A function that returns the unique identifier for an object in the source array. Defaults to extracting "id".
 * @returns The merged target object.
 */
export function deepMerge<T>(target: T, source: Partial<T>, getId: (data: any) => any = (data: any) => data.id): T {
  try {
    if (!source) return target
    if (!target) return source as T

    if (Array.isArray(target) && Array.isArray(source)) {
      const hasIds = source.every((item) => isMergeableObject(item) && getId(item) !== undefined)

      if (hasIds) {
        const targetMap = new Map(target.filter(isMergeableObject).map((item) => [getId(item), item]))

        source.forEach((srcItem) => {
          const srcId = getId(srcItem)
          const targetItem = targetMap.get(srcId)

          if (targetItem) deepMerge(targetItem, srcItem, getId)
          else target.push(srcItem as any)
        })

        return target
      }

      return source as unknown as T
    }

    if (isMergeableObject(target) && isMergeableObject(source)) {
      for (const key in source) {
        const value = source[key]
        const targetValue = (target as any)[key]

        const canMerge =
          targetValue && (isMergeableObject(targetValue) || Array.isArray(targetValue)) && (isMergeableObject(value) || Array.isArray(value))

        if (canMerge) {
          ;(target as any)[key] = deepMerge(targetValue, value, getId)
        } else {
          ;(target as any)[key] = value
        }
      }
      return target
    }

    return source as unknown as T
  } catch (error) {
    console.error("Error in deepMerge:", error)
    return target
  }
}

function isMergeableObject(item: any): item is Record<string, any> {
  return item !== null && typeof item === "object" && !Array.isArray(item)
}
