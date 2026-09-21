import type {AgentToolErrorCode} from "./AgentToolErrorCode"

/** An agent tool call's refusal, carrying a stable code and the sentence the agent is shown. Not part of the Daily Sync Protocol, so it carries no HTTP status. */
export class AgentToolError extends Error {
  constructor(
    readonly code: AgentToolErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "AgentToolError"
  }
}
