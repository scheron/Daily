import {deepClone} from "../common/deepClone"

export function objectUpdateValue<T>(obj: T, key: keyof T, value: T[keyof T]): T {
  const newObj = deepClone(obj)
  newObj[key] = value
  return newObj
}
