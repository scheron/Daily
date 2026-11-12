import type {TaskWorkflowState, WorkflowGuidanceDocument} from "@daily/protocol"

export class TaskWorkflowError extends Error {
  constructor(
    public readonly code: "not_found" | "conflict" | "stale_revision" | "forbidden" | "invalid_request" | "session_expired",
    message: string,
    public readonly current: TaskWorkflowState | null = null,
    public readonly currentGuidance: WorkflowGuidanceDocument | null = null,
  ) {
    super(message)
    this.name = "TaskWorkflowError"
  }
}
