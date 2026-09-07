/** Hard limits for the web-read pipeline. */
export const WEB_LIMITS = {
  /** End-to-end request timeout. */
  timeoutMs: 10_000,
  /** Max bytes drained from a response body before aborting. */
  maxBytes: 2 * 1024 * 1024,
  /** Max redirect hops, each re-validated by the SSRF guard. */
  maxRedirects: 5,
  /** Max characters of extracted text handed to the model in one window. */
  maxTextChars: 16_000,
  /** Max characters of the full extracted text kept in the page cache. */
  maxCacheChars: 1_000_000,
  /** Max characters of a single page that may be delivered to the model (context budget across windows). */
  maxServedCharsPerPage: 48_000,
  /** Below this many extracted chars the page is treated as an empty shell. */
  emptyShellThreshold: 64,
  /** Page cache: max entries kept. */
  pageCacheEntries: 8,
  /** Page cache: entry time-to-live. */
  pageCacheTtlMs: 10 * 60_000,
} as const

/** Response Content-Type prefixes the pipeline will read. */
export const ALLOWED_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain", "text/markdown", "application/json"] as const

/** Tuning for scaling a page's read budget to the model's context window. */
export const WEB_READ_BUDGET = {
  charsPerToken: 4,
  servedFraction: 0.25,
  windowFraction: 0.1,
  minServed: 4_000,
  maxServed: 120_000,
  minWindow: 2_000,
  maxWindow: 24_000,
} as const
