import type {WebFetchErrorCode} from "./WebFetchErrorCode"

/**
 * Raised by the web-read pipeline. Caught in SafeWebFetcher / readUrl and
 * mapped to a ToolResult error the model relays to the user.
 */
export class WebFetchError extends Error {
  constructor(
    readonly code: WebFetchErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "WebFetchError"
  }
}
