export type LookupResult = {address: string; family: number}
export type LookupFn = (hostname: string) => Promise<LookupResult[]>

export type SafeFetchResult = {finalUrl: string; contentType: string; body: string}

export type TextWindow = {
  window: string
  start: number
  end: number
  total: number
  hasMore: boolean
  /** When `find` is used: the index of the match, else null. */
  matchIndex: number | null
  /** When `find` is used: whether a match was found (always true otherwise). */
  found: boolean
}

export type WindowOptions = {
  /** Character index to start the window at (default 0). */
  offset?: number
  /** Case-insensitive substring to jump to; the window starts at the match. */
  find?: string
  /** Window size in characters. */
  size: number
}

export type WebReadBudget = {
  /** Chars returned in one window. */
  windowChars: number
  /** Total chars of one page that may be delivered to the model. */
  maxServedChars: number
}

export type CachedPage = {
  finalUrl: string
  title: string | null
  text: string
  /** Mutable: total chars of this page already delivered to the model (per-page context budget). */
  served: number
}
