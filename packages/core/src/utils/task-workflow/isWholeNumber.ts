export function isWholeNumber(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}
