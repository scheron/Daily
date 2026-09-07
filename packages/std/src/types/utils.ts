type Identity<T> = {[P in keyof T]: T[P]}

/**
 * Creates a new type by renaming a property key `KOld` in type `T` to a new key `KNew`.
 * The value type remains the same.
 *
 * @template T - The source object type
 * @template KOld - The key in T to rename
 * @template KNew - The new key name
 * @example
 * type Foo = { a: number, b: string }
 * type Bar = Rename<Foo, "a", "x"> // { b: string, x: number }
 */
export type ReplaceKey<T, KOld extends keyof T, KNew extends PropertyKey> = Omit<T, KOld> & {[P in KNew]: T[KOld]}

/**
 * Creates a new type by replacing the value of a property key `K` in type `T`
 * with a new value of type `TReplace`.
 *
 * @template T - The source object type
 * @template K - The key in T to replace
 * @template TReplace - The value type for the new key
 * @example
 * type Foo = { a: number, b: string }
 * type Bar = ReplaceValue<Foo, "a", boolean> // { a: boolean, b: string }
 */
export type ReplaceValue<T, K extends keyof T, TReplace> = Identity<Omit<T, K> & {[P in K]: TReplace}>

/**
 * Creates a new type by replacing the property key `OldKey` in type `T`
 * with a new property `NewKey` of type `NewValue`.
 *
 * @template T - The source object type
 * @template OldKey - The key in T to replace
 * @template NewKey - The new key name
 * @template NewValue - The value type for the new key
 * @example
 * type Foo = { a: number, b: string }
 * type Bar = Replace<Foo, "a", "x", boolean> // { x: boolean, b: string }
 */
export type Replace<T, OldKey extends keyof T, NewKey extends PropertyKey, NewValue> = {
  [K in keyof T as K extends OldKey ? NewKey : K]: K extends OldKey ? NewValue : T[K]
}
