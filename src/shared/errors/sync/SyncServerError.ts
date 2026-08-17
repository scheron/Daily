import type {SyncServerErrorCode} from "./SyncServerErrorCode"

/** A failure raised by the desktop half of the Daily Sync Server integration, before or outside any protocol response. */
export class SyncServerError extends Error {
  constructor(
    readonly code: SyncServerErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "SyncServerError"
  }
}
