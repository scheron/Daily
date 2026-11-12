import {TaskWorkflowError} from "../../errors/task-workflow/TaskWorkflowError"
import {TaskWorkflowErrorCode} from "../../errors/task-workflow/TaskWorkflowErrorCode"

export function invalidRecord(reason: string): never {
  throw new TaskWorkflowError(
    TaskWorkflowErrorCode.InvalidRequest,
    `Invalid workflow record: ${reason}. Sync stops without discarding history; repair the source snapshot before retrying.`,
  )
}
