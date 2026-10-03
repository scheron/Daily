import type {QuickTaskErrorCode} from "./QuickTaskErrorCode"

/** Raised on either end of the channel between Daily and the Quick task process. */
export class QuickTaskError extends Error {
  constructor(
    readonly code: QuickTaskErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "QuickTaskError"
  }
}
