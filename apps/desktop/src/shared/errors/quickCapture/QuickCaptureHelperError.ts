import type {QuickCaptureHelperErrorCode} from "./QuickCaptureHelperErrorCode"

/** Raised on either end of the channel between Daily and the quick-capture helper process. */
export class QuickCaptureHelperError extends Error {
  constructor(
    readonly code: QuickCaptureHelperErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "QuickCaptureHelperError"
  }
}
