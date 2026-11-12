import {TaskWorkflowError} from "../../errors/task-workflow/TaskWorkflowError"
import {TaskWorkflowErrorCode} from "../../errors/task-workflow/TaskWorkflowErrorCode"
import {isObject} from "./isObject"

import type {WorkflowGuidanceUpdate} from "@daily/protocol"

export function validateWorkflowGuidanceUpdate(update: WorkflowGuidanceUpdate): void {
  const scope = update?.scope
  if (
    !isObject(update) ||
    !isObject(scope) ||
    (scope.kind !== "workspace" && scope.kind !== "project") ||
    (scope.kind === "project" && (typeof scope.projectId !== "string" || !scope.projectId.trim())) ||
    Object.keys(scope).some((key) => !(scope.kind === "project" ? ["kind", "projectId"] : ["kind"]).includes(key)) ||
    typeof update.content !== "string" ||
    update.content.length > 100000 ||
    (typeof update.allowCompletion !== "boolean" && !(scope.kind === "project" && update.allowCompletion === null)) ||
    [update.operationId, update.expectedRevision].some((value) => typeof value !== "string" || !value.trim()) ||
    Object.keys(update).some((key) => !["scope", "content", "allowCompletion", "operationId", "expectedRevision"].includes(key))
  )
    throw new TaskWorkflowError(
      TaskWorkflowErrorCode.InvalidRequest,
      "Guidance requires a valid scope, text, completion permission, operation and revision.",
    )
}
