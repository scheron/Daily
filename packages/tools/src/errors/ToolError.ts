import type {ToolErrorCode} from "./ToolErrorCode"

/** A shared tool call's refusal, carrying a stable code and the sentence the caller is shown. Not part of the Daily Sync Protocol, so it carries no HTTP status. */
export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "ToolError"
  }
}
