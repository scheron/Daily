/**
 * Creates a new function that applies a sequence of transformations from left to right.
 *
 * Each function in the pipeline receives the output of the previous function.
 * The first function receives the initial input value.
 *
 * @example
 * const addOne = (x: number) => x + 1;
 * const double = (x: number) => x * 2;
 * const square = (x: number) => x * x;
 *
 * const transform = pipe(addOne, double, square);
 * transform(3); // ((3 + 1) * 2)² = 64
 *
 * @template T - Type of value being transformed
 * @param fns - Series of transformation functions to apply in sequence
 * @returns Function that applies all transformations from left to right
 */
export function pipe<A, B>(a: (input: A) => B): (input: A) => B
export function pipe<A, B, C>(a: (input: A) => B, b: (input: B) => C): (input: A) => C
export function pipe<A, B, C, D>(a: (input: A) => B, b: (input: B) => C, c: (input: C) => D): (input: A) => D
export function pipe<A, B, C, D, E>(a: (input: A) => B, b: (input: B) => C, c: (input: C) => D, d: (input: D) => E): (input: A) => E
export function pipe(...fns: Function[]) {
  return (input: unknown) => fns.reduce((acc, fn) => fn(acc), input)
}
