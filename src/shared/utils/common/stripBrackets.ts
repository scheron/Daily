const DEFAULT_BRACKET_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
  ["<", ">"],
]

/**
 * Removes one matching outer bracket pair wrapping a string (`[..]`, `(..)`,
 * `{..}`, `<..>` by default). Returns the input unchanged when it isn't wrapped.
 *
 * @example stripBrackets("[::1]") // "::1"
 * @example stripBrackets("(foo)") // "foo"
 */
export function stripBrackets(value: string, pairs: ReadonlyArray<readonly [string, string]> = DEFAULT_BRACKET_PAIRS): string {
  for (const [open, close] of pairs) {
    if (value.length >= open.length + close.length && value.startsWith(open) && value.endsWith(close)) {
      return value.slice(open.length, value.length - close.length)
    }
  }
  return value
}
