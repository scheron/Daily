/**
 * Signals that a request must NOT be retried even if the surrounding retry
 * loop would normally back off and try again. Used by API clients to short-
 * circuit retry on permanent failures (4xx, auth, etc.).
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NonRetryableError"
  }
}
