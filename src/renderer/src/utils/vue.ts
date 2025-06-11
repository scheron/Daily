import {isProxy, isReactive, isRef, toRaw} from "vue"

export function toRawDeep<T>(sourceObj: T): T {
  const objectIterator = <U>(input: U): U => {
    if (Array.isArray(input)) return input.map((item) => objectIterator(item)) as U

    if (isRef(input) || isReactive(input) || isProxy(input)) {
      return objectIterator(toRaw(input))
    }

    if (input && typeof input === "object") {
      return Object.keys(input as object).reduce<Record<string, any>>((acc, key) => {
        acc[key] = objectIterator((input as Record<string, any>)[key])
        return acc
      }, {}) as U
    }

    return input
  }

  return objectIterator(sourceObj)
}
