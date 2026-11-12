import type {TaskWorkflowState, WorkflowGuidanceDocument} from "@daily/protocol"
import type {TaskWorkflowErrorCode} from "./TaskWorkflowErrorCode"

export class TaskWorkflowError extends Error {
  constructor(
    public readonly code: `${TaskWorkflowErrorCode}`,
    message: string,
    public readonly current: TaskWorkflowState | null = null,
    public readonly currentGuidance: WorkflowGuidanceDocument | null = null,
  ) {
    super(message)
    this.name = "TaskWorkflowError"
  }
}
