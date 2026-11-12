import {TaskWorkflowError} from "../../errors/task-workflow/TaskWorkflowError"
import {TaskWorkflowErrorCode} from "../../errors/task-workflow/TaskWorkflowErrorCode"
import {isWholeNumber} from "./isWholeNumber"

export function validateWorkflowTimeMetadata(spentTime: number, baseline: number): void {
  if (!isWholeNumber(spentTime) || !isWholeNumber(baseline))
    throw new TaskWorkflowError(
      TaskWorkflowErrorCode.InvalidRequest,
      "Invalid workflow task time metadata: spent time and baseline must be finite nonnegative whole seconds. Sync stops without discarding history.",
    )
}
