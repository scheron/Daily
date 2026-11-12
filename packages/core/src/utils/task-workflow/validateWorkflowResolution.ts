import {TaskWorkflowError} from "../../errors/task-workflow/TaskWorkflowError"
import {TaskWorkflowErrorCode} from "../../errors/task-workflow/TaskWorkflowErrorCode"

import type {TaskWorkflowRecord} from "@daily/protocol"

export function validateWorkflowResolution(command: TaskWorkflowRecord["command"]): void {
  if (
    command.kind !== "resolve" ||
    !["accepted", "rejected"].includes(command.decision) ||
    [command.taskId, command.proposalId, command.operationId, command.expectedRevision].some((value) => typeof value !== "string" || !value.trim()) ||
    Object.keys(command).some((key) => !["kind", "taskId", "proposalId", "decision", "operationId", "expectedRevision"].includes(key))
  )
    throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "A proposal decision needs its task, proposal, revision and operation IDs.")
}
